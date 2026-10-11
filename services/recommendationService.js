const {
  getCollection,
  COLLECTIONS
} = require("../database/mongodb");

const KNOWLEDGE_BASE = [
  {
    category: "Cooling",
    keywords: ["air conditioner", "ac", "cooler"],
    title: "Optimize cooling settings",
    message:
      "Use a moderate cooling temperature, clean filters regularly, and keep doors and windows closed while cooling.",
    priority: "high"
  },
  {
    category: "Laundry",
    keywords: ["washing machine", "washer", "laundry"],
    title: "Run full laundry loads",
    message:
      "Run the washing machine with appropriately sized full loads and use an energy-efficient wash setting when suitable.",
    priority: "medium"
  },
  {
    category: "Refrigeration",
    keywords: ["refrigerator", "fridge", "freezer"],
    title: "Improve refrigeration efficiency",
    message:
      "Allow ventilation around the refrigerator, check door seals, and avoid leaving the door open unnecessarily.",
    priority: "medium"
  },
  {
    category: "Lighting",
    keywords: ["light", "lamp", "bulb"],
    title: "Reduce lighting consumption",
    message:
      "Switch off lights in unused rooms and consider efficient LED lighting.",
    priority: "low"
  },
  {
    category: "Entertainment",
    keywords: ["television", "tv", "computer", "desktop"],
    title: "Reduce standby consumption",
    message:
      "Turn off equipment when it is not needed and enable power-saving settings where available.",
    priority: "low"
  },
  {
    category: "General",
    keywords: [],
    title: "Review appliance usage",
    message:
      "Review your appliance's consumption history to identify opportunities to reduce unnecessary operating time.",
    priority: "low"
  }
];

function matchRecommendation(appliance) {
  const text = [
    appliance.name || "",
    appliance.category || ""
  ]
    .join(" ")
    .toLowerCase();

  return (
    KNOWLEDGE_BASE.find((item) =>
      item.keywords.some((keyword) => text.includes(keyword))
    ) ||
    KNOWLEDGE_BASE.find((item) => item.category === "General")
  );
}

async function generateRecommendations(homeId) {
  const appliances = await getCollection(
    COLLECTIONS.APPLIANCES
  )
    .find({
      homeId,
      status: "active"
    })
    .project({
      _id: 0,
      applianceId: 1,
      name: 1,
      category: 1,
      ratedPowerWatts: 1
    })
    .toArray();

  const recommendations = [];

  for (const appliance of appliances) {
    const recommendation = matchRecommendation(appliance);

    recommendations.push({
      recommendationId: `${appliance.applianceId}-${recommendation.category}`,
      applianceId: appliance.applianceId,
      applianceName: appliance.name,
      category: recommendation.category,
      title: recommendation.title,
      message: recommendation.message,
      priority: recommendation.priority
    });
  }

  return recommendations;
}

module.exports = {
  KNOWLEDGE_BASE,
  matchRecommendation,
  generateRecommendations
};