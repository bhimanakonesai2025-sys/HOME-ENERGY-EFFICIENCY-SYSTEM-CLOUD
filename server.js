"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { config, validateConfig } = require("./config/env");

const {
    connectDatabase,
    pingDatabase,
    closeDatabase
} = require("./database/mongodb");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const applianceRoutes = require("./routes/appliances");
const energyRoutes = require("./routes/energy");
const alertRoutes = require("./routes/alerts");
const recommendationRoutes = require("./routes/recommendations");
const analyticsRoutes = require("./routes/analytics");
const healthRoutes = require("./routes/health");

const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Trust the reverse proxy used by Render.
app.set("trust proxy", 1);

app.disable("x-powered-by");

/* =========================
   SECURITY MIDDLEWARE
========================= */

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(
    cors({
        origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN
                  .split(",")
                  .map(value => value.trim())
            : true
    })
);

app.use(
    express.json({
        limit: "1mb"
    })
);

app.use(
    express.urlencoded({
        extended: false,
        limit: "1mb"
    })
);

app.use(
    rateLimit({
        windowMs: config.apiRateLimitWindowMs,
        limit: config.apiRateLimitMaxRequests,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            success: false,
            message: "Too many requests. Please try again later."
        }
    })
);

/* =========================
   FRONTEND
========================= */

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "login.html")
    );
});

/* =========================
   API ROUTES
========================= */

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/appliances", applianceRoutes);
app.use("/api/energy", energyRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/health", healthRoutes);

/* =========================
   API NOT FOUND
========================= */

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });
});

/* =========================
   ERROR HANDLING
========================= */

app.use(notFound);
app.use(errorHandler);

/* =========================
   SERVER LIFECYCLE
========================= */

let server;
let shuttingDown = false;

async function startServer() {
    validateConfig();

    // Establish the database connection before accepting requests.
    await connectDatabase();

    server = app.listen(config.port, () => {
        console.log(
            `${config.appName} server listening on port ${config.port}`
        );

        console.log(`Environment: ${config.nodeEnv}`);
    });

    server.on("error", error => {
        console.error("HTTP server error:", error);
        process.exitCode = 1;
    });

    return server;
}

async function shutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        `${signal} received. Shutting down EnergyFlow...`
    );

    if (server) {
        await new Promise((resolve, reject) => {
            server.close(error => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        }).catch(error => {
            console.error("Error closing HTTP server:", error);
            process.exitCode = 1;
        });
    }

    try {
        await closeDatabase();
        console.log("MongoDB connection closed.");
    } catch (error) {
        console.error("Error closing MongoDB:", error);
        process.exitCode = 1;
    }
}

process.on("SIGINT", () => {
    shutdown("SIGINT").finally(() => process.exit());
});

process.on("SIGTERM", () => {
    shutdown("SIGTERM").finally(() => process.exit());
});

/* =========================
   START APPLICATION
========================= */

if (require.main === module) {
    startServer().catch(error => {
        console.error(
            "Unable to start EnergyFlow:",
            error
        );

        process.exit(1);
    });
}

module.exports = {
    app,
    startServer,
    shutdown
};