"use strict";

require("dotenv").config();

function readString(name, defaultValue = "") {
    const value = process.env[name];

    return value === undefined || value.trim() === ""
        ? defaultValue
        : value.trim();
}

function readNumber(name, defaultValue) {
    const rawValue = process.env[name];

    if (rawValue === undefined || rawValue.trim() === "") {
        return defaultValue;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive number.`);
    }

    return value;
}

const config = Object.freeze({
    nodeEnv: readString("NODE_ENV", "development"),
    appName: readString("APP_NAME", "EnergyFlow"),
    port: readNumber("PORT", 5000),

    mongodbUri: readString("MONGODB_URI"),
    mongodbDbName: readString("MONGODB_DB_NAME", "EnergyFlowDB"),

    jwtSecret: readString("JWT_SECRET"),
    jwtExpiresIn: readString("JWT_EXPIRES_IN", "1d"),

    costPerKwh: readNumber("COST_PER_KWH", 8),

    ingestionApiKey: readString("INGEST_API_KEY"),

    workerPollIntervalMs: readNumber(
        "WORKER_POLL_INTERVAL_MS",
        3000
    ),

    workerBatchSize: readNumber(
        "WORKER_BATCH_SIZE",
        25
    ),

    workerMaxAttempts: readNumber(
        "WORKER_MAX_ATTEMPTS",
        3
    ),

    anomalyMinReadings: readNumber(
        "ANOMALY_MIN_READINGS",
        5
    ),

    anomalyThresholdMultiplier: readNumber(
        "ANOMALY_THRESHOLD_MULTIPLIER",
        2
    ),

    apiRateLimitWindowMs: readNumber(
        "API_RATE_LIMIT_WINDOW_MS",
        900000
    ),

    apiRateLimitMaxRequests: readNumber(
        "API_RATE_LIMIT_MAX_REQUESTS",
        200
    ),

    corsOrigin: readString("CORS_ORIGIN", "")
});

function validateConfig() {
    const missing = [];

    if (!config.mongodbUri) {
        missing.push("MONGODB_URI");
    }

    if (!config.jwtSecret) {
        missing.push("JWT_SECRET");
    }

    if (!config.ingestionApiKey) {
        missing.push("INGEST_API_KEY");
    }

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`
        );
    }

    if (
        config.nodeEnv === "production" &&
        config.jwtSecret.length < 32
    ) {
        throw new Error(
            "JWT_SECRET must contain at least 32 characters in production."
        );
    }

    if (
        config.nodeEnv === "production" &&
        /replace_with|change_me|your_secret/i.test(config.jwtSecret)
    ) {
        throw new Error(
            "Replace the example JWT_SECRET with a secure random secret."
        );
    }

    if (
        config.nodeEnv === "production" &&
        /replace_with|change_me|your_secret/i.test(config.ingestionApiKey)
    ) {
        throw new Error(
            "Replace the example INGEST_API_KEY with a secure secret."
        );
    }

    return true;
}

module.exports = {
    config,
    validateConfig
};