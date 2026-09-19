require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const energyRoutes = require("./routes/energy");
const applianceRoutes = require("./routes/appliances");

const app = express();

const PORT =
    Number(process.env.PORT || 5000);

app.use(cors());

app.use(
    express.json({
        limit: "1mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);

/* =========================
   HEALTH CHECK
========================= */

app.get(
    "/api/health",
    (req, res) => {
        res.json({
            status: "ok",
            application: "EnergyFlow",

            deploymentMode:
                process.env.NODE_ENV ||
                "development",

            storageMode:
                process.env.STORAGE_MODE ||
                "local",

            timestamp:
                new Date().toISOString()
        });
    }
);

/* =========================
   API ROUTES
========================= */

app.use(
    "/api/auth",
    authRoutes
);

app.use(
    "/api/energy",
    energyRoutes
);

app.use(
    "/api/appliances",
    applianceRoutes
);

/* =========================
   FRONTEND
========================= */

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);

/* =========================
   UNKNOWN ROUTES
========================= */

app.use(
    (req, res) => {
        if (
            req.path.startsWith(
                "/api/"
            )
        ) {
            return res.status(404).json({
                message:
                    "API endpoint not found."
            });
        }

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "login.html"
            )
        );
    }
);

/* =========================
   ERROR HANDLER
========================= */

app.use(
    (
        err,
        req,
        res,
        next
    ) => {
        console.error(
            "Unhandled error:",
            err
        );

        res.status(500).json({
            message:
                "Internal server error",

            error:
                process.env.NODE_ENV ===
                "production"
                    ? undefined
                    : err.message
        });
    }
);

/* =========================
   START SERVER
========================= */

app.listen(
    PORT,
    () => {
        console.log(
            "=========================================="
        );

        console.log(
            " EnergyFlow - Cloud Energy Monitor"
        );

        console.log(
            "=========================================="
        );

        console.log(
            `Server: http://localhost:${PORT}`
        );

        console.log(
            `Storage: ${
                process.env.STORAGE_MODE ||
                "local"
            }`
        );

        console.log(
            "Health:  /api/health"
        );

        console.log(
            "=========================================="
        );
    }
);