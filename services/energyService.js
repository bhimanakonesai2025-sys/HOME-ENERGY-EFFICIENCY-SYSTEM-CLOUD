"use strict";

const { randomUUID } = require("crypto");

const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const { enqueueJob } = require("./jobService");

function normalizeReading(input = {}) {
    const applianceId = String(input.applianceId || "").trim();

    if (!applianceId) {
        throw new Error("applianceId is required.");
    }

    const powerWatts = Number(input.powerWatts);

    if (!Number.isFinite(powerWatts) || powerWatts < 0) {
        throw new Error("powerWatts must be a non-negative number.");
    }

    const timestamp = input.timestamp
        ? new Date(input.timestamp)
        : new Date();

    if (Number.isNaN(timestamp.getTime())) {
        throw new Error("Invalid reading timestamp.");
    }

    const intervalSeconds = input.intervalSeconds == null
        ? 60
        : Number(input.intervalSeconds);

    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        throw new Error("intervalSeconds must be greater than zero.");
    }

    let energyKwh;

    if (input.energyKwh !== undefined && input.energyKwh !== null) {
        energyKwh = Number(input.energyKwh);

        if (!Number.isFinite(energyKwh) || energyKwh < 0) {
            throw new Error("energyKwh must be a non-negative number.");
        }
    } else {
        energyKwh = powerWatts * intervalSeconds / 3600000;
    }

    return {
        readingId: input.readingId || randomUUID(),
        applianceId,
        powerWatts,
        timestamp: timestamp.toISOString(),
        intervalSeconds,
        energyKwh
    };
}

async function getOwnedHome(userId, requestedHomeId = null) {
    const homes = getCollection(COLLECTIONS.HOMES);

    const filter = { userId };

    if (requestedHomeId) {
        filter.homeId = requestedHomeId;
    }

    const home = await homes.findOne(filter);

    if (!home) {
        throw new Error("Home not found or access denied.");
    }

    return home;
}

async function verifyAppliance(homeId, applianceId) {
    const appliances = getCollection(COLLECTIONS.APPLIANCES);

    const appliance = await appliances.findOne({
        homeId,
        applianceId
    });

    if (!appliance) {
        throw new Error("Appliance not found for this home.");
    }

    return appliance;
}

async function saveReading(input, homeId) {
    const normalized = normalizeReading(input);

    await verifyAppliance(homeId, normalized.applianceId);

    const readings = getCollection(COLLECTIONS.READINGS);

    const reading = {
        ...normalized,
        homeId,
        createdAt: new Date().toISOString()
    };

    await readings.insertOne(reading);

    try {
        await enqueueJob("ANALYZE_READING", {
            readingId: reading.readingId,
            homeId: reading.homeId,
            applianceId: reading.applianceId,
            powerWatts: reading.powerWatts,
            timestamp: reading.timestamp
        });
    } catch (error) {
        // Avoid leaving a reading that silently lacks its analysis job.
        try {
            await readings.deleteOne({
                readingId: reading.readingId
            });
        } catch (cleanupError) {
            console.error(
                "Could not remove reading after queue failure:",
                cleanupError.message
            );
        }

        throw new Error(
            `Reading was not accepted because its analysis job could not be queued: ${error.message}`
        );
    }

    return reading;
}

async function listReadings(homeId, options = {}) {
    const readings = getCollection(COLLECTIONS.READINGS);

    const filter = { homeId };

    if (options.applianceId) {
        filter.applianceId = options.applianceId;
    }

    if (options.from) {
        const fromDate = new Date(options.from);

        if (Number.isNaN(fromDate.getTime())) {
            throw new Error("Invalid 'from' date.");
        }

        filter.timestamp = {
            ...(filter.timestamp || {}),
            $gte: fromDate.toISOString()
        };
    }

    if (options.to) {
        const toDate = new Date(options.to);

        if (Number.isNaN(toDate.getTime())) {
            throw new Error("Invalid 'to' date.");
        }

        filter.timestamp = {
            ...(filter.timestamp || {}),
            $lte: toDate.toISOString()
        };
    }

    if (
        filter.timestamp?.$gte &&
        filter.timestamp?.$lte &&
        filter.timestamp.$gte > filter.timestamp.$lte
    ) {
        throw new Error("'from' date must be earlier than or equal to 'to'.");
    }

    const requestedLimit = Number(options.limit || 100);

    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
        throw new Error("limit must be a positive integer.");
    }

    const limit = Math.min(requestedLimit, 5000);

    return readings.find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
}

module.exports = {
    normalizeReading,
    getOwnedHome,
    verifyAppliance,
    saveReading,
    listReadings
};