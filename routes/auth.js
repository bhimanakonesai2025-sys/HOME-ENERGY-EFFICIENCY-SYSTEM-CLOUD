"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");

const {
    randomUUID,
    randomBytes,
    createHash
} = require("crypto");

const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const {
    createToken,
    requireAuth
} = require("../middleware/auth");

const {
    seedDemoHome
} = require("../services/demoDataService");

const {
    sendVerificationEmail
} = require("../services/emailService");

const router = express.Router();

const VERIFICATION_EXPIRY_MS = 30 * 60 * 1000;
const DEMO_MODE = process.env.DEMO_MODE === "true";

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashToken(token) {
    return createHash("sha256")
        .update(token)
        .digest("hex");
}

function getAppBaseUrl() {
    return (
        process.env.APP_BASE_URL ||
        "http://localhost:5000"
    ).replace(/\/+$/, "");
}

function publicUser(user) {
    return {
        userId: user.userId,
        name: user.name,
        email: user.email,
        homeId: user.homeId,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified !== false
    };
}

/* =========================
   REGISTER
========================= */

router.post("/register", async (req, res, next) => {
    let homeId;
    let userId;
    let homeCreated = false;
    let userCreated = false;

    try {
        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (name.length < 2 || name.length > 80) {
            return res.status(400).json({
                success: false,
                error: "Name must contain between 2 and 80 characters."
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                error: "Enter a valid email address."
            });
        }

        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                error: "Password must contain between 8 and 72 characters."
            });
        }

        const users = getCollection(COLLECTIONS.USERS);
        const homes = getCollection(COLLECTIONS.HOMES);

        const existingUser = await users.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: "An account with this email already exists."
            });
        }

        userId = randomUUID();
        homeId = randomUUID();

        const now = new Date().toISOString();
        const passwordHash = await bcrypt.hash(password, 12);

        const user = {
            userId,
            homeId,
            name,
            email,
            passwordHash,
            emailVerified: DEMO_MODE,
            createdAt: now,
            updatedAt: now
        };

        let verificationToken = null;

        if (!DEMO_MODE) {
            verificationToken = randomBytes(32).toString("hex");

            user.emailVerificationTokenHash =
                hashToken(verificationToken);

            user.emailVerificationExpiresAt =
                new Date(Date.now() + VERIFICATION_EXPIRY_MS);
        }

        const home = {
            homeId,
            userId,
            name: `${name}'s Home`,
            dataMode: "SIMULATED_DEMO",
            createdAt: now,
            updatedAt: now
        };

        await homes.insertOne(home);
        homeCreated = true;

        await seedDemoHome(home, userId);

        await users.insertOne(user);
        userCreated = true;

        if (!DEMO_MODE) {
            const verificationUrl =
                `${getAppBaseUrl()}/verify-email.html` +
                `?token=${verificationToken}`;

            try {
                await sendVerificationEmail({
                    email,
                    name,
                    verificationUrl
                });
            } catch (emailError) {
                console.error(
                    "[AUTH] Verification email could not be sent."
                );

                return res.status(503).json({
                    success: false,
                    accountCreated: true,
                    emailVerificationRequired: true,
                    error:
                        "Account created, but verification email " +
                        "could not be sent. Request a new email later."
                });
            }
        }

        return res.status(201).json({
            success: true,
            accountCreated: true,
            emailVerificationRequired: !DEMO_MODE,
            message: DEMO_MODE
                ? "Demo account created. You can sign in now."
                : "Account created. Verify your email before signing in."
        });

    } catch (error) {
        if (!userCreated && homeCreated && homeId) {
            await getCollection(COLLECTIONS.READINGS)
                .deleteMany({ homeId })
                .catch(() => {});

            await getCollection(COLLECTIONS.APPLIANCES)
                .deleteMany({ homeId })
                .catch(() => {});

            await getCollection(COLLECTIONS.HOMES)
                .deleteOne({ homeId })
                .catch(() => {});
        }

        next(error);
    }
});

/* =========================
   VERIFY EMAIL
========================= */

