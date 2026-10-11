(() => {
    "use strict";

    if (!EnergyAPI.requireLogin()) return;

    const $ = (id) => document.getElementById(id);

    const errorElement = $("analytics-error");
    const refreshButton = $("refresh-button");
    const tableBody = $("appliance-analytics-table");

    let dailyChart = null;
    let monthlyChart = null;
    let applianceChart = null;
    let loading = false;

    function showError(message) {
        if (!errorElement) return;

        errorElement.textContent = message;
        errorElement.className = "analytics-message error";
        errorElement.hidden = false;
    }

    function hideError() {
        if (!errorElement) return;

        errorElement.textContent = "";
        errorElement.hidden = true;
    }

    function formatNumber(value, digits = 4) {
        const number = Number(value);

        if (!Number.isFinite(number)) return "—";

        return number.toLocaleString("en-IN", {
            maximumFractionDigits: digits
        });
    }

    function formatEnergy(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) return "—";

        // Preserve small but non-zero measurements.
        if (number !== 0 && Math.abs(number) < 0.01) {
            return number.toFixed(6);
        }

        return formatNumber(number, 4);
    }

    function formatCurrency(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) return "—";

        return number.toLocaleString("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function extractArray(response, keys = []) {
        if (Array.isArray(response)) return response;

        for (const key of keys) {
            if (Array.isArray(response?.[key])) {
                return response[key];
            }
        }

        return [];
    }

    function getEnergy(item) {
        const candidates = [
            item?.totalEnergyKwh,
            item?.energyKwh,
            item?.energy
        ];

        for (const candidate of candidates) {
            if (
                candidate !== undefined &&
                candidate !== null &&
                candidate !== "" &&
                Number.isFinite(Number(candidate))
            ) {
                return Number(candidate);
            }
        }

        return null;
    }

    function getReadingCount(item) {
        const candidates = [
            item?.readingCount,
            item?.readings,
            item?.count
        ];

        for (const candidate of candidates) {
            if (
                candidate !== undefined &&
                candidate !== null &&
                Number.isFinite(Number(candidate))
            ) {
                return Number(candidate);
            }
        }

        return 0;
    }

    function getLabel(item, keys) {
        for (const key of keys) {
            if (
                item?.[key] !== undefined &&
                item[key] !== null
            ) {
                return String(item[key]);
            }
        }

        return "Unknown";
    }

    function getCost(item) {
        const value = item?.estimatedCost ?? item?.cost;

        if (
            value === undefined ||
            value === null ||
            !Number.isFinite(Number(value))
        ) {
            return null;
        }

        return Number(value);
    }

    function createChart(
        canvasId,
        existingChart,
        labels,
        values,
        label
    ) {
        const canvas = $(canvasId);

        if (!canvas || typeof Chart === "undefined") {
            return existingChart;
        }

        if (existingChart) {
            existingChart.destroy();
        }

        return new Chart(canvas, {
            type: "bar",

            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderWidth: 1,
                    borderRadius: 6,
                    backgroundColor: "rgba(59, 130, 246, 0.65)",
                    borderColor: "rgb(59, 130, 246)"
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                interaction: {
                    intersect: false,
                    mode: "index"
                },

                plugins: {
                    legend: {
                        display: true,
                        position: "top"
                    },

                    tooltip: {
                        callbacks: {
                            label(context) {
                                return `${label}: ${
                                    formatEnergy(context.raw)
                                } kWh`;
                            }
                        }
                    }
                },

                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },

                    y: {
                        beginAtZero: true,

                        title: {
                            display: true,
                            text: "Energy (kWh)"
                        }
                    }
                }
            }
        });
    }

    function renderEmptyTable(message) {
        if (!tableBody) return;

        tableBody.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 3;
        cell.textContent = message;

        row.appendChild(cell);
        tableBody.appendChild(row);
    }

    function renderApplianceTable(appliances) {
        if (!tableBody) return;

        tableBody.replaceChildren();

        if (!appliances.length) {
            renderEmptyTable(
                "No appliance consumption data is available."
            );
            return;
        }

        for (const appliance of appliances) {
            const row = document.createElement("tr");

            const nameCell = document.createElement("td");
            const energyCell = document.createElement("td");
            const costCell = document.createElement("td");

            nameCell.textContent = getLabel(appliance, [
                "applianceName",
                "name",
                "applianceId"
            ]);

            const energy = getEnergy(appliance);
            const cost = getCost(appliance);

            energyCell.textContent =
                energy === null
                    ? "Unavailable"
                    : `${formatEnergy(energy)} kWh`;

            costCell.textContent =
                cost === null
                    ? "Unavailable"
                    : formatCurrency(cost);

            row.append(nameCell, energyCell, costCell);
            tableBody.appendChild(row);
        }
    }

    function renderSummary(daily, appliances) {
        const readingsElement = $("analytics-total-readings");
        const energyElement = $("analytics-total-energy");
        const costElement = $("analytics-total-cost");

        /*
         * Appliance groups cover all imported readings.
         * Daily groups are not added to appliance groups because
         * that would count the same readings twice.
         */
        const totalReadings = appliances.reduce(
            (sum, item) => sum + getReadingCount(item),
            0
        );

        const applianceEnergies = appliances
            .map(getEnergy)
            .filter(value => value !== null);

        let totalEnergy = null;

        if (applianceEnergies.length > 0) {
            totalEnergy = applianceEnergies.reduce(
                (sum, value) => sum + value,
                0
            );
        } else {
            const dailyEnergies = daily
                .map(getEnergy)
                .filter(value => value !== null);

            if (dailyEnergies.length > 0) {
                totalEnergy = dailyEnergies.reduce(
                    (sum, value) => sum + value,
                    0
                );
            }
        }

        const costs = appliances
            .map(getCost)
            .filter(value => value !== null);

        if (readingsElement) {
            readingsElement.textContent =
                totalReadings > 0
                    ? formatNumber(totalReadings, 0)
                    : "0";
        }

        if (energyElement) {
            energyElement.textContent =
                totalEnergy === null
                    ? "—"
                    : `${formatEnergy(totalEnergy)} kWh`;
        }

        if (costElement) {
            if (costs.length > 0) {
                const totalCost = costs.reduce(
                    (sum, value) => sum + value,
                    0
                );

                costElement.textContent =
                    formatCurrency(totalCost);
            } else {
                costElement.textContent = "—";
            }
        }
    }

    function renderCharts(daily, monthly, appliances) {
        dailyChart = createChart(
            "daily-chart",
            dailyChart,
            daily.map(item =>
                getLabel(item, ["date", "_id", "day"])
            ),
            daily.map(item => getEnergy(item) ?? 0),
            "Energy (kWh)"
        );

        monthlyChart = createChart(
            "monthly-chart",
            monthlyChart,
            monthly.map(item =>
                getLabel(item, ["month", "_id"])
            ),
            monthly.map(item => getEnergy(item) ?? 0),
            "Energy (kWh)"
        );

        applianceChart = createChart(
            "appliance-chart",
            applianceChart,
            appliances.map(item =>
                getLabel(item, [
                    "applianceName",
                    "name",
                    "applianceId"
                ])
            ),
            appliances.map(item => getEnergy(item) ?? 0),
            "Energy (kWh)"
        );
    }

    async function loadAnalytics() {
        if (loading) return;

        loading = true;

        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.textContent = "Loading...";
        }

        hideError();

        try {
            const [
                dailyResponse,
                monthlyResponse,
                applianceResponse
            ] = await Promise.all([
                EnergyAPI.get("/api/analytics/daily"),
                EnergyAPI.get("/api/analytics/monthly"),
                EnergyAPI.get("/api/analytics/appliances")
            ]);

            if (
                dailyResponse?.success === false ||
                monthlyResponse?.success === false ||
                applianceResponse?.success === false
            ) {
                throw new Error(
                    dailyResponse?.error ||
                    monthlyResponse?.error ||
                    applianceResponse?.error ||
                    "The analytics API returned an error."
                );
            }

            const daily = extractArray(
                dailyResponse,
                ["daily", "data", "results"]
            );

            const monthly = extractArray(
                monthlyResponse,
                ["monthly", "data", "results"]
            );

            const appliances = extractArray(
                applianceResponse,
                ["appliances", "data", "results"]
            );

            renderCharts(daily, monthly, appliances);
            renderApplianceTable(appliances);
            renderSummary(daily, appliances);

            if (!daily.length && !monthly.length && !appliances.length) {
                showError(
                    "No analytics data was returned. " +
                    "Check that the imported readings belong to your account."
                );
            }
        } catch (error) {
            console.error("[Analytics]", error);

            showError(
                error.message || "Unable to load analytics."
            );

            renderEmptyTable(
                "Unable to load appliance analytics."
            );
        } finally {
            loading = false;

            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.textContent = "↻ Refresh";
            }
        }
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", loadAnalytics);
    }

    const logoutButton = $("logout-button");

    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            EnergyAPI.logout();
        });
    }

    loadAnalytics();
})();