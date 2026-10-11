require("dotenv").config();

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient } = require("mongodb");
const { randomUUID } = require("node:crypto");

async function migrate() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("MongoDB configuration is missing.");
  }

  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000
  });

  try {
    await client.connect();

    const db = client.db(process.env.MONGODB_DB_NAME);
    const users = db.collection("users");
    const homes = db.collection("homes");
    const appliances = db.collection("appliances");

    console.log("Connected to MongoDB.");

    const userDocs = await users.find({}).toArray();
    const homeDocs = await homes.find({}).toArray();
    const applianceDocs = await appliances.find({}).toArray();

    // Prepare stable identifiers for existing users and homes.
    const plans = [];
    const homeIdByOldId = new Map();
    const userIdByOldMongoId = new Map();

    for (const user of userDocs) {
      const oldUserId = String(user._id);

      const home = homeDocs.find(
        item => String(item.userId) === oldUserId
      );

      if (!home) {
        throw new Error(
          `Cannot find a home for user ${oldUserId}. Nothing was changed.`
        );
      }

      const userId = user.userId || randomUUID();
      const homeId = home.homeId || randomUUID();

      plans.push({ user, home, userId, homeId });

      userIdByOldMongoId.set(oldUserId, userId);
      homeIdByOldId.set(String(home._id), homeId);
    }

    if (plans.length !== homeDocs.length) {
      throw new Error(
        "Some homes do not match an existing user. Nothing was changed."
      );
    }

    // Validate appliance relationships before making any updates.
    const appliancePlans = applianceDocs.map(appliance => {
      const oldHomeId = String(appliance.homeId || "");
      const homeId = homeIdByOldId.get(oldHomeId);

      if (!homeId) {
        throw new Error(
          `Appliance ${appliance._id} has an unknown home. Nothing was changed.`
        );
      }

      const home = homeDocs.find(
        item => String(item._id) === oldHomeId
      );

      const ownerOldId = String(home.userId);
      const userId = userIdByOldMongoId.get(ownerOldId);

      if (!userId) {
        throw new Error(
          `Cannot identify appliance owner. Nothing was changed.`
        );
      }

      return {
        appliance,
        homeId,
        userId,
        applianceId: appliance.applianceId || randomUUID()
      };
    });

    // Check IDs for duplicates before writing anything.
    const ensureUnique = (values, label) => {
      if (new Set(values).size !== values.length) {
        throw new Error(`Duplicate ${label} values detected. Nothing was changed.`);
      }
    };

    ensureUnique(plans.map(p => p.userId), "userId");
    ensureUnique(plans.map(p => p.homeId), "homeId");
    ensureUnique(
      appliancePlans.map(p => `${p.homeId}:${p.applianceId}`),
      "homeId/applianceId"
    );

    // Refuse to overwrite a conflicting identifier belonging to another record.
    for (const p of plans) {
      const existingHome = await homes.findOne({
        homeId: p.homeId,
        _id: { $ne: p.home._id }
      });

      if (existingHome) {
        throw new Error("A homeId collision was detected. Nothing was changed.");
      }
    }

    console.log(
      `Validated ${plans.length} users, ${plans.length} homes, ` +
      `and ${appliancePlans.length} appliances.`
    );

    /*
     * Apply the migration.
     * Existing MongoDB _id values, password fields, names, and legacy fields
     * are preserved.
     */

    for (const p of plans) {
      await homes.updateOne(
        { _id: p.home._id },
        {
          $set: {
            homeId: p.homeId,
            userId: p.userId
          }
        }
      );
    }

    for (const p of plans) {
      await users.updateOne(
        { _id: p.user._id },
        {
          $set: {
            userId: p.userId,
            homeId: p.homeId
          }
        }
      );
    }

    for (const p of appliancePlans) {
      const appliance = p.appliance;

      await appliances.updateOne(
        { _id: appliance._id },
        {
          $set: {
            homeId: p.homeId,
            userId: p.userId,
            applianceId: p.applianceId,
            ratedPowerWatts: Number(
              appliance.ratedPowerWatts ?? appliance.power ?? 0
            ),
            category: appliance.category || "Other",
            status: appliance.status || "active"
          }
        }
      );
    }

    // Verify migrated records.
    const missingHomes = await homes.countDocuments({
      $or: [
        { homeId: { $exists: false } },
        { homeId: null },
        { userId: { $exists: false } }
      ]
    });

    const missingAppliances = await appliances.countDocuments({
      $or: [
        { applianceId: { $exists: false } },
        { homeId: { $exists: false } },
        { userId: { $exists: false } }
      ]
    });

    if (missingHomes || missingAppliances) {
      throw new Error(
        `Verification failed: missing homes=${missingHomes}, ` +
        `missing appliances=${missingAppliances}. Keep the backup.`
      );
    }

    console.log("Migration completed.");
    console.log(`Users: ${userDocs.length}`);
    console.log(`Homes: ${homeDocs.length}`);
    console.log(`Appliances: ${applianceDocs.length}`);
    console.log("Existing password fields were preserved.");
  } finally {
    await client.close();
  }
}

migrate().catch(error => {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
});