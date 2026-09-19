const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const {
    createUser,
    getUserByEmail,
    createHome
} = require("../services/db");

const router =
    express.Router();

/* =========================
   JWT
========================= */

function makeToken(user) {
    return jwt.sign(
        {
            userId:
                user.userId,

            email:
                user.email,

            homeId:
                user.homeId,

            name:
                user.name
        },

        process.env.JWT_SECRET,

        {
            expiresIn:
                "8h"
        }
    );
}

/* =========================
   REGISTER
========================= */

router.post(
    "/register",
    async (req, res) => {
        try {
            const name =
                String(
                    req.body.name ||
                    ""
                ).trim();

            const email =
                String(
                    req.body.email ||
                    ""
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body.password ||
                    ""
                );

            if (
                !name ||
                !email ||
                password.length < 6
            ) {
                return res.status(
                    400
                ).json({
                    message:
                        "Name, email and a password of at least 6 characters are required."
                });
            }

            const existing =
                await getUserByEmail(
                    email
                );

            if (existing) {
                return res.status(
                    409
                ).json({
                    message:
                        "An account with this email already exists."
                });
            }

            const userId =
                crypto.randomUUID();

            const homeId =
                crypto.randomUUID();

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );

            const now =
                new Date()
                    .toISOString();

            const user = {
                userId,
                name,
                email,
                passwordHash,
                homeId,
                createdAt:
                    now
            };

            const home = {
                homeId,
                ownerId:
                    userId,
                name:
                    `${name}'s Home`,
                createdAt:
                    now
            };

            await createUser(
                user
            );

            await createHome(
                home
            );

            const token =
                makeToken(
                    user
                );

            res.status(
                201
            ).json({
                message:
                    "Registration successful.",

                token,

                user: {
                    userId,
                    name,
                    email,
                    homeId
                }
            });

        } catch (error) {
            console.error(
                "Registration error:",
                error
            );

            res.status(
                500
            ).json({
                message:
                    "Registration failed."
            });
        }
    }
);

/* =========================
   LOGIN
========================= */

router.post(
    "/login",
    async (req, res) => {
        try {
            const email =
                String(
                    req.body.email ||
                    ""
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body.password ||
                    ""
                );

            const user =
                await getUserByEmail(
                    email
                );

            if (!user) {
                return res.status(
                    401
                ).json({
                    message:
                        "Invalid email or password."
                });
            }

            const valid =
                await bcrypt.compare(
                    password,
                    user.passwordHash
                );

            if (!valid) {
                return res.status(
                    401
                ).json({
                    message:
                        "Invalid email or password."
                });
            }

            const token =
                makeToken(
                    user
                );

            res.json({
                message:
                    "Login successful.",

                token,

                user: {
                    userId:
                        user.userId,

                    name:
                        user.name,

                    email:
                        user.email,

                    homeId:
                        user.homeId
                }
            });

        } catch (error) {
            console.error(
                "Login error:",
                error
            );

            res.status(
                500
            ).json({
                message:
                    "Login failed."
            });
        }
    }
);

module.exports = router;