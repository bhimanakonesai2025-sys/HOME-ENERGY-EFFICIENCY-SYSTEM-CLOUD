"use strict";

const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const WORKER_ID =
    process.env.WORKER_ID || "energyflow-worker-1";

const HEARTBEAT_JOB_ID = `heartbeat-${WORKER_ID}`;

async function updateHeartbeat(status = "running", details = {}) {
    const jobs = getCollection(COLLECTIONS.JOBS);
    const now = new Date().toISOString();

    await jobs.updateOne(
        {
            jobId: HEARTBEAT_JOB_ID
        },
        {
            $set: {
                jobId: HEARTBEAT_JOB_ID,
                type: "WORKER_HEARTBEAT",
                workerId: WORKER_ID,
                status: "heartbeat",
                workerStatus: status,
                details,
                lastHeartbeatAt: now,
                updatedAt: now
            },
            $setOnInsert: {
                createdAt: now
            }
        },
        {
            upsert: true
        }
    );

    return {
        workerId: WORKER_ID,
        status,
        lastHeartbeatAt: now
    };
}

async function getHeartbeat() {
    const jobs = getCollection(COLLECTIONS.JOBS);

    return jobs.findOne({
        jobId: HEARTBEAT_JOB_ID,
        type: "WORKER_HEARTBEAT"
    });
}

module.exports = {
    WORKER_ID,
    updateHeartbeat,
    getHeartbeat
};