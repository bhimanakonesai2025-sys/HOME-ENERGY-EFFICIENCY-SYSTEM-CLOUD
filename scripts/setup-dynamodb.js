require("dotenv").config();

const {
    CreateTableCommand,
    DescribeTableCommand
} = require(
    "@aws-sdk/client-dynamodb"
);

const {
    client,
    region
} = require(
    "../config/aws"
);

const {
    TABLES
} = require(
    "../services/db"
);


/* =====================================================
   DYNAMODB TABLE DEFINITIONS
===================================================== */

const definitions = [

    /* -------------------------
       USERS
    ------------------------- */

    {
        TableName:
            TABLES.users,

        KeySchema: [
            {
                AttributeName:
                    "email",

                KeyType:
                    "HASH"
            }
        ],

        AttributeDefinitions: [
            {
                AttributeName:
                    "email",

                AttributeType:
                    "S"
            }
        ]
    },


    /* -------------------------
       HOMES
    ------------------------- */

    {
        TableName:
            TABLES.homes,

        KeySchema: [
            {
                AttributeName:
                    "homeId",

                KeyType:
                    "HASH"
            }
        ],

        AttributeDefinitions: [
            {
                AttributeName:
                    "homeId",

                AttributeType:
                    "S"
            }
        ]
    },


    /* -------------------------
       APPLIANCES
    ------------------------- */

    {
        TableName:
            TABLES.appliances,

        KeySchema: [
            {
                AttributeName:
                    "homeId",

                KeyType:
                    "HASH"
            },

            {
                AttributeName:
                    "deviceId",

                KeyType:
                    "RANGE"
            }
        ],

        AttributeDefinitions: [
            {
                AttributeName:
                    "homeId",

                AttributeType:
                    "S"
            },

            {
                AttributeName:
                    "deviceId",

                AttributeType:
                    "S"
            }
        ]
    },


    /* -------------------------
       ENERGY READINGS
    ------------------------- */

    {
        TableName:
            TABLES.readings,

        KeySchema: [
            {
                AttributeName:
                    "homeId",

                KeyType:
                    "HASH"
            },

            {
                AttributeName:
                    "readingKey",

                KeyType:
                    "RANGE"
            }
        ],

        AttributeDefinitions: [
            {
                AttributeName:
                    "homeId",

                AttributeType:
                    "S"
            },

            {
                AttributeName:
                    "readingKey",

                AttributeType:
                    "S"
            },

            {
                AttributeName:
                    "deviceId",

                AttributeType:
                    "S"
            },

            {
                AttributeName:
                    "timestamp",

                AttributeType:
                    "S"
            }
        ],


        /*
         * This index allows readings
         * to be queried by device.
         */

        GlobalSecondaryIndexes: [

            {
                IndexName:
                    "DeviceTimestampIndex",

                KeySchema: [
                    {
                        AttributeName:
                            "deviceId",

                        KeyType:
                            "HASH"
                    },

                    {
                        AttributeName:
                            "timestamp",

                        KeyType:
                            "RANGE"
                    }
                ],

                Projection: {
                    ProjectionType:
                        "ALL"
                }
            }

        ]
    }

];


/* =====================================================
   CHECK WHETHER TABLE EXISTS
===================================================== */

async function tableExists(
    name
) {
    try {
        await client.send(
            new DescribeTableCommand({
                TableName:
                    name
            })
        );

        return true;

    } catch (error) {

        if (
            error.name ===
            "ResourceNotFoundException"
        ) {
            return false;
        }

        throw error;
    }
}


/* =====================================================
   CREATE TABLES
===================================================== */

async function main() {

    console.log(
        "=========================================="
    );

    console.log(
        " EnergyFlow - DynamoDB Setup"
    );

    console.log(
        "=========================================="
    );

    console.log(
        `AWS Region: ${region}`
    );


    for (
        const definition of
        definitions
    ) {

        const exists =
            await tableExists(
                definition.TableName
            );


        if (exists) {

            console.log(
                `✓ ${definition.TableName} already exists`
            );

            continue;
        }


        await client.send(
            new CreateTableCommand({

                ...definition,

                /*
                 * On-demand billing.
                 *
                 * This avoids manually
                 * provisioning read/write
                 * capacity for this project.
                 */

                BillingMode:
                    "PAY_PER_REQUEST"

            })
        );


        console.log(
            `✓ Created ${definition.TableName}`
        );
    }


    console.log(
        "=========================================="
    );

    console.log(
        "DynamoDB setup complete."
    );

    console.log(
        "=========================================="
    );
}


/* =====================================================
   RUN
===================================================== */

main()
    .catch(
        error => {

            console.error(
                "DynamoDB setup failed:",
                error
            );

            process.exit(
                1
            );
        }
    );