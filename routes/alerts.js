const express = require("express");

const {
  getCollection,
  COLLECTIONS
} = require("../database/mongodb");

const { requireAuth } = require("../middleware/auth");

const { getOwnedHome } = require("../services/energyService");

const router = express.Router();

router.use(requireAuth);

/*
 * GET /api/alerts
 */
router.get("/", async (req, res, next) => {
  try {
    const home = await getOwnedHome(
      req.user.userId,
      req.query.homeId
    );

    const alerts = await getCollection(
      COLLECTIONS.ALERTS
    )
      .find(
        { homeId: home.homeId },
        { projection: { _id: 0 } }
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    const unreadCount = alerts.filter(
      (alert) => alert.status === "unread"
    ).length;

    const unresolvedCount = alerts.filter(
      (alert) => alert.status !== "resolved"
    ).length;

    res.json({
      success: true,
      count: alerts.length,
      unreadCount,
      unresolvedCount,
      alerts
    });
  } catch (error) {
    next(error);
  }
});

/*
 * PATCH /api/alerts/:alertId/read
 */
router.patch("/:alertId/read", async (req, res, next) => {
  try {
    const home = await getOwnedHome(
      req.user.userId,
      req.body.homeId || req.query.homeId
    );

    const result = await getCollection(
      COLLECTIONS.ALERTS
    ).updateOne(
      {
        homeId: home.homeId,
        alertId: req.params.alertId,
        status: "unread"
      },
      {
        $set: {
          status: "read",
          readAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Unread alert not found."
      });
    }

    res.json({
      success: true,
      message: "Alert marked as read."
    });
  } catch (error) {
    next(error);
  }
});

/*
 * PATCH /api/alerts/:alertId/resolve
 */
router.patch("/:alertId/resolve", async (req, res, next) => {
  try {
    const home = await getOwnedHome(
      req.user.userId,
      req.body.homeId || req.query.homeId
    );

    const result = await getCollection(
      COLLECTIONS.ALERTS
    ).updateOne(
      {
        homeId: home.homeId,
        alertId: req.params.alertId,
        status: { $ne: "resolved" }
      },
      {
        $set: {
          status: "resolved",
          resolvedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Unresolved alert not found."
      });
    }

    res.json({
      success: true,
      message: "Alert resolved successfully."
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;