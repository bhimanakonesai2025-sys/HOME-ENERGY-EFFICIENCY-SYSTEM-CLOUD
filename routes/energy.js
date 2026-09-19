const express = require("express");
const crypto = require("crypto");

const {
    requireAuth,
    requireIngestionKey
} = require("../middleware/auth");

const {
    createReading,
    listReadings,
    listAllReadings,
    createAppliance,
    listReferenceReadings
} = require("../services/db");

const {
    getRagRecommendations
} = require("../rag");

const router = express.Router();

const COST_PER_KWH = Number(
    process.env.COST_PER_KWH || 8
);


/* ============================================================
   READING NORMALIZATION
   ============================================================ */

function normalizeReading(body, fallbackHomeId) {

    const power = Number(body.power);

    if (!Number.isFinite(power) || power < 0) {
        throw new Error(
            "power must be a non-negative number."
        );
    }

    const intervalSeconds =
        Number(body.intervalSeconds || 6);

    let energyConsumed =
        Number(body.energyConsumed);

    /*
        W × seconds / 3,600,000 = kWh
    */

    if (
        !Number.isFinite(energyConsumed) ||
        energyConsumed < 0
    ) {
        energyConsumed =
            (
                power *
                intervalSeconds
            ) / 3600000;
    }

    const timestamp = body.timestamp
        ? new Date(body.timestamp)
        : new Date();

    if (Number.isNaN(timestamp.getTime())) {
        throw new Error(
            "Invalid timestamp."
        );
    }

    const homeId =
        String(
            body.homeId ||
            fallbackHomeId ||
            ""
        ).trim();

    const deviceId =
        String(
            body.deviceId ||
            ""
        ).trim();

    const deviceName =
        String(
            body.deviceName ||
            body.name ||
            ""
        ).trim();

    if (
        !homeId ||
        !deviceId ||
        !deviceName
    ) {
        throw new Error(
            "homeId, deviceId and deviceName are required."
        );
    }

    const timestampISO =
        timestamp.toISOString();

    return {

        homeId,

        deviceId,

        deviceName,

        power:
            Number(
                power.toFixed(3)
            ),

        energyConsumed:
            Number(
                energyConsumed.toFixed(8)
            ),

        intervalSeconds,

        timestamp:
            timestampISO,

        readingId:
            crypto.randomUUID(),

        readingKey:
            `${timestampISO}#${crypto.randomUUID()}`,

        source:
            body.source ||
            "cloud-ingestion",

        createdAt:
            new Date().toISOString()
    };
}


/* ============================================================
   SAVE READING
   ============================================================ */

async function saveReading(
    body,
    homeId
) {

    const reading =
        normalizeReading(
            body,
            homeId
        );

    await createReading(
        reading
    );

    await createAppliance({

        homeId:
            reading.homeId,

        deviceId:
            reading.deviceId,

        name:
            reading.deviceName,

        applianceId:
            `appliance-${reading.deviceId}`,

        source:
            reading.source,

        updatedAt:
            new Date().toISOString()

    });

    return reading;
}


/* ============================================================
   REFERENCE DATA FALLBACK
   ============================================================ */

/*
    If the logged-in user's home has its own readings,
    use those.

    If the home has no readings yet, use the real
    UK-DALE reference dataset.

    IMPORTANT:
    The reference dataset is NOT copied into the
    user's home. It is only read and displayed.
*/

async function getDataForHome(
    homeId,
    limit = 5000
) {

    const ownReadings =
        await listAllReadings(
            homeId,
            1
        );

    if (
        ownReadings &&
        ownReadings.length > 0
    ) {

        const readings =
            await listAllReadings(
                homeId,
                limit
            );

        return {

            readings,

            dataSource:
                "user-home",

            isReferenceData:
                false,

            datasetName:
                null

        };
    }


    const referenceReadings =
        await listReferenceReadings(
            limit
        );


    if (
        referenceReadings &&
        referenceReadings.length > 0
    ) {

        return {

            readings:
                referenceReadings,

            dataSource:
                "UK-DALE-reference",

            isReferenceData:
                true,

            datasetName:
                "UK-DALE"

        };
    }


    return {

        readings: [],

        dataSource:
            "user-home",

        isReferenceData:
            false,

        datasetName:
            null

    };
}


/* ============================================================
   INGESTION API
   ============================================================ */

router.post(
    "/ingest",
    requireIngestionKey,
    async (req, res) => {

        try {

            const payload =
                Array.isArray(req.body)
                    ? req.body
                    : [req.body];


            if (
                payload.length > 500
            ) {

                return res.status(400).json({

                    message:
                        "Maximum 500 readings per request."

                });

            }


            const saved = [];


            for (
                const item of payload
            ) {

                saved.push(
                    await saveReading(
                        item,
                        item.homeId
                    )
                );

            }


            res.status(201).json({

                message:
                    "Energy readings ingested successfully.",

                count:
                    saved.length,

                readings:
                    saved

            });

        } catch (error) {

            console.error(
                "Ingestion error:",
                error
            );

            res.status(400).json({

                message:
                    error.message

            });

        }

    }
);


