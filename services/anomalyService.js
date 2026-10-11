const {
  getCollection,
  COLLECTIONS
} = require("../database/mongodb");

const { config } = require("../config/env");

function calculateMean(values) {
  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) /
    values.length;
}

function calculateStandardDeviation(values, mean) {
  if (values.length === 0) return 0;

  const variance =
    values.reduce(
      (sum, value) => sum + Math.pow(value - mean, 2),
      0
    ) / values.length;

  return Math.sqrt(variance);
}

function detectAnomaly(currentPowerWatts, historicalValues) {
  const current = Number(currentPowerWatts);

  if (!Number.isFinite(current) || current < 0) {
    throw new Error("Current power must be a non-negative number.");
  }

  const history = historicalValues
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (history.length < config.anomalyMinReadings) {
    return {
      isAnomaly: false,
      reason: "Insufficient historical readings.",
      sampleCount: history.length
    };
  }

  const mean = calculateMean(history);

  const standardDeviation = calculateStandardDeviation(
    history,
    mean
  );

  const threshold =
    mean +
    config.anomalyThresholdMultiplier * standardDeviation;

  /*
   * Require the current reading to exceed both the statistical
   * threshold and the historical mean.
   */
  const isAnomaly =
    current > threshold &&
    current > mean;

  return {
    isAnomaly,
    currentPowerWatts: Number(current.toFixed(2)),
    historicalMeanWatts: Number(mean.toFixed(2)),
    standardDeviationWatts: Number(
      standardDeviation.toFixed(2)
    ),
    thresholdWatts: Number(threshold.toFixed(2)),
    sampleCount: history.length,
    reason: isAnomaly
      ? "Power consumption is unusually high compared with historical readings."
      : "No unusually high power consumption detected."
  };
}

async function analyzeReading(reading) {
  const history = await getCollection(
    COLLECTIONS.READINGS
  )
    .find({
      homeId: reading.homeId,
      applianceId: reading.applianceId,
      timestamp: { $lt: reading.timestamp },
      readingId: { $ne: reading.readingId }
    })
    .sort({ timestamp: -1 })
    .limit(100)
    .project({
      _id: 0,
      powerWatts: 1
    })
    .toArray();

  const result = detectAnomaly(
    reading.powerWatts,
    history.map((item) => item.powerWatts)
  );

  return {
    ...result,
    readingId: reading.readingId,
    homeId: reading.homeId,
    applianceId: reading.applianceId,
    timestamp: reading.timestamp
  };
}

module.exports = {
  calculateMean,
  calculateStandardDeviation,
  detectAnomaly,
  analyzeReading
};