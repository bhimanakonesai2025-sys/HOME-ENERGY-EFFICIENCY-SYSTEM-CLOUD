"use strict";

const express = require("express");

const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const { requireAuth } = require("../middleware/auth");
const { getOwnedHome } = require("../services/energyService");
const { config } = require("../config/env");

const router = express.Router();

router.use(requireAuth);

const COST_PER_KWH = Number(config.costPerKwh) || 8;

/**
 * Calculate estimated electricity cost.
 */
function costFor(energyKwh) {
    return Number(
        (Number(energyKwh || 0) * COST_PER_KWH).toFixed(2)
    );
}

/**
 * Safely convert values to numbers.
 */
function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

/**
 * Convert supported timestamp values to Date objects.
 */
function parseTimestamp(value) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (value === undefined || value === null || value === "") {
        return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Retrieve readings for a specific home.
 */
async function getHomeReadings(homeId) {
    return getCollection(COLLECTIONS.READINGS)
        .find(
            { homeId },
            {
                projection: {
                    _id: 0,
                    timestamp: 1,
                    energyKwh: 1,
                    powerWatts: 1,
                    applianceId: 1
                }
            }
        )
        .toArray();
}

/**
 * Group readings by day or month in JavaScript.
 */
function groupReadings(readings, period) {
    const groups = new Map();

    for (const reading of readings) {
        const date = parseTimestamp(reading.timestamp);

        if (!date) {
            continue;
        }

        const isoDate = date.toISOString();

        const key = period === "daily"
            ? isoDate.slice(0, 10)
            : isoDate.slice(0, 7);

        if (!groups.has(key)) {
            groups.set(key, {
                totalEnergyKwh: 0,
                readingCount: 0
            });
        }

        const group = groups.get(key);

        group.totalEnergyKwh += toNumber(reading.energyKwh);
        group.readingCount += 1;
    }

    return Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, group]) => {
            const energy = Number(
                group.totalEnergyKwh.toFixed(8)
            );

            const item = {
                energyKwh: energy,
                totalEnergyKwh: energy,
                readingCount: group.readingCount,
                readings: group.readingCount,
                estimatedCost: costFor(energy)
            };

            if (period === "daily") {
                item.date = key;
            } else {
                item.month = key;
            }

            return item;
        });
}

/**
 * GET /api/analytics/daily
 */
router.get("/daily", async (req, res, next) => {
    try {
        const home = await getOwnedHome(
            req.user.userId,
            req.query.homeId || null
        );

        const readings = await getHomeReadings(home.homeId);

        const data = groupReadings(readings, "daily");

        return res.json({
            success: true,
            homeId: home.homeId,
            period: "daily",
            data,
            currency: "INR"
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/monthly
 */
router.get("/monthly", async (req, res, next) => {
    try {
        const home = await getOwnedHome(
            req.user.userId,
            req.query.homeId || null
        );

        const readings = await getHomeReadings(home.homeId);

        const data = groupReadings(readings, "monthly");

        return res.json({
            success: true,
            homeId: home.homeId,
            period: "monthly",
            data,
            currency: "INR"
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/appliances
 */
router.get("/appliances", async (req, res, next) => {
    try {
        const home = await getOwnedHome(
            req.user.userId,
            req.query.homeId || null
        );

        const dbReadings = await getHomeReadings(home.homeId);

        const applianceDocuments = await getCollection(
            COLLECTIONS.APPLIANCES
        )
            .find({ homeId: home.homeId })
            .toArray();

        const applianceMap = new Map();

        // Initialize known appliances.
        for (const appliance of applianceDocuments) {
            const id = String(
                appliance.applianceId || appliance._id
            );

            applianceMap.set(id, {
                applianceId: id,
                name: appliance.name ||
                    appliance.applianceName ||
                    id,
                applianceName: appliance.name ||
                    appliance.applianceName ||
                    id,
                category: appliance.category || "General",
                totalEnergyKwh: 0,
                powerTotal: 0,
                powerCount: 0,
                readingCount: 0
            });
        }

        // Aggregate the measurements.
        for (const reading of dbReadings) {
            if (
                reading.applianceId === undefined ||
                reading.applianceId === null
            ) {
                continue;
            }

            const id = String(reading.applianceId);

            if (!applianceMap.has(id)) {
                applianceMap.set(id, {
                    applianceId: id,
                    name: id,
                    applianceName: id,
                    category: "General",
                    totalEnergyKwh: 0,
                    powerTotal: 0,
                    powerCount: 0,
                    readingCount: 0
                });
            }

            const appliance = applianceMap.get(id);

            appliance.totalEnergyKwh += toNumber(
                reading.energyKwh
            );

            appliance.readingCount += 1;

            if (
                reading.powerWatts !== undefined &&
                reading.powerWatts !== null &&
                reading.powerWatts !== ""
            ) {
                appliance.powerTotal += toNumber(
                    reading.powerWatts
                );

                appliance.powerCount += 1;
            }
        }

        const data = Array.from(applianceMap.values())
            .map(appliance => {
                const energy = Number(
                    appliance.totalEnergyKwh.toFixed(8)
                );

                return {
                    applianceId: appliance.applianceId,
                    name: appliance.name,
                    applianceName: appliance.applianceName,
                    category: appliance.category,
                    energyKwh: energy,
                    totalEnergyKwh: energy,
                    averagePowerWatts: appliance.powerCount
                        ? Number(
                            (
                                appliance.powerTotal /
                                appliance.powerCount
                            ).toFixed(2)
                        )
                        : 0,
                    readingCount: appliance.readingCount,
                    estimatedCost: costFor(energy)
                };
            })
            .sort(
                (a, b) =>
                    b.totalEnergyKwh - a.totalEnergyKwh
            );

        return res.json({
            success: true,
            homeId: home.homeId,
            data,
            currency: "INR"
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;