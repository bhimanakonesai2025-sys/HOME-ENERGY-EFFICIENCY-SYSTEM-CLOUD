const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
    PutCommand,
    GetCommand,
    QueryCommand,
    ScanCommand
} = require("@aws-sdk/lib-dynamodb");

const {
    docClient
} = require("../config/aws");

const MODE =
    (process.env.STORAGE_MODE || "local")
        .toLowerCase();

const TABLES = {
    users:
        "EnergyFlowUsers",

    homes:
        "EnergyFlowHomes",

    appliances:
        "EnergyFlowAppliances",

    readings:
        "EnergyFlowReadings"
};

const localPath =
    path.join(
        __dirname,
        "..",
        "data",
        "local-db.json"
    );


function id(prefix = "") {

    return (
        prefix +
        crypto.randomUUID()
    );

}


function emptyDb() {

    return {

        users: [],

        homes: [],

        appliances: [],

        readings: []

    };

}


function readLocal() {

    if (!fs.existsSync(localPath)) {

        fs.mkdirSync(
            path.dirname(localPath),
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            localPath,
            JSON.stringify(
                emptyDb(),
                null,
                2
            )
        );

    }

    return JSON.parse(
        fs.readFileSync(
            localPath,
            "utf8"
        )
    );

}


function writeLocal(db) {

    fs.mkdirSync(
        path.dirname(localPath),
        {
            recursive: true
        }
    );

    fs.writeFileSync(
        localPath,
        JSON.stringify(
            db,
            null,
            2
        )
    );

}


function clone(obj) {

    return JSON.parse(
        JSON.stringify(obj)
    );

}


/* =========================
   USERS
========================= */

async function createUser(user) {

    if (MODE === "local") {

        const db =
            readLocal();

        db.users.push(
            clone(user)
        );

        writeLocal(db);

        return user;

    }

    await docClient.send(
        new PutCommand({

            TableName:
                TABLES.users,

            Item:
                user

        })
    );

    return user;

}


async function getUserByEmail(email) {

    const normalized =
        email
            .toLowerCase()
            .trim();

    if (MODE === "local") {

        const db =
            readLocal();

        return (
            db.users.find(
                user =>
                    user.email ===
                    normalized
            ) || null
        );

    }

    const result =
        await docClient.send(
            new GetCommand({

                TableName:
                    TABLES.users,

                Key: {

                    email:
                        normalized

                }

            })
        );

    return result.Item || null;

}


/* =========================
   HOMES
========================= */

async function createHome(home) {

    if (MODE === "local") {

        const db =
            readLocal();

        db.homes.push(
            clone(home)
        );

        writeLocal(db);

        return home;

    }

    await docClient.send(
        new PutCommand({

            TableName:
                TABLES.homes,

            Item:
                home

        })
    );

    return home;

}


async function getHome(homeId) {

    if (MODE === "local") {

        const db =
            readLocal();

        return (
            db.homes.find(
                home =>
                    home.homeId ===
                    homeId
            ) || null
        );

    }

    const result =
        await docClient.send(
            new GetCommand({

                TableName:
                    TABLES.homes,

                Key: {

                    homeId

                }

            })
        );

    return result.Item || null;

}


/* =========================
   APPLIANCES
========================= */

async function createAppliance(
    appliance
) {

    if (MODE === "local") {

        const db =
            readLocal();

        const existingIndex =
            db.appliances.findIndex(
                item =>
                    item.homeId ===
                        appliance.homeId &&
                    item.deviceId ===
                        appliance.deviceId
            );

        if (existingIndex >= 0) {

            db.appliances[
                existingIndex
            ] = {

                ...db.appliances[
                    existingIndex
                ],

                ...appliance

            };

        } else {

            db.appliances.push(
                clone(appliance)
            );

        }

        writeLocal(db);

        return appliance;

    }

    await docClient.send(
        new PutCommand({

            TableName:
                TABLES.appliances,

            Item:
                appliance

        })
    );

    return appliance;

}


async function listAppliances(
    homeId
) {

    if (MODE === "local") {

        const db =
            readLocal();

        return db.appliances.filter(
            appliance =>
                appliance.homeId ===
                homeId
        );

    }

    const result =
        await docClient.send(
            new QueryCommand({

                TableName:
                    TABLES.appliances,

                KeyConditionExpression:
                    "homeId = :homeId",

                ExpressionAttributeValues: {

                    ":homeId":
                        homeId

                }

            })
        );

    return result.Items || [];

}


/* =========================
   ENERGY READINGS
========================= */

