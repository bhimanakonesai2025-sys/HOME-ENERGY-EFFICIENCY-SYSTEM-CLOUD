"use strict";

const { randomUUID } = require("crypto");
const { MongoClient } = require("mongodb");

const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const { config } = require("../config/env");

const SOURCE_DB_NAME = "HomeEnergyDB";
const BATCH_SIZE = 500;

async function seedDemoHome(home, userId) {
    if (!home?.homeId || !userId) {
        throw new Error("Valid home and user IDs are required.");
    }

    const targetHomes = getCollection(COLLECTIONS.HOMES);
    const targetAppliances = getCollection(COLLECTIONS.APPLIANCES);
    const targetReadings = getCollection(COLLECTIONS.READINGS);

    const targetHome = await targetHomes.findOne({
        homeId: home.homeId,
        userId
    });

    if (!targetHome) {
        throw new Error(
            "The destination home does not belong to this user."
        );
    }

    const existingReading = await targetReadings.findOne({
        homeId: home.homeId
    });

    if (existingReading) {
        return {
            alreadySeeded: true,
            source: "UK-DALE"
        };
    }

    const sourceClient = new MongoClient(config.mongodbUri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        maxPoolSize: 5
    });

    let insertedAppliances = false;
    let copiedReadingCount = 0;
    const now = new Date().toISOString();

    try {
        await sourceClient.connect();

        const sourceDb = sourceClient.db(SOURCE_DB_NAME);
        const sourceAppliancesCollection =
            sourceDb.collection(COLLECTIONS.APPLIANCES);
        const sourceReadingsCollection =
            sourceDb.collection(COLLECTIONS.READINGS);

        // Find real UK-DALE appliances, independently of the source account.
        const sourceAppliances = await sourceAppliancesCollection.find({
            source: "UK-DALE"
        }).toArray();

        if (sourceAppliances.length === 0) {
            throw new Error(
                "No UK-DALE appliances exist in the source database."
            );
        }

        // Prefer the dataset's original House 1 appliances.
        const houseOneAppliances = sourceAppliances.filter(
            appliance => Number(appliance.datasetHouse) === 1
        );

        const selectedAppliances = houseOneAppliances.length > 0
            ? houseOneAppliances
            : sourceAppliances;

        const applianceIdMap = new Map();

        const newAppliances = selectedAppliances.map(appliance => {
            const newApplianceId = randomUUID();

            applianceIdMap.set(
                appliance.applianceId,
                newApplianceId
            );

            const {
                _id,
                ...fields
            } = appliance;

            return {
                ...fields,
                applianceId: newApplianceId,
                homeId: home.homeId,
                source: "UK-DALE",
                createdAt: now,
                updatedAt: now
            };
        });

        // Copy only readings belonging to the selected appliances.
        const sourceApplianceIds = selectedAppliances.map(
            appliance => appliance.applianceId
        );

        const cursor = sourceReadingsCollection.find({
            source: "UK-DALE",
            applianceId: {
                $in: sourceApplianceIds
            }
        });

        await targetAppliances.insertMany(newAppliances);
        insertedAppliances = true;

        let batch = [];

        for await (const reading of cursor) {
            const newApplianceId = applianceIdMap.get(
                reading.applianceId
            );

            if (!newApplianceId) {
                continue;
            }

            const {
                _id,
                ...fields
            } = reading;

            batch.push({
                ...fields,
                readingId: randomUUID(),
                homeId: home.homeId,
                applianceId: newApplianceId,
                source: "UK-DALE",
                createdAt: now
            });

            if (batch.length >= BATCH_SIZE) {
                await targetReadings.insertMany(batch);
                copiedReadingCount += batch.length;
                batch = [];
            }
        }

        if (batch.length > 0) {
            await targetReadings.insertMany(batch);
            copiedReadingCount += batch.length;
        }

        if (copiedReadingCount === 0) {
            throw new Error(
                "No UK-DALE readings matched the selected appliances."
            );
        }

        await targetHomes.updateOne(
            {
                homeId: home.homeId,
                userId
            },
            {
                $set: {
                    dataMode: "UK-DALE",
                    updatedAt: now
                }
            }
        );

        console.log(
            `[UK-DALE] Copied ${copiedReadingCount} actual readings ` +
            `and ${newAppliances.length} appliances to home ${home.homeId}.`
        );

        return {
            alreadySeeded: false,
            appliances: newAppliances.length,
            readings: copiedReadingCount,
            source: "UK-DALE"
        };
    } catch (error) {
        // Roll back only this destination home's newly copied dataset.
        await targetReadings.deleteMany({
            homeId: home.homeId,
            source: "UK-DALE"
        }).catch(() => {});

        if (insertedAppliances) {
            await targetAppliances.deleteMany({
                homeId: home.homeId,
                source: "UK-DALE"
            }).catch(() => {});
        }

        throw error;
    } finally {
        await sourceClient.close().catch(() => {});
    }
}

module.exports = {
    seedDemoHome
};