/* ============================================================
   SINGLE AUTHENTICATED READING
   ============================================================ */

router.post(
    "/readings",
    requireAuth,
    async (req, res) => {

        try {

            const reading =
                await saveReading(
                    req.body,
                    req.user.homeId
                );


            res.status(201).json({

                message:
                    "Reading stored.",

                reading

            });

        } catch (error) {

            console.error(
                "Reading error:",
                error
            );

            res.status(400).json({

                message:
                    error.message

            });

        }

    }
);


/* ============================================================
   RECENT READINGS
   ============================================================ */

router.get(
    "/readings",
    requireAuth,
    async (req, res) => {

        try {

            const limit =
                Math.min(
                    Math.max(
                        Number(
                            req.query.limit
                        ) || 500,
                        1
                    ),
                    5000
                );


            const result =
                await getDataForHome(
                    req.user.homeId,
                    limit
                );


            res.json({

                count:
                    result.readings.length,

                readings:
                    result.readings,

                dataSource:
                    result.dataSource,

                isReferenceData:
                    result.isReferenceData,

                datasetName:
                    result.datasetName

            });

        } catch (error) {

            console.error(
                "Readings error:",
                error
            );

            res.status(500).json({

                message:
                    "Failed to load readings.",

                error:
                    error.message

            });

        }

    }
);


/* ============================================================
   ENERGY SUMMARY
   ============================================================ */

router.get(
    "/summary",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await getDataForHome(
                    req.user.homeId,
                    20000
                );


            const readings =
                result.readings;


            if (!readings.length) {

                return res.json({

                    storageMode:
                        process.env.STORAGE_MODE ||
                        "local",

                    costPerKwh:
                        COST_PER_KWH,

                    totalReadings:
                        0,

                    totalEnergy:
                        0,

                    estimatedCost:
                        0,

                    applianceCount:
                        0,

                    highUsageCount:
                        0,

                    highestConsumer:
                        null,

                    devices: [],

                    dataSource:
                        result.dataSource,

                    isReferenceData:
                        result.isReferenceData,

                    datasetName:
                        result.datasetName

                });

            }


            const deviceMap =
                new Map();


            let totalEnergy = 0;


            for (
                const reading of readings
            ) {

                const deviceId =
                    reading.deviceId;


                const energy =
                    Number(
                        reading.energyConsumed ||
                        0
                    );


                const power =
                    Number(
                        reading.power ||
                        0
                    );


                totalEnergy +=
                    energy;


                if (
                    !deviceMap.has(
                        deviceId
                    )
                ) {

                    deviceMap.set(
                        deviceId,
                        {

                            deviceId,

                            deviceName:
                                reading.deviceName,

                            energyConsumed:
                                0,

                            readings:
                                0,

                            totalPower:
                                0,

                            minimumPower:
                                power,

                            maximumPower:
                                power,

                            firstTimestamp:
                                reading.timestamp,

                            lastTimestamp:
                                reading.timestamp

                        }
                    );

                }


                const device =
                    deviceMap.get(
                        deviceId
                    );


                device.energyConsumed +=
                    energy;


                device.readings +=
                    1;


                device.totalPower +=
                    power;


                device.minimumPower =
                    Math.min(
                        device.minimumPower,
                        power
                    );


                device.maximumPower =
                    Math.max(
                        device.maximumPower,
                        power
                    );


                if (
                    new Date(
                        reading.timestamp
                    ) <
                    new Date(
                        device.firstTimestamp
                    )
                ) {

                    device.firstTimestamp =
                        reading.timestamp;

                }


                if (
                    new Date(
                        reading.timestamp
                    ) >
                    new Date(
                        device.lastTimestamp
                    )
                ) {

                    device.lastTimestamp =
                        reading.timestamp;

                }

            }


            const devices =
                Array.from(
                    deviceMap.values()
                );


            devices.forEach(
                device => {

                    device.averagePower =
                        device.readings > 0
                            ? device.totalPower /
                              device.readings
                            : 0;

                    device.contribution =
                        totalEnergy > 0
                            ? (
                                device.energyConsumed /
                                totalEnergy
                            ) * 100
                            : 0;

                    delete device.totalPower;

                }
            );


            devices.sort(
                (a, b) =>
                    b.energyConsumed -
                    a.energyConsumed
            );


            const highestConsumer =
                devices.length
                    ? devices[0]
                    : null;


            const highUsageCount =
                devices.filter(
                    device =>
                        device.energyConsumed > 3
                ).length;


            const estimatedCost =
                totalEnergy *
                COST_PER_KWH;


            res.json({

                storageMode:
                    process.env.STORAGE_MODE ||
                    "local",

                costPerKwh:
                    COST_PER_KWH,

                totalReadings:
                    readings.length,

                totalEnergy:
                    Number(
                        totalEnergy.toFixed(6)
                    ),

                estimatedCost:
                    Number(
                        estimatedCost.toFixed(2)
                    ),

                applianceCount:
                    devices.length,

                highUsageCount,

                highestConsumer,

                devices,

                dataSource:
                    result.dataSource,

                isReferenceData:
                    result.isReferenceData,

                datasetName:
                    result.datasetName

            });

        } catch (error) {

            console.error(
                "Summary error:",
                error
            );

            res.status(500).json({

                message:
                    "Failed to calculate energy summary.",

                error:
                    error.message

            });

        }

    }
);


