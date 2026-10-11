(function () {
    "use strict";

    if (!EnergyAPI.requireLogin()) return;

    const $ = (selector) => document.querySelector(selector);

    const grid = $("#appliance-grid");
    const message = $("#appliance-message");
    const refreshButton = $("#refresh-appliances");

    const totalAppliances = $("#total-appliances");
    const totalReadings = $("#total-readings");
    const totalEnergy = $("#total-energy");

    function formatNumber(value, digits = 2) {
        const number = Number(value);

        if (!Number.isFinite(number)) return "—";

        return number.toLocaleString("en-IN", {
            maximumFractionDigits: digits
        });
    }

    function showMessage(title, description, type = "info") {
        message.replaceChildren();

        const heading = document.createElement("strong");
        heading.textContent = title;

        const detail = document.createElement("div");
        detail.textContent = description;

        message.append(heading, detail);
        message.className = `state-message ${type}`;
        message.hidden = false;
        grid.hidden = true;
    }

    function getApplianceIcon(name) {
        const value = String(name || "").toLowerCase();

        if (value.includes("fridge") || value.includes("refrigerator")) {
            return "🧊";
        }

        if (value.includes("wash")) return "🧺";
        if (value.includes("kettle")) return "🫖";
        if (value.includes("rice cooker")) return "🍚";
        if (value.includes("dishwasher")) return "🍽️";
        if (value.includes("microwave")) return "♨️";

        if (value === "tv" || value.includes("television")) {
            return "📺";
        }

        return "⚡";
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    function createMetric(label, value) {
        const container = document.createElement("div");

        container.append(
            createElement("span", "metric-label", label),
            createElement("span", "metric-value", value)
        );

        return container;
    }

    function createApplianceCard(appliance) {
        const card = createElement("article", "appliance-card");

        const top = createElement("div", "appliance-card-top");

        const icon = createElement(
            "div",
            "appliance-icon",
            getApplianceIcon(appliance.name)
        );

        icon.setAttribute("aria-hidden", "true");

        const inactive = appliance.status === "inactive";

        const badge = createElement(
            "span",
            "appliance-status",
            inactive ? "Inactive" : "Available"
        );

        if (inactive) {
            badge.style.background = "#f1f5f9";
            badge.style.color = "#64748b";
        }

        top.append(icon, badge);

        const name = createElement(
            "h3",
            "appliance-name",
            appliance.name || "Unnamed appliance"
        );

        const category = createElement(
            "div",
            "appliance-category",
            appliance.category || "Uncategorized"
        );

        const metrics = createElement("div", "appliance-metrics");

        const ratedPower = Number(appliance.ratedPowerWatts);

        const ratedPowerText =
            Number.isFinite(ratedPower) && ratedPower > 0
                ? `${formatNumber(ratedPower)} W`
                : "Not available";

        metrics.append(
            createMetric(
                "Recorded measurements",
                formatNumber(appliance.readingCount || 0, 0)
            ),

            createMetric(
                "Measured energy",
                `${formatNumber(appliance.totalEnergyKwh || 0, 8)} kWh`
            ),

            createMetric(
                "Average recorded power",
                `${formatNumber(appliance.averagePowerWatts || 0)} W`
            ),

            createMetric(
                "Rated power",
                ratedPowerText
            )
        );

        card.append(top, name, category, metrics);

        return card;
    }

    function renderAppliances(result) {
        const appliances = result.appliances || [];
        const summary = result.summary || {};

        grid.replaceChildren();

        totalAppliances.textContent = formatNumber(
            summary.totalAppliances ?? appliances.length,
            0
        );

        totalReadings.textContent = formatNumber(
            summary.totalReadings ?? 0,
            0
        );

        totalEnergy.textContent =
            `${formatNumber(summary.totalEnergyKwh ?? 0, 8)} kWh`;

        if (appliances.length === 0) {
            showMessage(
                "No appliances found",
                "No dataset-backed appliances were returned for this home. Check the dataset import and account configuration."
            );

            return;
        }

        for (const appliance of appliances) {
            grid.appendChild(createApplianceCard(appliance));
        }

        grid.hidden = false;
        message.hidden = true;
    }

    async function loadAppliances() {
        refreshButton.disabled = true;
        refreshButton.textContent = "Loading...";

        showMessage(
            "Loading appliances...",
            "Retrieving dataset-backed appliance statistics."
        );

        try {
            const result = await EnergyAPI.get("/api/appliances");

            if (!result || result.success === false) {
                throw new Error(
                    result?.error || "Unable to retrieve appliances."
                );
            }

            renderAppliances(result);
        } catch (error) {
            showMessage(
                "Unable to load appliances",
                error.message || "Please try refreshing the page.",
                "error"
            );
        } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = "↻ Refresh";
        }
    }

    refreshButton.addEventListener("click", loadAppliances);

    loadAppliances();
})();