async function createReading(
    reading
) {

    const item = {

        ...reading,

        readingKey:
            reading.readingKey ||
            `${
                reading.timestamp
            }#${
                reading.readingId ||
                id("reading-")
            }`

    };


    if (MODE === "local") {

        const db =
            readLocal();

        db.readings.push(
            clone(item)
        );

        /*
         * Keep local development
         * storage from growing forever.
         */

        if (db.readings.length > 20000) {

            db.readings =
                db.readings.slice(
                    -20000
                );

        }

        writeLocal(db);

        return item;

    }


    await docClient.send(
        new PutCommand({

            TableName:
                TABLES.readings,

            Item:
                item

        })
    );

    return item;

}


/* ============================================================
   LIST READINGS FOR A HOME
   ============================================================ */

async function listReadings(
    homeId,
    limit = 500
) {

    if (MODE === "local") {

        const db =
            readLocal();

        return db.readings

            .filter(
                reading =>
                    reading.homeId ===
                    homeId
            )

            .sort(
                (a, b) =>
                    new Date(
                        b.timestamp
                    ) -
                    new Date(
                        a.timestamp
                    )
            )

            .slice(
                0,
                limit
            );

    }


    const result =
        await docClient.send(
            new QueryCommand({

                TableName:
                    TABLES.readings,

                KeyConditionExpression:
                    "homeId = :homeId",

                ExpressionAttributeValues: {

                    ":homeId":
                        homeId

                },

                ScanIndexForward:
                    false,

                Limit:
                    limit

            })
        );

    return result.Items || [];

}


/* ============================================================
   LIST ALL READINGS FOR A HOME
   ============================================================ */

async function listAllReadings(
    homeId,
    maxItems = 5000
) {

    if (MODE === "local") {

        const db =
            readLocal();

        return db.readings

            .filter(
                reading =>
                    reading.homeId ===
                    homeId
            )

            .sort(
                (a, b) =>
                    new Date(
                        b.timestamp
                    ) -
                    new Date(
                        a.timestamp
                    )
            )

            .slice(
                0,
                maxItems
            );

    }


    const items = [];

    let ExclusiveStartKey;


    do {

        const result =
            await docClient.send(
                new QueryCommand({

                    TableName:
                        TABLES.readings,

                    KeyConditionExpression:
                        "homeId = :homeId",

                    ExpressionAttributeValues: {

                        ":homeId":
                            homeId

                    },

                    ExclusiveStartKey,

                    ScanIndexForward:
                        false,

                    Limit:
                        Math.min(
                            1000,
                            maxItems -
                            items.length
                        )

                })
            );


        items.push(
            ...(result.Items || [])
        );


        ExclusiveStartKey =
            result.LastEvaluatedKey;


        if (
            items.length >=
            maxItems
        ) {

            break;

        }


    } while (
        ExclusiveStartKey
    );


    return items.slice(
        0,
        maxItems
    );

}


/* ============================================================
   REFERENCE DATA
   ============================================================ */

/*
 * The current prototype uses the real UK-DALE dataset
 * as a shared reference/demo dataset.
 *
 * We deliberately do NOT copy these readings into every
 * user's home. That would unnecessarily duplicate data.
 *
 * The actual fallback decision will be handled by the
 * energy routes after checking whether the user's home
 * has its own readings.
 */


/* ============================================================
   TOTAL READING COUNT
   ============================================================ */

async function getReadingCount() {

    if (MODE === "local") {

        return readLocal()
            .readings.length;

    }


    const result =
        await docClient.send(
            new ScanCommand({

                TableName:
                    TABLES.readings,

                Select:
                    "COUNT"

            })
        );

    return result.Count || 0;

}

async function listReferenceReadings(
    maxItems = 5000
) {

    if (MODE === "local") {

        const db =
            readLocal();

        return db.readings

            .filter(
                reading =>
                    reading.source ===
                    "UK-DALE-real-dataset"
            )

            .sort(
                (a, b) =>
                    new Date(
                        b.timestamp
                    ) -
                    new Date(
                        a.timestamp
                    )
            )

            .slice(
                0,
                maxItems
            );
    }

    /*
     * Cloud fallback:
     * reference readings are identified
     * by their dataset source.
     *
     * This is used only for the shared
     * demonstration/reference dataset.
     */

    const result =
        await docClient.send(
            new ScanCommand({
                TableName:
                    TABLES.readings,

                FilterExpression:
                    "#source = :source",

                ExpressionAttributeNames: {
                    "#source":
                        "source"
                },

                ExpressionAttributeValues: {
                    ":source":
                        "UK-DALE-real-dataset"
                }
            })
        );

    return (result.Items || [])
        .sort(
            (a, b) =>
                new Date(b.timestamp) -
                new Date(a.timestamp)
        )
        .slice(
            0,
            maxItems
        );
}

module.exports = {

    MODE,

    TABLES,

    id,

    createUser,

    getUserByEmail,

    createHome,

    getHome,

    createAppliance,

    listAppliances,

    createReading,

    listReadings,

    listAllReadings,

    listReferenceReadings,

    getReadingCount

};