router.post("/verify-email", async (req, res, next) => {
    try {
        const token = String(req.body.token || "");

        if (!/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({
                success: false,
                error: "Invalid or expired verification link."
            });
        }

        const users = getCollection(COLLECTIONS.USERS);

        const user = await users.findOne({
            emailVerificationTokenHash: hashToken(token),
            emailVerificationExpiresAt: { $gt: new Date() },
            emailVerified: false
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                error: "Invalid or expired verification link."
            });
        }

        const now = new Date().toISOString();

        const result = await users.updateOne(
            {
                userId: user.userId,
                emailVerificationTokenHash: hashToken(token),
                emailVerified: false
            },
            {
                $set: {
                    emailVerified: true,
                    emailVerifiedAt: now,
                    updatedAt: now
                },
                $unset: {
                    emailVerificationTokenHash: "",
                    emailVerificationExpiresAt: ""
                }
            }
        );

        if (result.modifiedCount !== 1) {
            return res.status(400).json({
                success: false,
                error: "Invalid or expired verification link."
            });
        }

        return res.json({
            success: true,
            message: "Email verified successfully. You can now sign in."
        });

    } catch (error) {
        next(error);
    }
});

/* =========================
   RESEND VERIFICATION
========================= */

router.post("/resend-verification", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                error: "Enter a valid email address."
            });
        }

        const users = getCollection(COLLECTIONS.USERS);
        const user = await users.findOne({ email });

        if (!user || user.emailVerified !== false) {
            return res.json({
                success: true,
                message:
                    "If an unverified account exists, a new " +
                    "verification email will be sent."
            });
        }

        const token = randomBytes(32).toString("hex");

        await users.updateOne(
            {
                userId: user.userId,
                emailVerified: false
            },
            {
                $set: {
                    emailVerificationTokenHash: hashToken(token),
                    emailVerificationExpiresAt:
                        new Date(Date.now() + VERIFICATION_EXPIRY_MS),
                    updatedAt: new Date().toISOString()
                }
            }
        );

        await sendVerificationEmail({
            email: user.email,
            name: user.name,
            verificationUrl:
                `${getAppBaseUrl()}/verify-email.html?token=${token}`
        });

        return res.json({
            success: true,
            message: "A new verification email has been sent."
        });

    } catch (error) {
        return res.status(503).json({
            success: false,
            error: "Unable to send verification email right now."
        });
    }
});

/* =========================
   LOGIN
========================= */

router.post("/login", async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (!isValidEmail(email) || !password) {
            return res.status(400).json({
                success: false,
                error: "Enter a valid email and password."
            });
        }

        const user = await getCollection(COLLECTIONS.USERS)
            .findOne({ email });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password."
            });
        }

        const storedHash = user.passwordHash || user.password;

        if (
            typeof storedHash !== "string" ||
            !/^\$2[aby]\$\d{2}\$/.test(storedHash)
        ) {
            return res.status(401).json({
                success: false,
                error: "Unable to verify this account's password."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            storedHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password."
            });
        }

        // Demo-only bypass. Normal verification remains enforced
        // whenever DEMO_MODE is not set to "true".
        if (!DEMO_MODE && user.emailVerified === false) {
            return res.status(403).json({
                success: false,
                emailVerificationRequired: true,
                error: "Please verify your email before signing in."
            });
        }

        return res.json({
            success: true,
            message: "Login successful.",
            token: createToken(user),
            user: publicUser(user)
        });

    } catch (error) {
        next(error);
    }
});

/* =========================
   CURRENT USER
========================= */

router.get("/me", requireAuth, async (req, res, next) => {
    try {
        const user = await getCollection(COLLECTIONS.USERS).findOne(
            { userId: req.user.userId },
            {
                projection: {
                    _id: 0,
                    password: 0,
                    passwordHash: 0,
                    emailVerificationTokenHash: 0,
                    emailVerificationExpiresAt: 0
                }
            }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User account not found."
            });
        }

        return res.json({
            success: true,
            user: publicUser(user)
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;