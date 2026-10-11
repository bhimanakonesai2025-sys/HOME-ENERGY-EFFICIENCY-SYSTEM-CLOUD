require("dotenv").config();

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient } = require("mongodb");

async function main() {
    if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
        throw new Error("MongoDB configuration is missing.");
    }

    const client = new MongoClient(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 15000
    });

    try {
        await client.connect();

        const db = client.db(process.env.MONGODB_DB_NAME);

        for (const name of [
            "users",
            "homes",
            "appliances",
            "readings",
            "alerts",
            "jobs"
        ]) {
            const collection = db.collection(name);
            const indexes = await collection.indexes();

            console.log(`\n${name}:`);

            for (const index of indexes) {
                console.log({
                    name: index.name,
                    key: index.key,
                    unique: index.unique === true,
                    sparse: index.sparse === true
                });
            }
        }

        console.log("\nInspection completed. No changes made.");
    } finally {
        await client.close();
    }
}

main().catch(error => {
    console.error("Inspection failed:", error.message);
    process.exitCode = 1;
});