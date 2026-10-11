"use strict";

const express = require("express");

const {
    pingDatabase,
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const {
    getHeartbeat
} = require("../services/workerHeartbeat");

const router = express.Router();

router.get("/", (req, res) => {
    res.json({
        success: true,
        application: "EnergyFlow",
        status: "running",
        timestamp: new Date().toISOString()
    });
});

router.get("/database", async (req, res, next) => {
    try {
        const databaseAvailable = await pingDatabase();

        res.status(databaseAvailable ? 200 : 503).json({
            success: databaseAvailable,
            database: databaseAvailable ? "connected" : "unavailable",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});

router.get("/worker", async (req, res, next) => {
    try {
        const jobs = getCollection(COLLECTIONS.JOBS);

        const [
            pending,
            processing,
            completed,
            failed,
            heartbeat
        ] = await Promise.all([
            jobs.countDocuments({
                status: "pending",
                type: { $ne: "WORKER_HEARTBEAT" }
            }),
            jobs.countDocuments({
                status: "processing",
                type: { $ne: "WORKER_HEARTBEAT" }
            }),
            jobs.countDocuments({
                status: "completed",
                type: { $ne: "WORKER_HEARTBEAT" }
            }),
            jobs.countDocuments({
                status: "failed",
                type: { $ne: "WORKER_HEARTBEAT" }
            }),
            getHeartbeat()
        ]);

        const lastHeartbeat = heartbeat?.lastHeartbeatAt
            ? new Date(heartbeat.lastHeartbeatAt)
            : null;

        const heartbeatAgeMs = lastHeartbeat
            ? Date.now() - lastHeartbeat.getTime()
            : null;

        const heartbeatFresh =
            heartbeatAgeMs !== null &&
            heartbeatAgeMs >= 0 &&
            heartbeatAgeMs <= 30000;

        const workerStatus = !heartbeat
            ? "unknown"
            : heartbeatFresh && heartbeat.workerStatus === "running"
                ? "running"
                : heartbeat.workerStatus === "stopped"
                    ? "stopped"
                    : heartbeatFresh
                        ? heartbeat.workerStatus
                        : "stale";

        res.json({
            success: true,
            worker: {
                id: heartbeat?.workerId || null,
                status: workerStatus,
                lastHeartbeatAt: heartbeat?.lastHeartbeatAt || null,
                heartbeatAgeSeconds: heartbeatAgeMs === null
                    ? null
                    : Math.floor(heartbeatAgeMs / 1000)
            },
            queue: {
                pending,
                processing,
                completed,
                failed
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;