const express = require("express");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");

const {
    getCollection,
    COLLECTIONS
} = require("../database/mongodb");

const {
    createToken,
    requireAuth
} = require("../middleware/auth");

const router = express.Router();

// Normalize email addresses before looking them up.
function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

// Validate email syntax only; this does not verify mailbox ownership.
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Never expose password hashes or other private authentication fields.
function publicUser(user) {
    return {
        userId: user.userId,
        name: user.name,
        email: user.email,
        homeId: user.homeId,
        createdAt: user.createdAt
    };
}

/*
|--------------------------------------------------------------------------
| POST /api/auth/register
|--------------------------------------------------------------------------
| Body:
| {
|   "name": "Demo User",
|   "email": "demo@example.com",
|   "password": "ExamplePassword123"
| }
*/
router.post("/register", async (req, res, next) => {
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

        const existingUser = await users.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: "An account with this email already exists."
            });
        }

        const userId = randomUUID();
        const homeId = randomUUID();
        const now = new Date().toISOString();

        const passwordHash = await bcrypt.hash(password, 12);

        const user = {
            userId,
            homeId,
            name,
            email,
            passwordHash,
            createdAt: now,
            updatedAt: now
        };

        const home = {
            homeId,
            userId,
            name: `${name}'s Home`,
            createdAt: now,
            updatedAt: now
        };

        // Create the home first.
        await getCollection(COLLECTIONS.HOMES).insertOne(home);

        try {
            await users.insertOne(user);
        } catch (error) {
            // Roll back the home if user creation fails.
            await getCollection(COLLECTIONS.HOMES)
                .deleteOne({ homeId })
                .catch(() => {});

            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    error: "An account with this email already exists."
                });
            }

            throw error;
        }

        const token = createToken(user);

        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            token,
            user: publicUser(user)
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/auth/login
|--------------------------------------------------------------------------
| Body:
| {
|   "email": "demo@example.com",
|   "password": "ExamplePassword123"
| }
*/
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

        const users = getCollection(COLLECTIONS.USERS);
        const user = await users.findOne({ email });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password."
            });
        }

        /*
         * Current accounts use passwordHash.
         * Older accounts may have a field named password.
         */
        const storedHash = user.passwordHash || user.password;

        if (typeof storedHash !== "string" || !storedHash) {
            console.error(
                "[AUTH] Password hash is missing for an account."
            );

            return res.status(401).json({
                success: false,
                error: "Unable to verify this account's password. " +
                    "Please use account recovery."
            });
        }

        /*
         * Do not assume every legacy hash uses bcrypt.
         * Standard bcrypt hashes begin with $2a$, $2b$, or $2y$.
         */
        const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(storedHash);

        if (!isBcryptHash) {
            console.error(
                "[AUTH] Legacy password format requires recovery."
            );

            return res.status(401).json({
                success: false,
                error: "This account uses an older password format. " +
                    "A secure password recovery process is required."
            });
        }

        let passwordMatches;

        try {
            passwordMatches = await bcrypt.compare(
                password,
                storedHash
            );
        } catch (error) {
            console.error(
                "[AUTH] Password verification failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                error: "Unable to verify the password."
            });
        }

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password."
            });
        }

        const token = createToken(user);

        return res.json({
            success: true,
            message: "Login successful.",
            token,
            user: publicUser(user)
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| GET /api/auth/me
|--------------------------------------------------------------------------
| Requires:
| Authorization: Bearer YOUR_JWT_TOKEN
*/
router.get("/me", requireAuth, async (req, res, next) => {
    try {
        const user = await getCollection(COLLECTIONS.USERS).findOne(
            { userId: req.user.userId },
            {
                projection: {
                    _id: 0,
                    password: 0,
                    passwordHash: 0
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