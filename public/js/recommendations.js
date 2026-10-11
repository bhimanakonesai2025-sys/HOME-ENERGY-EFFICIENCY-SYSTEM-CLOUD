(() => {
    "use strict";

    if (!EnergyAPI.requireLogin()) return;

    const $ = (id) => document.getElementById(id);

    const grid = $("recommendations-grid");
    const emptyElement = $("recommendations-empty");
    const errorElement = $("recommendations-error");
    const refreshButton = $("refresh-button");

    const totalElement = $("recommendation-count");
    const highElement = $("high-priority-count");
    const coveredElement = $("covered-appliances");

    let loading = false;

    function showError(message) {
        errorElement.textContent = message;
        errorElement.hidden = false;
    }

    function hideError() {
        errorElement.textContent = "";
        errorElement.hidden = true;
    }

    function extractRecommendations(response) {
        if (Array.isArray(response)) return response;

        for (const key of ["recommendations", "data", "results"]) {
            if (Array.isArray(response?.[key])) {
                return response[key];
            }
        }

        return [];
    }

    function getPriority(item) {
        return String(
            item.priority ||
            item.severity ||
            "low"
        ).toLowerCase();
    }

    function getApplianceName(item) {
        return item.applianceName ||
            item.appliance?.name ||
            item.name ||
            item.applianceId ||
            "General energy efficiency";
    }

    function getDescription(item) {
        return item.message ||
            item.description ||
            item.recommendation ||
            item.action ||
            "No recommendation details are available.";
    }

    function getIcon(name) {
        const value = String(name).toLowerCase();

        if (value.includes("fridge") || value.includes("refrigerator")) {
            return "🧊";
        }

        if (value.includes("washing") || value.includes("laundry")) {
            return "🧺";
        }

        if (value.includes("kettle")) return "🫖";
        if (value.includes("rice cooker")) return "🍚";
        if (value.includes("dishwasher")) return "🍽️";
        if (value.includes("microwave")) return "♨️";
        if (value.includes("television") || value.includes("tv")) {
            return "📺";
        }

        return "⚡";
    }

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;

        return element;
    }

    function renderSummary(items) {
        totalElement.textContent = items.length;

        highElement.textContent = items.filter(item => {
            const priority = getPriority(item);

            return priority === "high" || priority === "critical";
        }).length;

        const appliances = new Set(
            items
                .map(item => item.applianceId || item.applianceName)
                .filter(Boolean)
        );

        coveredElement.textContent = appliances.size;
    }

    function renderRecommendations(items) {
        grid.replaceChildren();

        if (items.length === 0) {
            grid.hidden = true;
            emptyElement.hidden = false;

            emptyElement.replaceChildren(
                makeElement("h3", "", "No recommendations available"),
                makeElement(
                    "p",
                    "",
                    "The recommendation service has not returned any recommendations for the current dataset."
                )
            );

            return;
        }

        emptyElement.hidden = true;
        grid.hidden = false;

        /*
         * Remove exact duplicate recommendation records from display.
         * This does not delete anything from MongoDB.
         */
        const uniqueItems = [];
        const seen = new Set();

        for (const item of items) {
            const key = [
                item.applianceId || item.applianceName || item.name || "",
                getDescription(item).trim().toLowerCase(),
                getPriority(item)
            ].join("|");

            if (seen.has(key)) continue;

            seen.add(key);
            uniqueItems.push(item);
        }

        renderSummary(uniqueItems);

        for (const item of uniqueItems) {
            const name = getApplianceName(item);
            const description = getDescription(item);
            const priority = getPriority(item);

            const card = makeElement(
                "article",
                "recommendation-card"
            );

            const top = makeElement("div", "recommendation-top");

            const icon = makeElement(
                "div",
                "recommendation-icon",
                getIcon(name)
            );

            const badge = makeElement(
                "span",
                `priority priority-${priority}`,
                priority
            );

            top.append(icon, badge);

            const heading = makeElement("h3", "", name);

            const category = makeElement(
                "div",
                "recommendation-category",
                item.category || item.applianceCategory || "Energy efficiency"
            );

            const details = makeElement(
                "p",
                "recommendation-description",
                description
            );

            card.append(top, heading, category, details);

            const savings = item.estimatedSavingsKwh ??
                item.potentialSavingsKwh;

            const costSavings = item.estimatedCostSavings ??
                item.potentialCostSavings;

            if (
                savings !== undefined ||
                costSavings !== undefined
            ) {
                const footer = makeElement(
                    "div",
                    "recommendation-footer"
                );

                const parts = [];

                if (
                    savings !== undefined &&
                    Number.isFinite(Number(savings))
                ) {
                    parts.push(
                        `Potential energy savings: ${Number(savings).toFixed(2)} kWh`
                    );
                }

                if (
                    costSavings !== undefined &&
                    Number.isFinite(Number(costSavings))
                ) {
                    parts.push(
                        `Estimated cost savings: ₹${Number(costSavings).toFixed(2)}`
                    );
                }

                footer.textContent = parts.join(" · ");
                card.appendChild(footer);
            }

            grid.appendChild(card);
        }
    }

    async function loadRecommendations() {
        if (loading) return;

        loading = true;
        refreshButton.disabled = true;
        refreshButton.textContent = "Loading...";

        hideError();

        grid.hidden = true;
        emptyElement.hidden = false;

        emptyElement.replaceChildren(
            makeElement("h3", "", "Loading recommendations..."),
            makeElement("p", "", "Retrieving results from EnergyFlow.")
        );

        try {
            const response = await EnergyAPI.get(
                "/api/recommendations"
            );

            if (response?.success === false) {
                throw new Error(
                    response.error || "Unable to load recommendations."
                );
            }

            const recommendations =
                extractRecommendations(response);

            renderRecommendations(recommendations);

        } catch (error) {
            console.error("[EnergyFlow Recommendations]", error);

            grid.replaceChildren();
            grid.hidden = true;

            emptyElement.hidden = true;

            showError(
                error.message ||
                "Unable to load recommendations. Please try again."
            );

            totalElement.textContent = "—";
            highElement.textContent = "—";
            coveredElement.textContent = "—";

        } finally {
            loading = false;
            refreshButton.disabled = false;
            refreshButton.textContent = "↻ Refresh";
        }
    }

    refreshButton.addEventListener(
        "click",
        loadRecommendations
    );

    const logoutButton = $("logout-button");

    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            EnergyAPI.logout();
        });
    }

    loadRecommendations();
})();