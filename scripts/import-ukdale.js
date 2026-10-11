"use strict";

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const {
    connectDatabase,
    getCollection,
    closeDatabase
} = require("../database/mongodb");

const DATASET_DIR = path.resolve(
    __dirname,
    "../data/ukdale/house_1"
);

const DATASET_NAME = "UK-DALE";
const DATASET_HOUSE = 1;
const MAX_READINGS_PER_APPLIANCE = 1000;
const INTERVAL_SECONDS = 6;

const EXCLUDED_APPLIANCES = new Set([
    "aggregate"
]);

/**
 * Read the UK-DALE channel labels.
 *
 * Expected format:
 * 1 mains
 * 2 fridge
 * 3 washing machine
 */
function readLabels(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Dataset labels file not found: ${filePath}`
        );
    }

    const labels = new Map();

    const lines = fs.readFileSync(
        filePath,
        "utf8"
    ).split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            continue;
        }

        const match = trimmed.match(/^(\d+)\s+(.+)$/);

        if (!match) {
            continue;
        }

        const channelNumber = Number(match[1]);
        const applianceName = match[2].trim();

        if (
            Number.isInteger(channelNumber) &&
            applianceName
        ) {
            labels.set(channelNumber, applianceName);
        }
    }

    return labels;
}

/**
 * Read valid power measurements from one channel.
 *
 * UK-DALE records contain:
 * Unix timestamp in seconds, followed by measured power.
 *
 * Keep the latest available observations in chronological order.
 */
function readChannelFile(filePath, limit) {
    if (!fs.existsSync(filePath)) {
        return [];
    }

    const readings = [];

    const lines = fs.readFileSync(
        filePath,
        "utf8"
    ).split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            continue;
        }

        const parts = trimmed.split(/\s+/);

        if (parts.length < 2) {
            continue;
        }

        const epochSeconds = Number(parts[0]);
        const powerWatts = Number(parts[1]);

        if (!Number.isFinite(epochSeconds)) {
            continue;
        }

        if (
            !Number.isFinite(powerWatts) ||
            powerWatts < 0
        ) {
            continue;
        }

        const timestamp = new Date(epochSeconds * 1000);

        if (Number.isNaN(timestamp.getTime())) {
            continue;
        }

        readings.push({
            timestamp,
            powerWatts
        });
    }

    readings.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    return readings.slice(-limit);
}

/**
 * Classify appliances using their published dataset labels.
 */
function normalizeCategory(name) {
    const value = name.toLowerCase();

    if (value.includes("wash")) {
        return "Laundry";
    }

    if (
        value.includes("fridge") ||
        value.includes("freezer") ||
        value.includes("dishwasher") ||
        value.includes("kettle") ||
        value.includes("oven") ||
        value.includes("microwave") ||
        value.includes("rice cooker")
    ) {
        return "Kitchen";
    }

    if (
        value.includes("tv") ||
        value.includes("television")
    ) {
        return "Entertainment";
    }

    if (
        value.includes("light") ||
        value.includes("lamp")
    ) {
        return "Lighting";
    }

    if (
        value.includes("boiler") ||
        value.includes("heater")
    ) {
        return "Heating";
    }

    return "Other";
}

/**
 * Estimate a representative observed power value.
 *
 * This is an estimate from measurements, not a manufacturer rating.
 */
function estimateRatedPower(readings) {
    const positiveValues = readings
        .map(reading => reading.powerWatts)
        .filter(value => value > 0);

    if (positiveValues.length === 0) {
        return 0;
    }

    return Math.round(
        Math.max(...positiveValues)
    );
}

/**
 * Calculate energy for a single measurement interval.
 *
 * Energy (kWh) = Power (W) × Time (seconds) / 3,600,000
 */
function calculateEnergyKwh(powerWatts, intervalSeconds) {
    return Number(
        (
            powerWatts *
            intervalSeconds /
            3600000
        ).toFixed(10)
    );
}

/**
 * Import UK-DALE House 1 into the existing account's home.
 */
async function main() {
    if (!fs.existsSync(DATASET_DIR)) {
        throw new Error(
            `UK-DALE House 1 directory not found: ${DATASET_DIR}\n` +
            "Expected labels.dat and channel_*.dat in data/ukdale/house_1."
        );
    }

    await connectDatabase();

    const labels = readLabels(
        path.join(DATASET_DIR, "labels.dat")
    );

    if (labels.size === 0) {
        throw new Error(
            "No valid appliance labels were found in labels.dat."
        );
    }

    const users = getCollection("users");
    const homes = getCollection("homes");
    const appliances = getCollection("appliances");
    const readingsCollection = getCollection("readings");

    const email = String(
        process.env.UKDALE_USER_EMAIL || ""
    ).trim().toLowerCase();

    if (!email) {
        throw new Error(
            "UKDALE_USER_EMAIL is missing from .env.\n" +
            "Set it to the email of the existing account that should own " +
            "the dataset-backed demo."
        );
    }

    const user = await users.findOne({ email });

    if (!user) {
        throw new Error(
            `No existing account was found for ${email}. ` +
            "No account has been created."
        );
    }

    if (!user.userId) {
        throw new Error(
            "The selected account has no userId. " +
            "Resolve the account schema before importing."
        );
    }

    const home = await homes.findOne({
        userId: user.userId
    });

    if (!home || !home.homeId) {
        throw new Error(
            "The selected account has no valid associated home. " +
            "No home has been created."
        );
    }

    console.log(`[DATASET] Source: ${DATASET_NAME}`);
    console.log(`[DATASET] House: ${DATASET_HOUSE}`);
    console.log(`[DATASET] Home: ${home.name || home.homeId}`);
    console.log(`[DATASET] Account: ${user.email}`);
    console.log(`[DATASET] Maximum readings per appliance: ${MAX_READINGS_PER_APPLIANCE}`);

    let processedAppliances = 0;
    let processedReadings = 0;
    let insertedReadings = 0;
    let updatedReadings = 0;

    for (const [channelNumber, applianceName] of labels.entries()) {
        const normalizedName = applianceName.trim();

        if (
            EXCLUDED_APPLIANCES.has(
                normalizedName.toLowerCase()
            )
        ) {
            continue;
        }

        const channelPath = path.join(
            DATASET_DIR,
            `channel_${channelNumber}.dat`
        );

        if (!fs.existsSync(channelPath)) {
            continue;
        }

        const rawReadings = readChannelFile(
            channelPath,
            MAX_READINGS_PER_APPLIANCE
        );

        if (rawReadings.length === 0) {
            console.log(
                `[SKIP] ${normalizedName}: no valid readings.`
            );
            continue;
        }

        const applianceId =
            `ukdale-h${DATASET_HOUSE}-ch${channelNumber}`;

        const now = new Date();

        await appliances.updateOne(
            {
                homeId: home.homeId,
                applianceId
            },
            {
                $set: {
                    homeId: home.homeId,
                    applianceId,
                    name: normalizedName,
                    category: normalizeCategory(normalizedName),
                    ratedPowerWatts: estimateRatedPower(rawReadings),
                    source: DATASET_NAME,
                    datasetHouse: DATASET_HOUSE,
                    datasetChannel: channelNumber,
                    updatedAt: now
                },
                $setOnInsert: {
                    status: "active",
                    createdAt: now
                }
            },
            {
                upsert: true
            }
        );

        const operations = rawReadings.map(reading => {
            const timestampMs = reading.timestamp.getTime();

            const readingId =
                `ukdale-h${DATASET_HOUSE}-ch${channelNumber}-${timestampMs}`;

            return {
                updateOne: {
                    filter: {
                        readingId
                    },
                    update: {
                        // Update existing readings as well as new ones.
                        $set: {
                            homeId: home.homeId,
                            applianceId,
                            timestamp: reading.timestamp,
                            powerWatts: reading.powerWatts,
                            intervalSeconds: INTERVAL_SECONDS,
                            energyKwh: calculateEnergyKwh(
                                reading.powerWatts,
                                INTERVAL_SECONDS
                            ),
                            source: DATASET_NAME,
                            datasetHouse: DATASET_HOUSE,
                            datasetChannel: channelNumber
                        },

                        $setOnInsert: {
                            readingId,
                            createdAt: now
                        }
                    },
                    upsert: true
                }
            };
        });

        if (operations.length > 0) {
            /*
             * Count inserts and updates separately.
             * Existing measurements are updated, not duplicated.
             */
            const result = await readingsCollection.bulkWrite(
                operations,
                {
                    ordered: false
                }
            );

            insertedReadings += result.upsertedCount || 0;
            updatedReadings += result.modifiedCount || 0;
        }

        processedAppliances++;
        processedReadings += rawReadings.length;

        console.log(
            `[IMPORTED] ${normalizedName}: ` +
            `${rawReadings.length} source readings`
        );
    }

    console.log("\n========== IMPORT SUMMARY ==========");
    console.log(`Dataset: ${DATASET_NAME}`);
    console.log(`Dataset house: ${DATASET_HOUSE}`);
    console.log(`Appliances processed: ${processedAppliances}`);
    console.log(`Source readings processed: ${processedReadings}`);
    console.log(`New readings inserted: ${insertedReadings}`);
    console.log(`Existing readings updated: ${updatedReadings}`);
    console.log("Source: real published UK-DALE measurements");
    console.log("====================================");
}

main()
    .catch(error => {
        console.error("\n[IMPORT ERROR]", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDatabase().catch(() => {});
    });