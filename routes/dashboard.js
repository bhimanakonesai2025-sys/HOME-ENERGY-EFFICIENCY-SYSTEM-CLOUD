"use strict";

const express = require("express");

const { requireAuth } = require("../middleware/auth");

const {
    getOwnedHome
} = require("../services/energyService");

const {
    getDashboardStatistics,
    getApplianceConsumption
} = require("../services/analyticsService");

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/dashboard
 */
router.get("/", async (req, res, next) => {
    try {
        const home = await getOwnedHome(
            req.user.userId,
            req.query.homeId
        );

        const [
            statistics,
            applianceConsumption
        ] = await Promise.all([
            getDashboardStatistics(home.homeId),
            getApplianceConsumption(home.homeId)
        ]);

        return res.json({
            success: true,

            home: {
                homeId: home.homeId,
                name: home.name
            },

            statistics,

            applianceConsumption,

            dataSource: {
                name: "UK-DALE",
                house: 1,

                description:
                    "Historical household electricity measurements " +
                    "from the public UK-DALE dataset. These are not " +
                    "live measurements from the user's physical home."
            },

            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;