"use strict";

const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const { config } = require("../config/env");

function toNumber(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 4) {
    return Number(toNumber(value).toFixed(digits));
}

function calculateStatistics(readings) {
    const validReadings = Array.isArray(readings) ? readings : [];

    const totalEnergyKwh = validReadings.reduce(
        (sum, reading) => sum + toNumber(reading.energyKwh),
        0
    );

    const totalPowerWatts = validReadings.reduce(
        (sum, reading) => sum + toNumber(reading.powerWatts),
        0
    );

    return {
        readingCount: validReadings.length,
        totalEnergyKwh: round(totalEnergyKwh, 8),
        averagePowerWatts: validReadings.length
            ? round(totalPowerWatts / validReadings.length, 2)
            : 0,
        estimatedCost: round(
            totalEnergyKwh * toNumber(config.costPerKwh),
            2
        ),
        currency: "INR"
    };
}

async function aggregateEnergyStatistics(match) {
    const results = await getCollection(COLLECTIONS.READINGS)
        .aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    readingCount: { $sum: 1 },
                    totalEnergyKwh: {
                        $sum: {
                            $convert: {
                                input: "$energyKwh",
                                to: "double",
                                onError: 0,
                                onNull: 0
                            }
                        }
                    },
                    averagePowerWatts: {
                        $avg: {
                            $convert: {
                                input: "$powerWatts",
                                to: "double",
                                onError: 0,
                                onNull: 0
                            }
                        }
                    },
                    maximumPowerWatts: {
                        $max: {
                            $convert: {
                                input: "$powerWatts",
                                to: "double",
                                onError: 0,
                                onNull: 0
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    readingCount: 1,
                    totalEnergyKwh: { $round: ["$totalEnergyKwh", 8] },
                    averagePowerWatts: { $round: ["$averagePowerWatts", 2] },
                    maximumPowerWatts: { $round: ["$maximumPowerWatts", 2] }
                }
            }
        ])
        .toArray();

    const result = results[0] || {
        readingCount: 0,
        totalEnergyKwh: 0,
        averagePowerWatts: 0,
        maximumPowerWatts: 0
    };

    const totalEnergyKwh = toNumber(result.totalEnergyKwh);

    return {
        readingCount: toNumber(result.readingCount),
        totalEnergyKwh,
        averagePowerWatts: toNumber(result.averagePowerWatts),
        maximumPowerWatts: toNumber(result.maximumPowerWatts),
        estimatedCost: round(
            totalEnergyKwh * toNumber(config.costPerKwh),
            2
        ),
        currency: "INR"
    };
}

async function getDashboardStatistics(homeId) {
    const readings = getCollection(COLLECTIONS.READINGS);
    const appliances = getCollection(COLLECTIONS.APPLIANCES);
    const alerts = getCollection(COLLECTIONS.ALERTS);
    const jobs = getCollection(COLLECTIONS.JOBS);

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const todayIso = startOfToday.toISOString();

    const [
        totalReadings,
        todayStatistics,
        historicalStatistics,
        activeAppliances,
        unreadAlerts,
        pendingJobs,
        latestReadings
    ] = await Promise.all([
        readings.countDocuments({ homeId }),

        aggregateEnergyStatistics({
            homeId,
            timestamp: { $gte: todayIso }
        }),

        aggregateEnergyStatistics({ homeId }),

        appliances.countDocuments({
            homeId,
            status: "active"
        }),

        alerts.countDocuments({
            homeId,
            status: "unread"
        }),

        jobs.countDocuments({
            homeId,
            status: "pending",
            type: { $ne: "WORKER_HEARTBEAT" }
        }),

        readings.find(
            { homeId },
            {
                projection: {
                    _id: 0,
                    readingId: 1,
                    applianceId: 1,
                    powerWatts: 1,
                    energyKwh: 1,
                    timestamp: 1
                }
            }
        )
            .sort({ timestamp: -1 })
            .limit(10)
            .toArray()
    ]);

    return {
        totalReadings: toNumber(totalReadings),
        activeAppliances: toNumber(activeAppliances),
        unreadAlerts: toNumber(unreadAlerts),
        pendingBackgroundJobs: toNumber(pendingJobs),
        today: todayStatistics,
        historical: historicalStatistics,
        totalRecordedEnergyKwh: historicalStatistics.totalEnergyKwh,
        estimatedTotalCost: historicalStatistics.estimatedCost,
        averageRecordedPowerWatts: historicalStatistics.averagePowerWatts,
        maximumRecordedPowerWatts: historicalStatistics.maximumPowerWatts,
        latestReadings
    };
}

async function getApplianceConsumption(homeId) {
    return getCollection(COLLECTIONS.READINGS)
        .aggregate([
            { $match: { homeId } },
            {
                $group: {
                    _id: "$applianceId",
                    readingCount: { $sum: 1 },
                    totalEnergyKwh: {
                        $sum: {
                            $convert: {
                                input: "$energyKwh",
                                to: "double",
                                onError: 0,
                                onNull: 0
                            }
                        }
                    },
                    averagePowerWatts: {
                        $avg: {
                            $convert: {
                                input: "$powerWatts",
                                to: "double",
                                onError: 0,
                                onNull: 0
                            }
                        }
                    },
                    maximumPowerWatts: {
                        $max: {
                            $convert: {
                                input: "$powerWatts",
                                to: "double",
                                onError: 0,
                                onNull: 0
                            }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: COLLECTIONS.APPLIANCES,
                    let: { currentApplianceId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$applianceId", "$$currentApplianceId"] },
                                        { $eq: ["$homeId", homeId] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                name: 1,
                                category: 1,
                                status: 1,
                                source: 1,
                                datasetChannel: 1,
                                datasetHouse: 1
                            }
                        }
                    ],
                    as: "appliance"
                }
            },
            {
                $project: {
                    _id: 0,
                    applianceId: "$_id",
                    name: {
                        $ifNull: [
                            { $arrayElemAt: ["$appliance.name", 0] },
                            "$_id"
                        ]
                    },
                    category: {
                        $ifNull: [
                            { $arrayElemAt: ["$appliance.category", 0] },
                            "Other"
                        ]
                    },
                    status: {
                        $ifNull: [
                            { $arrayElemAt: ["$appliance.status", 0] },
                            "active"
                        ]
                    },
                    source: {
                        $ifNull: [
                            { $arrayElemAt: ["$appliance.source", 0] },
                            "Unknown"
                        ]
                    },
                    datasetHouse: {
                        $arrayElemAt: ["$appliance.datasetHouse", 0]
                    },
                    datasetChannel: {
                        $arrayElemAt: ["$appliance.datasetChannel", 0]
                    },
                    readingCount: 1,
                    totalEnergyKwh: { $round: ["$totalEnergyKwh", 8] },
                    estimatedCost: {
                        $round: [
                            {
                                $multiply: [
                                    "$totalEnergyKwh",
                                    toNumber(config.costPerKwh)
                                ]
                            },
                            2
                        ]
                    },
                    averagePowerWatts: { $round: ["$averagePowerWatts", 2] },
                    maximumPowerWatts: { $round: ["$maximumPowerWatts", 2] }
                }
            },
            { $sort: { totalEnergyKwh: -1 } }
        ])
        .toArray();
}

module.exports = {
    calculateStatistics,
    aggregateEnergyStatistics,
    getDashboardStatistics,
    getApplianceConsumption
};