(function () {
  "use strict";

  if (!EnergyAPI.requireLogin()) return;

  const $ = (selector) => document.querySelector(selector);

  let isLoading = false;

  // Format numbers without losing small energy values.
  function formatNumber(value, digits = 4) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "0";

    return number.toLocaleString("en-IN", {
      maximumFractionDigits: digits
    });
  }

  // Format energy accurately.
  function formatEnergy(value) {
    const energy = Number(value);

    if (!Number.isFinite(energy) || energy <= 0) {
      return "0 kWh";
    }

    if (energy < 0.0001) {
      return `${energy.toFixed(8)} kWh`;
    }

    if (energy < 0.01) {
      return `${energy.toFixed(6)} kWh`;
    }

    return `${formatNumber(energy)} kWh`;
  }

  // Format power in watts.
  function formatPower(value) {
    const power = Number(value);

    if (!Number.isFinite(power)) return "0 W";

    return `${formatNumber(power, 2)} W`;
  }

  // Format timestamps.
  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  }

  // Safely update an element if it exists.
  function setText(selector, value) {
    const element = $(selector);

    if (element) {
      element.textContent = value;
    }
  }

  // Display errors.
  function showError(message) {
    const element = $("#dashboard-error");

    if (element) {
      element.textContent = message;
      element.hidden = false;
    } else {
      console.error("[EnergyFlow Dashboard]", message);
    }
  }

  // Clear previous errors.
  function hideError() {
    const element = $("#dashboard-error");

    if (element) {
      element.textContent = "";
      element.hidden = true;
    }
  }

  // Render dashboard statistics.
  function renderStatistics(data) {
    if (!data) {
      throw new Error("Dashboard statistics are missing.");
    }

    // Total number of imported measurements.
    setText(
      "#total-readings",
      formatNumber(data.totalReadings, 0)
    );

    // Number of active appliances.
    setText(
      "#active-appliances",
      formatNumber(data.activeAppliances, 0)
    );

    // Energy measured today.
    setText(
      "#today-energy",
      formatEnergy(data.today?.totalEnergyKwh ?? 0)
    );

    // Estimated cost for today's measurements.
    setText(
      "#today-cost",
      `₹${formatNumber(data.today?.estimatedCost ?? 0, 2)}`
    );

    // Unread alerts.
    setText(
      "#unread-alerts",
      formatNumber(data.unreadAlerts, 0)
    );

    // Pending background jobs.
    setText(
      "#pending-jobs",
      formatNumber(data.pendingBackgroundJobs, 0)
    );

    /*
     * Total energy across ALL imported historical readings.
     * This is different from today's energy.
     */
    const historicalEnergy =
      data.totalRecordedEnergyKwh ??
      data.historical?.totalEnergyKwh ??
      0;

    setText(
      "#total-recorded-energy",
      formatEnergy(historicalEnergy)
    );

    // Estimated cost for all historical readings.
    const historicalCost =
      data.estimatedTotalCost ??
      data.historical?.estimatedCost ??
      0;

    setText(
      "#total-recorded-cost",
      `₹${formatNumber(historicalCost, 2)}`
    );

    // Optional historical statistics elements.
    setText(
      "#historical-reading-count",
      formatNumber(
        data.historical?.readingCount ??
        data.totalReadings ??
        0,
        0
      )
    );

    setText(
      "#average-power",
      formatPower(
        data.historical?.averagePowerWatts ?? 0
      )
    );
  }

  // Render the most recent readings.
  function renderReadings(readings) {
    const body = $("#recent-readings");

    if (!body) {
      console.error(
        "The #recent-readings element was not found in index.html."
      );
      return;
    }

    body.replaceChildren();

    if (!Array.isArray(readings) || readings.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 4;
      cell.className = "empty-state";
      cell.textContent =
        "No energy measurements are available.";

      row.appendChild(cell);
      body.appendChild(row);

      return;
    }

    for (const reading of readings) {
      const row = document.createElement("tr");

      const values = [
        formatDate(reading.timestamp),

        reading.applianceName ||
          reading.applianceId ||
          "Unknown appliance",

        formatPower(reading.powerWatts),

        formatEnergy(reading.energyKwh)
      ];

      for (const value of values) {
        const cell = document.createElement("td");

        cell.textContent = value;
        row.appendChild(cell);
      }

      body.appendChild(row);
    }
  }

  // Show the dataset source when matching HTML elements exist.
  function renderDataSource(dataSource) {
    if (!dataSource) return;

    const sourceName = dataSource.name || "UK-DALE";
    const houseNumber = dataSource.house || 1;

    setText(
      "#data-source",
      `${sourceName} House ${houseNumber}`
    );

    setText(
      "#data-source-description",
      dataSource.description ||
        "Historical household electricity measurements."
    );
  }

  // Display the current user's name and home.
  function renderUserAndHome(home) {
    if (home?.name) {
      setText("#home-name", home.name);
    }

    const user = EnergyAPI.getUser();

    if (user) {
      const name = user.name || "User";

      setText("#user-name", name);

      setText(
        "#user-initial",
        name.trim().charAt(0).toUpperCase() || "U"
      );
    }
  }

  // Load dashboard information from the backend.
  async function loadDashboard() {
    if (isLoading) return;

    isLoading = true;
    hideError();

    try {
      const result = await EnergyAPI.get("/api/dashboard");

      if (!result || result.success !== true) {
        throw new Error(
          "The server did not return valid dashboard information."
        );
      }

      renderStatistics(result.statistics);

      renderReadings(
        result.statistics?.latestReadings
      );

      renderUserAndHome(result.home);

      renderDataSource(result.dataSource);

      setText(
        "#last-updated",
        `Updated ${new Date().toLocaleTimeString("en-IN")}`
      );
    } catch (error) {
      showError(
        error.message ||
          "Unable to load dashboard information."
      );
    } finally {
      isLoading = false;
    }
  }

  // Initial load.
  loadDashboard();

  // Automatically refresh every minute.
  window.setInterval(loadDashboard, 60000);

  // Allow other scripts to trigger a refresh.
  window.refreshEnergyDashboard = loadDashboard;
})();