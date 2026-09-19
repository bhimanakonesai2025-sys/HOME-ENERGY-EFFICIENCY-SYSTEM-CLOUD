const fs = require("fs");
const path = require("path");

const knowledgePath = path.join(
    __dirname,
    "knowledge",
    "energy-knowledge.txt"
);

function loadKnowledge() {
    if (!fs.existsSync(knowledgePath)) {
        return "";
    }

    return fs.readFileSync(
        knowledgePath,
        "utf8"
    );
}

/*
    Each section of the knowledge file starts
    with an appliance/topic heading.

    Example:

    REFRIGERATOR
    Refrigerator recommendations...

    TELEVISION
    Television recommendations...
*/

function splitSections(text) {
    return text
        .split(/\n\s*\n/)
        .map(section => section.trim())
        .filter(Boolean);
}

function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/*
    Different names can refer to the same appliance.
*/

const applianceAliases = {
    "fridge": [
        "fridge",
        "refrigerator",
        "refrigerator freezer",
        "fridge freezer"
    ],

    "television": [
        "tv",
        "television"
    ],

    "washing machine": [
        "washing machine",
        "washing_machine"
    ],

    "kettle": [
        "kettle"
    ],

    "dishwasher": [
        "dishwasher",
        "dish washer"
    ],

    "microwave": [
        "microwave"
    ],

    "rice cooker": [
        "rice cooker",
        "rice_cooker"
    ],

    "toaster": [
        "toaster"
    ],

    "lighting": [
        "lighting",
        "kitchen lights",
        "lights"
    ]
};

function getAliases(deviceName) {
    const normalized = normalize(deviceName);

    for (const aliases of Object.values(applianceAliases)) {
        if (
            aliases.some(
                alias =>
                    normalize(alias) === normalized
            )
        ) {
            return aliases.map(normalize);
        }
    }

    return [normalized];
}

function getSectionHeading(section) {
    const firstLine =
        section.split(/\r?\n/)[0] || "";

    return normalize(firstLine);
}

function isMatchingApplianceSection(
    section,
    aliases
) {
    const heading =
        getSectionHeading(section);

    /*
        We match the HEADING rather than searching
        the entire section.

        This prevents a TV section from matching
        words such as "refrigerator" that happen to
        appear elsewhere.
    */

    return aliases.some(
        alias =>
            heading === alias ||
            heading.includes(alias) ||
            alias.includes(heading)
    );
}

function getRagRecommendations(deviceName) {
    const knowledge =
        loadKnowledge();

    if (!knowledge) {
        return [];
    }

    const sections =
        splitSections(knowledge);

    const aliases =
        getAliases(deviceName);

    /*
        First priority:
        exact appliance-specific section.
    */

    const direct =
        sections.filter(section =>
            isMatchingApplianceSection(
                section,
                aliases
            )
        );

    if (direct.length > 0) {
        return direct;
    }

    /*
        If an appliance does not have a dedicated
        section in the knowledge base, return only
        the general energy-analysis guidance.

        NEVER dump unrelated appliance sections.
    */

    const general =
        sections.filter(section => {
            const heading =
                getSectionHeading(section);

            return (
                heading === "energy analysis" ||
                heading === "energy efficiency"
            );
        });

    return general;
}

module.exports = {
    getRagRecommendations,
    loadKnowledge
};