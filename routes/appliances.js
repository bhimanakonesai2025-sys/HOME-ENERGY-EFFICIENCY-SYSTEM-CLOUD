"use strict";

const express = require("express");

const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const { requireAuth } = require("../middleware/auth");
const { getOwnedHome } = require("../services/energyService");

const router = express.Router();

router.use(requireAuth);

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

/*
 * GET /api/appliances
 *
 * Returns dataset-backed appliances with actual reading statistics.
 */
router.get("/", async (req, res, next) => {
    try {
        const home = await getOwnedHome(
            req.user.userId,
            req.query.homeId
        );

        const appliancesCollection = getCollection(
            COLLECTIONS.APPLIANCES
        );

        const readingsCollection = getCollection(
            COLLECTIONS.READINGS
        );

        const appliances = await appliancesCollection
            .find(
                { homeId: home.homeId },
                { projection: { _id: 0 } }
            )
            .sort({ name: 1 })
            .toArray();

        const statistics = await readingsCollection.aggregate([
            {
                $match: {
                    homeId: home.homeId
                }
            },
            {
                $group: {
                    _id: "$applianceId",

                    readingCount: {
                        $sum: 1
                    },

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
                    }
                }
            }
        ]).toArray();

        const statisticsByAppliance = new Map(
            statistics.map((item) => [
                item._id,
                item
            ])
        );

        const enrichedAppliances = appliances.map((appliance) => {
            const stats = statisticsByAppliance.get(
                appliance.applianceId
            );

            return {
                ...appliance,

                readingCount: stats?.readingCount || 0,

                totalEnergyKwh: Number(
                    (stats?.totalEnergyKwh || 0).toFixed(8)
                ),

                averagePowerWatts: Number(
                    (stats?.averagePowerWatts || 0).toFixed(2)
                ),

                dataSource: appliance.source || "UK-DALE"
            };
        });

        const totalReadings = enrichedAppliances.reduce(
            (sum, appliance) => sum + appliance.readingCount,
            0
        );

        const totalEnergyKwh = enrichedAppliances.reduce(
            (sum, appliance) => sum + appliance.totalEnergyKwh,
            0
        );

        res.json({
            success: true,

            homeId: home.homeId,

            count: enrichedAppliances.length,

            summary: {
                totalAppliances: enrichedAppliances.length,
                totalReadings,
                totalEnergyKwh: Number(
                    totalEnergyKwh.toFixed(8)
                )
            },

            dataSource: {
                name: "UK-DALE",
                house: 1,
                description:
                    "Historical electricity measurements from the UK-DALE dataset. These are not live readings from the user's physical home."
            },

            appliances: enrichedAppliances
        });
    } catch (error) {
        next(error);
    }
});

/*
 * PATCH /api/appliances/:applianceId
 *
 * Updates the status of an existing appliance.
 * Manual appliance creation is intentionally disabled.
 */
router.patch("/:applianceId", async (req, res, next) => {
    try {
        const home = await getOwnedHome(
            req.user.userId,
            req.body.homeId || req.query.homeId
        );

        const updates = {
            updatedAt: new Date().toISOString()
        };

        if (req.body.status !== undefined) {
            const status = String(req.body.status);

            if (!["active", "inactive"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: "Status must be active or inactive."
                });
            }

            updates.status = status;
        } else {
            return res.status(400).json({
                success: false,
                error: "Only appliance status updates are supported."
            });
        }

        const result = await getCollection(
            COLLECTIONS.APPLIANCES
        ).updateOne(
            {
                homeId: home.homeId,
                applianceId: req.params.applianceId
            },
            {
                $set: updates
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: "Appliance not found."
            });
        }

        const appliance = await getCollection(
            COLLECTIONS.APPLIANCES
        ).findOne(
            {
                homeId: home.homeId,
                applianceId: req.params.applianceId
            },
            {
                projection: { _id: 0 }
            }
        );

        res.json({
            success: true,
            message: "Appliance status updated.",
            appliance
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;