/* ============================================================
   ALERTS
   ============================================================ */

router.get(
    "/alerts",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await getDataForHome(
                    req.user.homeId,
                    20000
                );


            const readings =
                result.readings;


            const alerts = [];


            if (!readings.length) {

                return res.json({

                    alerts: [],

                    totalAlerts:
                        0,

                    analyzedReadings:
                        0,

                    highSeverity:
                        0,

                    energyAnalyzed:
                        0,

                    dataSource:
                        result.dataSource,

                    isReferenceData:
                        result.isReferenceData,

                    datasetName:
                        result.datasetName

                });

            }


            const deviceMap =
                new Map();


            for (
                const reading of readings
            ) {

                const deviceId =
                    reading.deviceId;


                if (
                    !deviceMap.has(
                        deviceId
                    )
                ) {

                    deviceMap.set(
                        deviceId,
                        {

                            deviceId,

                            deviceName:
                                reading.deviceName,

                            energy:
                                0,

                            powers: []

                        }
                    );

                }


                const device =
                    deviceMap.get(
                        deviceId
                    );


                device.energy +=
                    Number(
                        reading.energyConsumed ||
                        0
                    );


                device.powers.push(
                    Number(
                        reading.power ||
                        0
                    )
                );

            }


            const totalEnergy =
                readings.reduce(
                    (
                        total,
                        reading
                    ) =>
                        total +
                        Number(
                            reading.energyConsumed ||
                            0
                        ),
                    0
                );


            for (
                const device
                of deviceMap.values()
            ) {

                const contribution =
                    totalEnergy > 0
                        ? (
                            device.energy /
                            totalEnergy
                        ) * 100
                        : 0;


                const averagePower =
                    device.powers.length
                        ? device.powers.reduce(
                            (
                                total,
                                power
                            ) =>
                                total + power,
                            0
                        ) /
                        device.powers.length
                        : 0;


                const peakPower =
                    device.powers.length
                        ? Math.max(
                            ...device.powers
                        )
                        : 0;


                const minimumPower =
                    device.powers.length
                        ? Math.min(
                            ...device.powers
                        )
                        : 0;


                /*
                    HIGH ENERGY CONTRIBUTION
                */

                if (
                    contribution >= 40
                ) {

                    alerts.push({

                        deviceId:
                            device.deviceId,

                        deviceName:
                            device.deviceName,

                        type:
                            "High Energy Contribution",

                        severity:
                            "HIGH",

                        value:
                            Number(
                                contribution.toFixed(2)
                            ),

                        message:
                            `${device.deviceName} accounts for ${contribution.toFixed(2)}% of analyzed energy consumption.`

                    });

                }


                /*
                    HIGH POWER
                */

                if (
                    averagePower > 0 &&
                    peakPower >
                    averagePower * 1.5
                ) {

                    alerts.push({

                        deviceId:
                            device.deviceId,

                        deviceName:
                            device.deviceName,

                        type:
                            "High Power",

                        severity:
                            peakPower >
                            averagePower * 2
                                ? "HIGH"
                                : "MEDIUM",

                        value:
                            Number(
                                peakPower.toFixed(2)
                            ),

                        message:
                            `${device.deviceName} reached a peak of ${peakPower.toFixed(2)} W compared with an average of ${averagePower.toFixed(2)} W.`

                    });

                }


                /*
                    VARIABLE USAGE
                */

                if (
                    device.powers.length >= 5
                ) {

                    const range =
                        peakPower -
                        minimumPower;


                    if (
                        averagePower > 0 &&
                        range >
                        averagePower * 1.5
                    ) {

                        alerts.push({

                            deviceId:
                                device.deviceId,

                            deviceName:
                                device.deviceName,

                            type:
                                "Variable Usage Pattern",

                            severity:
                                "MEDIUM",

                            value:
                                Number(
                                    range.toFixed(2)
                                ),

                            message:
                                `${device.deviceName} shows significant variation in power usage.`

                        });

                    }

                }

            }


            const highSeverity =
                alerts.filter(
                    alert =>
                        alert.severity ===
                        "HIGH"
                ).length;


            res.json({

                alerts,

                totalAlerts:
                    alerts.length,

                analyzedReadings:
                    readings.length,

                highSeverity,

                energyAnalyzed:
                    Number(
                        totalEnergy.toFixed(6)
                    ),

                dataSource:
                    result.dataSource,

                isReferenceData:
                    result.isReferenceData,

                datasetName:
                    result.datasetName

            });

        } catch (error) {

            console.error(
                "Alerts error:",
                error
            );

            res.status(500).json({

                message:
                    "Failed to analyze alerts.",

                error:
                    error.message

            });

        }

    }
);

