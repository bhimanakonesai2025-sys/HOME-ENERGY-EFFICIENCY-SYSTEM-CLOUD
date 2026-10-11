require('dotenv').config();

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const { MongoClient } = require('mongodb');
const fs = require('node:fs/promises');
const path = require('node:path');

async function backupDatabase() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;

    if (!uri || !dbName) {
        throw new Error('MongoDB configuration is missing.');
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();

        const db = client.db(dbName);

        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-');

        const backupDir = path.join(
            __dirname,
            '..',
            'backups',
            `backup-${timestamp}`
        );

        await fs.mkdir(backupDir, { recursive: true });

        const collections = [
            'users',
            'homes',
            'appliances',
            'readings',
            'alerts',
            'jobs'
        ];

        for (const collectionName of collections) {
            const collection = db.collection(collectionName);

            const documents = await collection
                .find({})
                .toArray();

            const outputPath = path.join(
                backupDir,
                `${collectionName}.json`
            );

            await fs.writeFile(
                outputPath,
                JSON.stringify(documents, null, 2),
                'utf8'
            );

            console.log(
                `${collectionName}: ${documents.length} documents backed up`
            );
        }

        console.log('\nBackup completed successfully.');
        console.log(`Backup location: ${backupDir}`);
    } finally {
        await client.close();
    }
}

backupDatabase().catch(error => {
    console.error('Backup failed:', error.message);
    process.exitCode = 1;
});