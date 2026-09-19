const express = require("express");

const {
    requireAuth
} = require("../middleware/auth");

const {
    listAllReadings,
    createAppliance,
    listAppliances
} = require("../services/db");

const {
    getRagRecommendations
} = require("../rag");

const router = express.Router();


/* ============================================================
   APPLIANCE LIST
   ============================================================ */

router.get(
    "/",
    requireAuth,
    async (req, res) => {

        try {

            const appliances =
                await listAppliances(
                    req.user.homeId
                );

            res.json({
                appliances
            });

        } catch (error) {

            console.error(
                "Appliance list error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not load appliances."
            });
        }
    }
);


/* ============================================================
   APPLIANCE INTELLIGENCE
   ============================================================ */

router.get(
    "/:deviceId",
    requireAuth,
    async (req, res) => {

        try {

            const readings =
                await listAllReadings(
                    req.user.homeId,
                    20000
                );


            const deviceReadings =
                readings.filter(
                    reading =>
                        reading.deviceId ===
                        req.params.deviceId
                );


            if (!deviceReadings.length) {

                return res.status(404).json({
                    message:
                        "No readings found for this appliance."
                });
            }


            const deviceName =
                deviceReadings[0].deviceName;


            let totalEnergy = 0;

            let totalPower = 0;

            let minimumPower =
                Infinity;

            let maximumPower =
                -Infinity;


            for (
                const reading of
                deviceReadings
            ) {

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

                totalPower +=
                    power;


                minimumPower =
                    Math.min(
                        minimumPower,
                        power
                    );


                maximumPower =
                    Math.max(
                        maximumPower,
                        power
                    );

            }


            const allEnergy =
                readings.reduce(
                    (sum, reading) =>
                        sum +
                        Number(
                            reading.energyConsumed ||
                            0
                        ),
                    0
                );


            const contribution =
                allEnergy > 0
                    ? (
                        totalEnergy /
                        allEnergy
                    ) * 100
                    : 0;


            const averagePower =
                totalPower /
                deviceReadings.length;


            const costPerKwh =
                Number(
                    process.env.COST_PER_KWH ||
                    8
                );


            const estimatedCost =
                totalEnergy *
                costPerKwh;


            const recommendations =
                getRagRecommendations(
                    deviceName
                );


            const sorted =
                [...deviceReadings]
                    .sort(
                        (a, b) =>
                            new Date(a.timestamp) -
                            new Date(b.timestamp)
                    );


            res.json({

                deviceId:
                    req.params.deviceId,

                deviceName,

                totalEnergy:
                    Number(
                        totalEnergy.toFixed(6)
                    ),

                estimatedCost:
                    Number(
                        estimatedCost.toFixed(2)
                    ),

                contribution:
                    Number(
                        contribution.toFixed(2)
                    ),

                readings:
                    deviceReadings.length,

                averagePower:
                    Number(
                        averagePower.toFixed(2)
                    ),

                minimumPower:
                    Number(
                        minimumPower.toFixed(2)
                    ),

                maximumPower:
                    Number(
                        maximumPower.toFixed(2)
                    ),

                firstReading:
                    sorted[0].timestamp,

                lastReading:
                    sorted[
                        sorted.length - 1
                    ].timestamp,

                recommendations

            });

        } catch (error) {

            console.error(
                "Appliance intelligence error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not analyze appliance."
            });
        }
    }
);


module.exports = router;