"use strict";

const { randomUUID } = require("crypto");
const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const MAX_ATTEMPTS = Math.max(
    1,
    Number(process.env.WORKER_MAX_ATTEMPTS) || 3
);

const STALE_JOB_MINUTES = 5;

async function enqueueJob(type, payload) {
    if (!type || typeof type !== "string") {
        throw new Error("A valid job type is required.");
    }

    const jobs = getCollection(COLLECTIONS.JOBS);
    const now = new Date().toISOString();

    const job = {
        jobId: randomUUID(),
        type,
        status: "pending",
        attempts: 0,
        payload,
        createdAt: now,
        updatedAt: now,
        nextAttemptAt: now
    };

    await jobs.insertOne(job);

    return job;
}

async function recoverStaleJobs() {
    const jobs = getCollection(COLLECTIONS.JOBS);

    const cutoff = new Date(
        Date.now() - STALE_JOB_MINUTES * 60 * 1000
    ).toISOString();

    await jobs.updateMany(
        {
            status: "processing",
            processingAt: { $lt: cutoff }
        },
        [
            {
                $set: {
                    status: {
                        $cond: [
                            { $gte: ["$attempts", MAX_ATTEMPTS] },
                            "failed",
                            "pending"
                        ]
                    },
                    nextAttemptAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    lastError: "Recovered after a stale processing lease."
                }
            },
            {
                $unset: ["processingAt"]
            }
        ]
    );
}

async function claimNextJob() {
    const jobs = getCollection(COLLECTIONS.JOBS);

    await recoverStaleJobs();

    const now = new Date().toISOString();

    return jobs.findOneAndUpdate(
        {
            type: { $ne: "WORKER_HEARTBEAT" },
            status: "pending",
            attempts: { $lt: MAX_ATTEMPTS },
            $or: [
                { nextAttemptAt: { $exists: false } },
                { nextAttemptAt: { $lte: now } }
            ]
        },
        {
            $set: {
                status: "processing",
                processingAt: now,
                updatedAt: now
            },
            $inc: {
                attempts: 1
            }
        },
        {
            sort: { createdAt: 1 },
            returnDocument: "after"
        }
    );
}

async function completeJob(jobId, result = null) {
    const jobs = getCollection(COLLECTIONS.JOBS);

    return jobs.updateOne(
        {
            jobId,
            status: "processing"
        },
        {
            $set: {
                status: "completed",
                result,
                completedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            $unset: {
                processingAt: ""
            }
        }
    );
}

async function failJob(jobId, errorMessage) {
    const jobs = getCollection(COLLECTIONS.JOBS);

    const job = await jobs.findOne({ jobId });

    if (!job) {
        throw new Error(`Job not found: ${jobId}`);
    }

    const permanentlyFailed = job.attempts >= MAX_ATTEMPTS;

    // Exponential backoff: 3 seconds, 6 seconds, 12 seconds, etc.
    const delayMs = Math.min(
        60000,
        3000 * Math.pow(2, Math.max(0, job.attempts - 1))
    );

    const update = {
        status: permanentlyFailed ? "failed" : "pending",
        lastError: String(errorMessage || "Unknown worker error"),
        updatedAt: new Date().toISOString()
    };

    if (!permanentlyFailed) {
        update.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    }

    return jobs.updateOne(
        {
            jobId,
            status: "processing"
        },
        {
            $set: update,
            $unset: {
                processingAt: ""
            }
        }
    );
}

module.exports = {
    enqueueJob,
    claimNextJob,
    completeJob,
    failJob,
    recoverStaleJobs
};