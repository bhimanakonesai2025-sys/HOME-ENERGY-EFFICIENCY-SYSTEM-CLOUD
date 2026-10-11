const express = require("express");

const {
  getCollection,
  COLLECTIONS
} = require("../database/mongodb");

const {
  requireAuth,
  requireIngestionKey
} = require("../middleware/auth");

const {
  getOwnedHome,
  saveReading,
  listReadings
} = require("../services/energyService");

const router = express.Router();

/*
 * POST /api/energy/ingest
 *
 * Requires:
 * x-ingestion-key: YOUR_INGEST_API_KEY
 *
 * Body:
 * {
 *   "homeId": "HOME_ID",
 *   "readings": [
 *     {
 *       "applianceId": "APPLIANCE_ID",
 *       "powerWatts": 120,
 *       "intervalSeconds": 60
 *     }
 *   ]
 * }
 */
router.post(
  "/ingest",
  requireIngestionKey,
  async (req, res, next) => {
    try {
      const homeId = String(req.body.homeId || "").trim();

      if (!homeId) {
        return res.status(400).json({
          success: false,
          error: "homeId is required."
        });
      }

      const inputs = Array.isArray(req.body.readings)
        ? req.body.readings
        : [req.body];

      if (inputs.length === 0 || inputs.length > 500) {
        return res.status(400).json({
          success: false,
          error: "Submit between 1 and 500 readings per request."
        });
      }

      const home = await getCollection(
        COLLECTIONS.HOMES
      ).findOne({ homeId });

      if (!home) {
        return res.status(404).json({
          success: false,
          error: "Home not found."
        });
      }

      const saved = [];
      const rejected = [];

      for (let index = 0; index < inputs.length; index += 1) {
        try {
          const reading = await saveReading(
            inputs[index],
            homeId
          );

          saved.push(reading);
        } catch (error) {
          rejected.push({
            index,
            error: error.message
          });
        }
      }

      res.status(saved.length > 0 ? 201 : 400).json({
        success: saved.length > 0,
        received: inputs.length,
        savedCount: saved.length,
        rejectedCount: rejected.length,
        readings: saved,
        rejected
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
 * GET /api/energy/readings
 *
 * Requires authentication.
 *
 * Optional query parameters:
 * homeId, applianceId, from, to, limit
 */
router.get("/readings", requireAuth, async (req, res, next) => {
  try {
    const home = await getOwnedHome(
      req.user.userId,
      req.query.homeId
    );

    const options = {
      applianceId: req.query.applianceId,
      limit: req.query.limit
    };

    if (req.query.from) {
      const from = new Date(req.query.from);

      if (Number.isNaN(from.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid from date."
        });
      }

      options.from = from.toISOString();
    }

    if (req.query.to) {
      const to = new Date(req.query.to);

      if (Number.isNaN(to.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid to date."
        });
      }

      options.to = to.toISOString();
    }

    if (
      options.from &&
      options.to &&
      options.from > options.to
    ) {
      return res.status(400).json({
        success: false,
        error: "from must be earlier than or equal to to."
      });
    }

    const readings = await listReadings(
      home.homeId,
      options
    );

    res.json({
      success: true,
      homeId: home.homeId,
      count: readings.length,
      readings
    });
  } catch (error) {
    next(error);
  }
});

/*
 * GET /api/energy/summary
 */
router.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const home = await getOwnedHome(
      req.user.userId,
      req.query.homeId
    );

    const readings = await listReadings(
      home.homeId,
      {
        from: req.query.from,
        to: req.query.to,
        limit: 5000
      }
    );

    const totalEnergyKwh = readings.reduce(
      (sum, reading) => sum + (Number(reading.energyKwh) || 0),
      0
    );

    const averagePowerWatts =
      readings.length > 0
        ? readings.reduce(
            (sum, reading) =>
              sum + (Number(reading.powerWatts) || 0),
            0
          ) / readings.length
        : 0;

    const costPerKwh = Number(process.env.COST_PER_KWH || 8);

    res.json({
      success: true,
      homeId: home.homeId,
      readingCount: readings.length,
      totalEnergyKwh: Number(totalEnergyKwh.toFixed(4)),
      averagePowerWatts: Number(averagePowerWatts.toFixed(2)),
      estimatedCost: Number(
        (totalEnergyKwh * costPerKwh).toFixed(2)
      ),
      currency: "INR"
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;