/* ============================================================
   RAG ANALYSIS
   ============================================================ */

router.get(
    "/rag-analysis",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await getDataForHome(
                    req.user.homeId,
                    20000
                );


            const readings =
                result.readings || [];


            if (!readings.length) {

                return res.json({

                    enabled: true,

                    totalReadings: 0,

                    totalEnergy: 0,

                    highestConsumer: null,

                    devices: [],

                    ragContext: [],

                    recommendations: [],

                    appliances: [],

                    dataSource:
                        result.dataSource,

                    isReferenceData:
                        result.isReferenceData,

                    datasetName:
                        result.datasetName

                });

            }


            /* ====================================================
               CALCULATE APPLIANCE ENERGY
               ==================================================== */

            const deviceMap =
                new Map();


            let totalEnergy = 0;


            readings.forEach(reading => {

                const deviceId =
                    reading.deviceId;


                const energy =
                    Number(
                        reading.energyConsumed || 0
                    );


                totalEnergy += energy;


                if (!deviceMap.has(deviceId)) {

                    deviceMap.set(
                        deviceId,
                        {
                            deviceId:
                                deviceId,

                            deviceName:
                                reading.deviceName,

                            energyConsumed:
                                0,

                            readings:
                                0
                        }
                    );

                }


                const device =
                    deviceMap.get(deviceId);


                device.energyConsumed +=
                    energy;


                device.readings += 1;

            });


            /* ====================================================
               RANK APPLIANCES
               ==================================================== */

            const appliances =
                Array.from(
                    deviceMap.values()
                )
                .map(device => ({

                    ...device,

                    contribution:
                        totalEnergy > 0
                            ? (
                                device.energyConsumed /
                                totalEnergy
                            ) * 100
                            : 0

                }))
                .sort(
                    (a, b) =>
                        b.energyConsumed -
                        a.energyConsumed
                );


            /* ====================================================
               RAG CONTEXT
               ==================================================== */

            const ragContext = [];


            for (
                const appliance
                of appliances.slice(0, 3)
            ) {

                let recommendations = [];


                try {

                    recommendations =
                        getRagRecommendations(
                            appliance.deviceName
                        );


                    if (
                        !Array.isArray(
                            recommendations
                        )
                    ) {

                        recommendations = [];

                    }

                } catch (ragError) {

                    console.error(
                        "RAG retrieval error:",
                        ragError
                    );

                    recommendations = [];

                }


                /*
                    IMPORTANT:

                    Even if no exact appliance
                    knowledge is found, keep the
                    appliance inside ragContext.

                    This allows the frontend to show
                    the RAG analysis instead of
                    displaying "No knowledge retrieval".
                */

                ragContext.push({

                    deviceName:
                        appliance.deviceName,

                    energyConsumed:
                        Number(
                            appliance.energyConsumed
                                .toFixed(6)
                        ),

                    contribution:
                        Number(
                            appliance.contribution
                                .toFixed(2)
                        ),

                    readings:
                        appliance.readings,

                    recommendations:
                        recommendations

                });

            }


            /* ====================================================
               RESPONSE
               ==================================================== */

            return res.json({

                enabled: true,

                totalReadings:
                    readings.length,

                totalEnergy:
                    Number(
                        totalEnergy.toFixed(6)
                    ),

                highestConsumer:
                    appliances[0] || null,

                devices:
                    appliances,

                ragContext:
                    ragContext,

                recommendations:
                    ragContext,

                appliances:
                    appliances,

                dataSource:
                    result.dataSource,

                isReferenceData:
                    result.isReferenceData,

                datasetName:
                    result.datasetName

            });


        } catch (error) {

            console.error(
                "RAG analysis error:",
                error
            );


            return res.status(500).json({

                message:
                    "Failed to perform RAG analysis.",

                error:
                    error.message

            });

        }

    }
);

/* ============================================================
   EXPORT
   ============================================================ */

module.exports = router;