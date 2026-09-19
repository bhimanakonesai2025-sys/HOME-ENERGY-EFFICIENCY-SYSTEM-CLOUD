const fs = require("fs");
const path = require("path");
const readline = require("readline");
require("dotenv").config();

const {
    createReading,
    createAppliance
} = require("../services/db");

const HOME_ID =
    getArgument("--home") ||
    "a1b6c5eb-7990-4ee7-8b71-bd9770788210";

const LIMIT =
    Number(getArgument("--limit")) || 500;

const DATA_DIR = path.join(
    __dirname,
    "..",
    "data",
    "ukdale",
    "house_1"
);

/*
    UK-DALE dataset used in this project

    channel_1 → aggregate
    channel_2 → fridge
    channel_3 → washing machine
    channel_4 → kettle
    channel_5 → rice cooker
    channel_6 → dishwasher
    channel_7 → microwave
    channel_8 → tv
*/

const CHANNELS = [
    {
        channel: 2,
        name: "Fridge"
    },
    {
        channel: 3,
        name: "Washing Machine"
    },
    {
        channel: 4,
        name: "Kettle"
    },
    {
        channel: 5,
        name: "Rice Cooker"
    },
    {
        channel: 6,
        name: "Dishwasher"
    },
    {
        channel: 7,
        name: "Microwave"
    },
    {
        channel: 8,
        name: "TV"
    }
];

async function importChannel(channelInfo) {
    const filePath = path.join(
        DATA_DIR,
        `channel_${channelInfo.channel}.dat`
    );

    if (!fs.existsSync(filePath)) {
        console.log(
            `⚠️ Missing file: channel_${channelInfo.channel}.dat`
        );

        return 0;
    }

    console.log(
        `\n📥 Importing ${channelInfo.name}...`
    );

    let count = 0;
    let previousTimestamp = null;

    const fileStream =
        fs.createReadStream(filePath);

    const rl =
        readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

    for await (const line of rl) {
        if (count >= LIMIT) {
            break;
        }

        const trimmed =
            line.trim();

        if (!trimmed) {
            continue;
        }

        const parts =
            trimmed.split(/\s+/);

        if (parts.length < 2) {
            continue;
        }

        const timestamp =
            Number(parts[0]);

        const power =
            Number(parts[1]);

        if (
            !Number.isFinite(timestamp) ||
            !Number.isFinite(power)
        ) {
            continue;
        }

        if (power < 0) {
            continue;
        }

        /*
            UK-DALE readings are normally 6 seconds apart.

            We calculate the actual interval from
            consecutive timestamps whenever possible.
        */

        let intervalSeconds = 6;

        if (previousTimestamp !== null) {
            const difference =
                timestamp - previousTimestamp;

            if (
                difference > 0 &&
                difference <= 3600
            ) {
                intervalSeconds =
                    difference;
            }
        }

        previousTimestamp =
            timestamp;

        const energyConsumed =
            (
                power *
                intervalSeconds
            ) / 3600000;

        const reading = {
            homeId: HOME_ID,

            deviceId:
                `ukdale-house1-channel-${channelInfo.channel}`,

            deviceName:
                channelInfo.name,

            power: Number(
                power.toFixed(3)
            ),

            energyConsumed:
                Number(
                    energyConsumed.toFixed(8)
                ),

            intervalSeconds,

            timestamp:
                new Date(
                    timestamp * 1000
                ).toISOString(),

            source:
                "UK-DALE-real-dataset"
        };

        await createReading(reading);

        await createAppliance({
            homeId: HOME_ID,

            deviceId:
                `ukdale-house1-channel-${channelInfo.channel}`,

            name:
                channelInfo.name,

            power:
                Number(
                    power.toFixed(3)
                ),

            hoursUsed:
                intervalSeconds / 3600,

            energyConsumed:
                Number(
                    energyConsumed.toFixed(8)
                )
        });

        count++;

        if (count % 100 === 0) {
            console.log(
                `   ${count} real readings imported`
            );
        }
    }

    console.log(
        `✅ ${channelInfo.name}: ${count} readings imported`
    );

    return count;
}

async function main() {
    console.log(
        "\n========================================"
    );

    console.log(
        "   ENERGYFLOW - UK-DALE DATA IMPORT"
    );

    console.log(
        "========================================"
    );

    console.log(
        `Home ID: ${HOME_ID}`
    );

    console.log(
        `Readings per appliance: ${LIMIT}`
    );

    console.log(
        `Data folder: ${DATA_DIR}`
    );

    console.log(
        "\nSource: UK-DALE real measured dataset"
    );

    console.log(
        "Random/simulated values: NONE"
    );

    let totalImported = 0;

    for (const channel of CHANNELS) {
        const imported =
            await importChannel(channel);

        totalImported +=
            imported;
    }

    console.log(
        "\n========================================"
    );

    console.log(
        `🎉 TOTAL READINGS IMPORTED: ${totalImported}`
    );

    console.log(
        "========================================\n"
    );
}

function getArgument(name) {
    const index =
        process.argv.indexOf(name);

    if (
        index === -1 ||
        index + 1 >= process.argv.length
    ) {
        return null;
    }

    return process.argv[index + 1];
}

main().catch(error => {
    console.error(
        "\n❌ Import failed:"
    );

    console.error(
        error
    );

    process.exit(1);
});