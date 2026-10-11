(() => {
    "use strict";

    if (!EnergyAPI.requireLogin()) return;

    const $ = (id) => document.getElementById(id);

    const tbody = $("alerts-table-body");
    const errorElement = $("alerts-error");
    const emptyElement = $("alerts-empty");
    const refreshButton = $("refresh-button");

    const totalElement = $("total-alerts");
    const highElement = $("high-alerts");
    const openElement = $("open-alerts");

    let allAlerts = [];
    let activeFilter = "all";
    let loading = false;

    function showError(message) {
        errorElement.textContent = message;
        errorElement.hidden = false;
    }

    function hideError() {
        errorElement.textContent = "";
        errorElement.hidden = true;
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? "—"
            : date.toLocaleString("en-IN");
    }

    function createCell(value) {
        const cell = document.createElement("td");
        cell.textContent = value == null ? "—" : String(value);
        return cell;
    }

    function getSeverity(alert) {
        return String(alert.severity || "medium").toLowerCase();
    }

    function getStatus(alert) {
        return String(alert.status || "open").toLowerCase();
    }

    function extractAlerts(response) {
        if (Array.isArray(response)) return response;

        for (const key of ["alerts", "data", "results"]) {
            if (Array.isArray(response?.[key])) {
                return response[key];
            }
        }

        return [];
    }

    function renderSummary() {
        totalElement.textContent = allAlerts.length;

        highElement.textContent = allAlerts.filter(alert =>
            getSeverity(alert) === "high" ||
            getSeverity(alert) === "critical"
        ).length;

        openElement.textContent = allAlerts.filter(alert =>
            !["resolved", "closed"].includes(getStatus(alert))
        ).length;
    }

    function renderAlerts() {
        tbody.replaceChildren();

        const filtered = allAlerts.filter(alert => {
            return activeFilter === "all" ||
                getSeverity(alert) === activeFilter;
        });

        if (filtered.length === 0) {
            emptyElement.hidden = false;

            const row = document.createElement("tr");
            const cell = createCell(
                allAlerts.length === 0
                    ? "No alerts have been generated yet."
                    : "No alerts match the selected severity."
            );

            cell.colSpan = 5;
            row.appendChild(cell);
            tbody.appendChild(row);

            return;
        }

        emptyElement.hidden = true;

        for (const alert of filtered) {
            const row = document.createElement("tr");

            row.appendChild(createCell(
                alert.applianceName ||
                alert.applianceId ||
                "Unknown appliance"
            ));

            row.appendChild(createCell(
                alert.message ||
                alert.description ||
                "No description provided"
            ));

            const severityCell = createCell(getSeverity(alert));
            const severity = getSeverity(alert);

            const badge = document.createElement("span");
            badge.className = `severity severity-${severity}`;
            badge.textContent = severity;

            severityCell.replaceChildren(badge);
            row.appendChild(severityCell);

            const statusCell = createCell(getStatus(alert));

            const statusBadge = document.createElement("span");
            statusBadge.className = "status-badge";
            statusBadge.textContent = getStatus(alert);

            statusCell.replaceChildren(statusBadge);
            row.appendChild(statusCell);

            row.appendChild(createCell(
                formatDate(
                    alert.createdAt ||
                    alert.detectedAt ||
                    alert.timestamp
                )
            ));

            tbody.appendChild(row);
        }
    }

    async function loadAlerts() {
        if (loading) return;

        loading = true;
        refreshButton.disabled = true;
        refreshButton.textContent = "Loading...";

        hideError();
        emptyElement.hidden = true;

        tbody.replaceChildren();

        const loadingRow = document.createElement("tr");
        const loadingCell = createCell("Loading alerts...");
        loadingCell.colSpan = 5;
        loadingRow.appendChild(loadingCell);
        tbody.appendChild(loadingRow);

        try {
            const response = await EnergyAPI.get("/api/alerts");

            if (response?.success === false) {
                throw new Error(response.error || "Unable to load alerts.");
            }

            allAlerts = extractAlerts(response);

            renderSummary();
            renderAlerts();

        } catch (error) {
            console.error("[EnergyFlow Alerts]", error);

            allAlerts = [];

            totalElement.textContent = "—";
            highElement.textContent = "—";
            openElement.textContent = "—";

            tbody.replaceChildren();
            emptyElement.hidden = true;

            showError(
                error.message || "Unable to load alerts. Please try again."
            );
        } finally {
            loading = false;
            refreshButton.disabled = false;
            refreshButton.textContent = "↻ Refresh";
        }
    }

    document.querySelectorAll("[data-filter]").forEach(button => {
        button.addEventListener("click", () => {
            activeFilter = button.dataset.filter;

            document.querySelectorAll("[data-filter]").forEach(item => {
                item.classList.toggle("active", item === button);
            });

            renderAlerts();
        });
    });

    refreshButton.addEventListener("click", loadAlerts);

    const logoutButton = $("logout-button");

    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            EnergyAPI.logout();
        });
    }

    loadAlerts();
})();