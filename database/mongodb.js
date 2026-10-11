const dns = require("node:dns");

// Use public DNS resolvers to work around SRV lookup failures.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient } = require("mongodb");
const { config } = require("../config/env");

let client = null;
let database = null;
let connectingPromise = null;

const COLLECTIONS = Object.freeze({
    USERS: "users",
    HOMES: "homes",
    APPLIANCES: "appliances",
    READINGS: "readings",
    ALERTS: "alerts",
    JOBS: "jobs"
});

async function connectDatabase() {
    if (database) return database;
    if (connectingPromise) return connectingPromise;

    connectingPromise = (async () => {
        if (!config.mongodbUri) {
            throw new Error("MONGODB_URI is missing from .env");
        }

        client = new MongoClient(config.mongodbUri, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
            maxPoolSize: 20
        });

        await client.connect();

        database = client.db(config.mongodbDbName);

        await createIndexes();

        console.log(
            `[DATABASE] Connected to ${config.mongodbDbName}.`
        );

        return database;
    })();

    try {
        return await connectingPromise;
    } catch (error) {
        if (client) {
            await client.close().catch(() => {});
        }

        client = null;
        database = null;

        throw error;
    } finally {
        connectingPromise = null;
    }
}

function getDatabase() {
    if (!database) {
        throw new Error(
            "Database is not connected. Call connectDatabase() first."
        );
    }

    return database;
}

function getCollection(name) {
    return getDatabase().collection(name);
}

async function createIndexes() {
    const db = database;

    await Promise.all([
        db.collection("users").createIndex(
            { email: 1 },
            { unique: true }
        ),

        db.collection("homes").createIndex(
            { homeId: 1 },
            { unique: true }
        ),

        db.collection("appliances").createIndex(
            { homeId: 1, applianceId: 1 },
            { unique: true }
        ),

        db.collection("readings").createIndex(
            { readingId: 1 },
            { unique: true }
        ),

        db.collection("readings").createIndex(
            { homeId: 1, applianceId: 1, timestamp: -1 }
        ),

        db.collection("readings").createIndex(
            { homeId: 1, timestamp: -1 }
        ),

        db.collection("alerts").createIndex(
            { alertId: 1 },
            { unique: true }
        ),

        db.collection("alerts").createIndex(
            { homeId: 1, status: 1, createdAt: -1 }
        ),

        db.collection("jobs").createIndex(
            { jobId: 1 },
            { unique: true }
        ),

        db.collection("jobs").createIndex(
            { status: 1, createdAt: 1 }
        )
    ]);
}

async function pingDatabase() {
    const db = getDatabase();

    await db.command({ ping: 1 });

    return {
        connected: true,
        database: config.mongodbDbName
    };
}

async function closeDatabase() {
    if (client) {
        await client.close();
    }

    client = null;
    database = null;
    connectingPromise = null;

    console.log("[DATABASE] Connection closed.");
}

module.exports = {
    COLLECTIONS,
    connectDatabase,
    getDatabase,
    getCollection,
    pingDatabase,
    closeDatabase
};