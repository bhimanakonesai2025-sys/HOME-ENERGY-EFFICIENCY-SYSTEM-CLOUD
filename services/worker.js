"use strict";

require("dotenv").config();

const {
    connectDatabase,
    closeDatabase,
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const { config } = require("../config/env");
const { analyzeReading } = require("./anomalyService");

const {
    claimNextJob,
    completeJob,
    failJob
} = require("./jobService");

const {
    updateHeartbeat
} = require("./workerHeartbeat");

const POLL_INTERVAL_MS = Math.max(
    1000,
    Number(config.workerPollIntervalMs) || 3000
);

let running = false;
let started = false;
let active = false;
let timer = null;

async function createAnomalyAlert(reading, analysis) {
    const alerts = getCollection(COLLECTIONS.ALERTS);
    const alertId = `anomaly-${reading.readingId}`;

    const existing = await alerts.findOne({ alertId });

    if (existing) {
        return existing;
    }

    const alert = {
        alertId,
        homeId: reading.homeId,
        applianceId: reading.applianceId,
        readingId: reading.readingId,
        type: "ANOMALY",
        severity: "medium",
        status: "unread",
        message:
            `Unusual energy consumption detected. ` +
            `Measured power: ${reading.powerWatts} W.`,
        analysis,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    try {
        await alerts.insertOne(alert);
        return alert;
    } catch (error) {
        // If another worker inserted this alert concurrently,
        // return the existing alert instead of failing the job.
        if (error.code === 11000) {
            return alerts.findOne({ alertId });
        }

        throw error;
    }
}

async function processJob(job) {
    if (!job || !job.jobId) {
        throw new Error("Cannot process an invalid job.");
    }

    try {
        if (job.type === "ANALYZE_READING") {
            const readings = getCollection(COLLECTIONS.READINGS);

            const reading = await readings.findOne({
                readingId: job.payload?.readingId
            });

            if (!reading) {
                // The reading may have been removed after queuing.
                await completeJob(job.jobId, {
                    skipped: true,
                    reason: "Reading no longer exists"
                });

                return;
            }

            const analysis = await analyzeReading(reading);

            if (analysis?.isAnomaly) {
                await createAnomalyAlert(reading, analysis);
            }

            await completeJob(job.jobId, {
                readingId: reading.readingId,
                anomalyDetected: Boolean(analysis?.isAnomaly),
                analyzedAt: new Date().toISOString()
            });

            return;
        }

        throw new Error(`Unsupported job type: ${job.type}`);
    } catch (error) {
        console.error(
            `Worker failed to process job ${job.jobId}:`,
            error.message
        );

        try {
            await failJob(job.jobId, error.message);
        } catch (queueError) {
            console.error(
                `Could not update failed job ${job.jobId}:`,
                queueError.message
            );
        }
    }
}

async function processNextJob() {
    if (active) return false;

    active = true;

    try {
        const job = await claimNextJob();

        if (!job) {
            return false;
        }

        await processJob(job);
        return true;
    } finally {
        active = false;
    }
}

async function poll() {
    if (!running) return;

    try {
        await updateHeartbeat("running", {
            checkedAt: new Date().toISOString()
        });

        await processNextJob();
    } catch (error) {
        console.error("Worker polling error:", error.message);

        try {
            await updateHeartbeat("error", {
                message: error.message
            });
        } catch (heartbeatError) {
            console.error(
                "Could not update worker heartbeat:",
                heartbeatError.message
            );
        }
    }

    if (running) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
}

async function startWorker() {
    if (started) return;

    await connectDatabase();

    running = true;
    started = true;

    console.log("EnergyFlow background worker started.");

    await updateHeartbeat("running", {
        startedAt: new Date().toISOString()
    });

    await poll();
}

async function stopWorker() {
    running = false;

    if (timer) {
        clearTimeout(timer);
        timer = null;
    }

    try {
        await updateHeartbeat("stopped", {
            stoppedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error(
            "Could not record worker shutdown:",
            error.message
        );
    }

    await closeDatabase();

    started = false;

    console.log("EnergyFlow background worker stopped.");
}

if (require.main === module) {
    startWorker().catch(error => {
        console.error("Unable to start worker:", error);
        process.exit(1);
    });

    process.on("SIGINT", () => {
        stopWorker().finally(() => process.exit());
    });

    process.on("SIGTERM", () => {
        stopWorker().finally(() => process.exit());
    });
}

module.exports = {
    startWorker,
    stopWorker,
    processNextJob,
    processJob,
    createAnomalyAlert
};