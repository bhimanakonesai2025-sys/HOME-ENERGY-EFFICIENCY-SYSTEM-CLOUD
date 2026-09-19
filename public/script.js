/* ============================================================
   ENERGYFLOW - FINAL FRONTEND
   Dashboard
   Analytics
   Trends
   Alerts
   Energy Tips
   Reports
   ============================================================ */


/* ============================================================
   AUTH
   ============================================================ */

const token = localStorage.getItem("energyflow_token");

if (
    !token &&
    !location.pathname.endsWith("login.html") &&
    !location.pathname.endsWith("register.html")
) {
    location.href = "/login.html";
}


/* ============================================================
   GLOBAL DATA CACHE
   ============================================================ */

let allReadingsCache = null;


/* ============================================================
   API
   ============================================================ */

async function api(url, options = {}) {

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.message ||
            `Request failed: ${response.status}`
        );
    }

    return data;
}


/* ============================================================
   FORMATTING
   ============================================================ */

function energy(value) {
    return Number(value || 0).toFixed(3);
}

function power(value) {
    return Number(value || 0).toFixed(2);
}

function money(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
    return `${Number(value || 0).toFixed(2)}%`;
}

function dateTime(value) {

    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleString();
}

function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* ============================================================
   LOGOUT
   ============================================================ */

function setupLogout() {

    const button =
        document.getElementById("logoutBtn");

    if (!button) {
        return;
    }

    button.addEventListener("click", () => {

        localStorage.removeItem(
            "energyflow_token"
        );

        location.href = "/login.html";
    });
}


/* ============================================================
   SYSTEM STATUS
   ============================================================ */

async function loadStatus() {

    const sidebar =
        document.getElementById("sidebarStatus");

    const cloud =
        document.getElementById("cloudStatus");

    try {

        const response =
            await fetch("/api/health");

        if (!response.ok) {
            throw new Error("Health check failed");
        }

        const data =
            await response.json();

        if (cloud) {
            cloud.textContent =
                "● System Online";
        }

        if (sidebar) {
            sidebar.textContent =
                `Storage: ${
                    data.storageMode || "local"
                }`;
        }

    } catch (error) {

        console.error(
            "Status error:",
            error
        );

        if (cloud) {
            cloud.textContent =
                "● System Offline";
        }

        if (sidebar) {
            sidebar.textContent =
                "Connection error";
        }
    }
}


/* ============================================================
   GET ALL READINGS
   ============================================================ */

async function getAllReadings() {

    if (allReadingsCache) {
        return allReadingsCache;
    }

    try {

        const data =
            await api(
                "/api/energy/readings?limit=5000"
            );

        allReadingsCache =
            data.readings || [];

        return allReadingsCache;

    } catch (error) {

        console.error(
            "Reading fetch error:",
            error
        );

        throw error;
    }
}


/* ============================================================
   DASHBOARD
   ============================================================ */

async function loadDashboard() {

    const totalEnergyElement =
        document.getElementById(
            "totalEnergy"
        );

    if (!totalEnergyElement) {
        return;
    }

    try {

        const summary =
            await api(
                "/api/energy/summary"
            );
        const referenceBanner =
    document.getElementById(
        "referenceDataBanner"
    );

if (referenceBanner) {

    if (
        summary.isReferenceData === true
    ) {

        referenceBanner.style.display =
            "flex";

    } else {

        referenceBanner.style.display =
            "none";

    }
}

        /* CARDS */

        totalEnergyElement.textContent =
            `${energy(
                summary.totalEnergy
            )} kWh`;


        const cost =
            document.getElementById(
                "estimatedCost"
            );

        if (cost) {
            cost.textContent =
                money(summary.estimatedCost);
        }


        const applianceCount =
            document.getElementById(
                "applianceCount"
            );

        if (applianceCount) {
            applianceCount.textContent =
                summary.applianceCount || 0;
        }


        const readingCount =
            document.getElementById(
                "readingCount"
            );

        if (readingCount) {
            readingCount.textContent =
                summary.totalReadings || 0;
        }


        /* HIGHEST CONSUMER */

        const highest =
            summary.highestConsumer;


        if (highest) {

            const name =
                document.getElementById(
                    "highestConsumer"
                );

            const highestEnergy =
                document.getElementById(
                    "highestConsumerEnergy"
                );

            const highestContribution =
                document.getElementById(
                    "highestContribution"
                );


            if (name) {
                name.textContent =
                    highest.deviceName;
            }

            if (highestEnergy) {
                highestEnergy.textContent =
                    `${energy(
                        highest.energyConsumed
                    )} kWh recorded`;
            }

            if (highestContribution) {
                highestContribution.textContent =
                    percent(
                        highest.contribution
                    );
            }
        }


        renderEnergyByAppliance(
            summary
        );

        renderSmartInsight(
            summary
        );


        /* RECENT READINGS */

        const readingsBox =
            document.getElementById(
                "recentReadings"
            );

        if (readingsBox) {

            try {

                const data =
                    await api(
                        "/api/energy/readings?limit=20"
                    );

                const readings =
                    data.readings || [];


                if (!readings.length) {

                    readingsBox.innerHTML = `
                        <div class="empty-state">
                            No recent readings available.
                        </div>
                    `;

                } else {

                    readingsBox.innerHTML = `

                        <table>

                            <thead>

                                <tr>
                                    <th>DEVICE</th>
                                    <th>POWER</th>
                                    <th>ENERGY</th>
                                    <th>TIMESTAMP</th>
                                    <th>SOURCE</th>
                                </tr>

                            </thead>

                            <tbody>

                                ${
                                    readings.map(
                                        reading => `

                                            <tr>

                                                <td>
                                                    <strong>
                                                        ${escapeHtml(
                                                            reading.deviceName
                                                        )}
                                                    </strong>
                                                </td>

                                                <td>
                                                    ${power(
                                                        reading.power
                                                    )} W
                                                </td>

                                                <td>
                                                    ${energy(
                                                        reading.energyConsumed
                                                    )} kWh
                                                </td>

                                                <td>
                                                    ${dateTime(
                                                        reading.timestamp
                                                    )}
                                                </td>

                                                <td>
                                                    ${escapeHtml(
                                                        reading.source ||
                                                        "UK-DALE"
                                                    )}
                                                </td>

                                            </tr>

                                        `
                                    ).join("")
                                }

                            </tbody>

                        </table>
                    `;
                }

            } catch (error) {

                readingsBox.innerHTML = `
                    <div class="empty-state">
                        Unable to load recent readings.
                        <br><br>
                        <small>
                            ${escapeHtml(
                                error.message
                            )}
                        </small>
                    </div>
                `;
            }
        }

    } catch (error) {

        console.error(
            "Dashboard error:",
            error
        );
    }
}


/* ============================================================
   DASHBOARD ENERGY BARS
   ============================================================ */

function renderEnergyByAppliance(summary) {

    const container =
        document.getElementById(
            "energyByAppliance"
        );

    if (!container) {
        return;
    }

    const devices =
        summary.devices || [];

    const total =
        Number(
            summary.totalEnergy || 0
        );


    if (!devices.length) {

        container.innerHTML = `
            <div class="empty-state">
                No appliance data available.
            </div>
        `;

        return;
    }


    container.innerHTML =

        devices.map(device => {

            const contribution =
                total > 0
                    ? (
                        Number(
                            device.energyConsumed || 0
                        ) / total
                    ) * 100
                    : 0;


            return `

                <div class="energy-bar-row">

                    <div class="energy-bar-label">

                        <span>
                            ${escapeHtml(
                                device.deviceName
                            )}
                        </span>

                        <strong>
                            ${contribution.toFixed(2)}%
                        </strong>

                    </div>


                    <div class="energy-bar-track">

                        <div
                            class="energy-bar-fill"
                            style="
                                width:${Math.min(
                                    contribution,
                                    100
                                )}%;
                            "
                        ></div>

                    </div>


                    <div class="energy-bar-value">

                        ${energy(
                            device.energyConsumed
                        )} kWh

                    </div>

                </div>

            `;

        }).join("");
}


/* ============================================================
   SMART INSIGHT
   ============================================================ */

function renderSmartInsight(summary) {

    const container =
        document.getElementById(
            "smartInsight"
        );

    if (!container) {
        return;
    }

    const highest =
        summary.highestConsumer;


    if (!highest) {

        container.innerHTML = `
            <div class="empty-state">
                No appliance analysis available.
            </div>
        `;

        return;
    }


    container.innerHTML = `

        <div>

            <h3>
                Household Consumption Insight
            </h3>

            <p>

                <strong>
                    ${escapeHtml(
                        highest.deviceName
                    )}
                </strong>

                currently has the highest
                recorded energy contribution
                among the analyzed appliances.

            </p>

            <p>

                It contributes approximately

                <strong>
                    ${Number(
                        highest.contribution || 0
                    ).toFixed(2)}%
                </strong>

                of the recorded household
                energy consumption.

            </p>

            <p>

                The analysis is based on real
                appliance-level measurements
                stored in EnergyFlow.

            </p>

        </div>

    `;
}


/* ============================================================
   ANALYTICS
   ============================================================ */

async function loadAnalytics() {

    const analyticsBars =
        document.getElementById(
            "analyticsBars"
        );

    const applianceSelect =
        document.getElementById(
            "applianceSelect"
        );

    const analysisText =
        document.getElementById(
            "analysisText"
        );

    const ragText =
        document.getElementById(
            "ragText"
        );


    if (
        !analyticsBars &&
        !applianceSelect &&
        !analysisText &&
        !ragText
    ) {
        return;
    }


    try {

        const summary =
            await api(
                "/api/energy/summary"
            );

        const devices =
            summary.devices || [];

        const total =
            Number(
                summary.totalEnergy || 0
            );


        /* ENERGY BARS */

        if (analyticsBars) {

            analyticsBars.innerHTML =

                devices.map(device => {

                    const deviceEnergy =
                        Number(
                            device.energyConsumed || 0
                        );

                    const contribution =
                        total > 0
                            ? (
                                deviceEnergy /
                                total
                            ) * 100
                            : 0;


                    return `

                        <div class="energy-bar-row">

                            <div
                                class="energy-bar-label"
                            >

                                <span>
                                    ${escapeHtml(
                                        device.deviceName
                                    )}
                                </span>

                                <strong>
                                    ${contribution.toFixed(2)}%
                                </strong>

                            </div>


                            <div
                                class="energy-bar-track"
                            >

                                <div
                                    class="energy-bar-fill"
                                    style="
                                        width:${Math.min(
                                            contribution,
                                            100
                                        )}%;
                                    "
                                ></div>

                            </div>


                            <div
                                class="energy-bar-value"
                            >

                                ${energy(
                                    deviceEnergy
                                )} kWh

                            </div>

                        </div>

                    `;

                }).join("");
        }


        /* DROPDOWN */

        if (applianceSelect) {

            applianceSelect.innerHTML = `

                <option value="">
                    Select an appliance
                </option>

                ${
                    devices.map(
                        device => `

                            <option
                                value="${escapeHtml(
                                    device.deviceId
                                )}"
                            >
                                ${escapeHtml(
                                    device.deviceName
                                )}
                            </option>

                        `
                    ).join("")
                }

            `;


            applianceSelect.onchange =
                () => {

                    if (!applianceSelect.value) {

                        const box =
                            document.getElementById(
                                "applianceAnalysis"
                            );

                        if (box) {

                            box.innerHTML = `
                                <div class="loading">
                                    Select an appliance to view detailed analysis.
                                </div>
                            `;

                        }

                        return;
                    }


                    showApplianceAnalysis(
                        applianceSelect.value,
                        devices,
                        total
                    );
                };
        }


        /* CONSUMPTION ANALYSIS */

        if (analysisText) {

            const highest =
                summary.highestConsumer;


            analysisText.innerHTML = `

                <div>

                    <h3>
                        Consumption Overview
                    </h3>

                    <p>

                        EnergyFlow analyzed

                        <strong>
                            ${summary.totalReadings || 0}
                        </strong>

                        recorded appliance measurements
                        across

                        <strong>
                            ${devices.length}
                        </strong>

                        appliances.

                    </p>

                    <p>

                        Total recorded energy:

                        <strong>
                            ${energy(total)} kWh
                        </strong>

                        with an estimated cost of

                        <strong>
                            ${money(
                                summary.estimatedCost
                            )}
                        </strong>.

                    </p>

                    ${
                        highest
                            ? `

                                <p>

                                    The highest recorded
                                    energy contributor is

                                    <strong>
                                        ${escapeHtml(
                                            highest.deviceName
                                        )}
                                    </strong>

                                    at

                                    <strong>
                                        ${percent(
                                            highest.contribution
                                        )}
                                    </strong>

                                    of the analyzed energy.

                                </p>

                            `
                            : ""
                    }

                </div>

            `;
        }


        await loadAnalyticsRAG();

    } catch (error) {

        console.error(
            "Analytics error:",
            error
        );

        if (analyticsBars) {

            analyticsBars.innerHTML = `
                <div class="empty-state">
                    Unable to load analytics.
                    <br><br>
                    <small>
                        ${escapeHtml(
                            error.message
                        )}
                    </small>
                </div>
            `;
        }
    }
}


/* ============================================================
   APPLIANCE INTELLIGENCE
   ============================================================ */

async function showApplianceAnalysis(
    deviceId,
    devices,
    totalHouseEnergy
) {

    const box =
        document.getElementById(
            "applianceAnalysis"
        );

    if (!box) {
        return;
    }


    box.innerHTML = `
        <div class="loading">
            Loading appliance analysis...
        </div>
    `;


    try {

        const device =
            devices.find(
                item =>
                    item.deviceId === deviceId
            );


        if (!device) {
            throw new Error(
                "Appliance not found."
            );
        }


        const readings =
            await getAllReadings();


        const deviceReadings =
            readings.filter(
                reading =>
                    reading.deviceId === deviceId
            );


        const deviceEnergy =
            deviceReadings.reduce(
                (sum, reading) =>
                    sum +
                    Number(
                        reading.energyConsumed || 0
                    ),
                0
            );


        const summaryEnergy =
            Number(
                device.energyConsumed || 0
            );


        const finalEnergy =
            summaryEnergy > 0
                ? summaryEnergy
                : deviceEnergy;


        const contribution =
            totalHouseEnergy > 0
                ? (
                    finalEnergy /
                    totalHouseEnergy
                ) * 100
                : 0;


        const powers =
            deviceReadings.map(
                reading =>
                    Number(
                        reading.power || 0
                    )
            );


        const averagePower =
            powers.length
                ? powers.reduce(
                    (a, b) => a + b,
                    0
                ) / powers.length
                : 0;


        const maxPower =
            powers.length
                ? Math.max(...powers)
                : 0;


        const minPower =
            powers.length
                ? Math.min(...powers)
                : 0;


        const timestamps =
            deviceReadings
                .map(
                    reading =>
                        new Date(
                            reading.timestamp
                        )
                )
                .filter(
                    date =>
                        !Number.isNaN(
                            date.getTime()
                        )
                )
                .sort(
                    (a, b) => a - b
                );


        box.innerHTML = `

            <div class="analysis-grid">

                <div class="analysis-card">

                    <span>
                        DEVICE
                    </span>

                    <strong>
                        ${escapeHtml(
                            device.deviceName
                        )}
                    </strong>

                </div>


                <div class="analysis-card">

                    <span>
                        TOTAL ENERGY
                    </span>

                    <strong>
                        ${energy(
                            finalEnergy
                        )} kWh
                    </strong>

                </div>


                <div class="analysis-card">

                    <span>
                        ESTIMATED COST
                    </span>

                    <strong>
                        ${money(
                            finalEnergy *
                            (
                                totalHouseEnergy > 0
                                    ? 8
                                    : 8
                            )
                        )}
                    </strong>

                </div>


                <div class="analysis-card">

                    <span>
                        HOUSEHOLD CONTRIBUTION
                    </span>

                    <strong>
                        ${contribution.toFixed(2)}%
                    </strong>

                </div>


                <div class="analysis-card">

                    <span>
                        READINGS
                    </span>

                    <strong>
                        ${deviceReadings.length}
                    </strong>

                </div>


                <div class="analysis-card">

                    <span>
                        AVERAGE POWER
                    </span>

                    <strong>
                        ${power(
                            averagePower
                        )} W
                    </strong>

                </div>


                <div class="analysis-card">

                    <span>
                        MAX POWER
                    </span>

                    <strong>
                        ${power(
                            maxPower
                        )} W
                    </strong>

                </div>


                <div class="analysis-card">

                    <span>
                        MIN POWER
                    </span>

                    <strong>
                        ${power(
                            minPower
                        )} W
                    </strong>

                </div>

            </div>


            <div class="insight-box">

                <h3>
                    Appliance Interpretation
                </h3>

                <p>

                    <strong>
                        ${escapeHtml(
                            device.deviceName
                        )}
                    </strong>

                    contributed approximately

                    <strong>
                        ${contribution.toFixed(2)}%
                    </strong>

                    of recorded household
                    energy.

                </p>

                <p>

                    Recorded power ranged from

                    <strong>
                        ${power(minPower)} W
                    </strong>

                    to

                    <strong>
                        ${power(maxPower)} W
                    </strong>

                    with an average of

                    <strong>
                        ${power(averagePower)} W
                    </strong>.

                </p>

                <p>

                    First measurement:

                    <strong>
                        ${dateTime(
                            timestamps[0]
                        )}
                    </strong>

                    <br>

                    Last measurement:

                    <strong>
                        ${dateTime(
                            timestamps[timestamps.length - 1]
                        )}
                    </strong>

                </p>

            </div>

        `;

    } catch (error) {

        console.error(
            "Appliance analysis error:",
            error
        );

        box.innerHTML = `

            <div class="empty-state">

                Unable to load appliance analysis.

                <br><br>

                <small>
                    ${escapeHtml(
                        error.message
                    )}
                </small>

            </div>

        `;
    }
}


/* ============================================================
   ANALYTICS RAG
   ============================================================ */

async function loadAnalyticsRAG() {

    const container =
        document.getElementById(
            "ragText"
        );

    if (!container) {
        return;
    }


    try {

        const data =
            await api(
                "/api/energy/rag-analysis"
            );


        const contexts =
            data.ragContext || [];


        if (!contexts.length) {

            container.innerHTML = `
                <div class="empty-state">
                    No knowledge retrieval available.
                </div>
            `;

            return;
        }


        container.innerHTML =

            contexts.map(
                context => `

                    <div class="rag-appliance">

                        <div
                            class="rag-appliance-header"
                        >

                            <h3>
                                ${escapeHtml(
                                    context.deviceName
                                )}
                            </h3>

                            <span>
                                ${Number(
                                    context.contribution || 0
                                ).toFixed(2)}%
                                of recorded energy
                            </span>

                        </div>


                        ${
                            (
                                context.recommendations ||
                                []
                            ).map(
                                recommendation => `

                                    <div
                                        class="rag-section"
                                    >

                                        ${escapeHtml(
                                            recommendation
                                        ).replace(
                                            /\n/g,
                                            "<br>"
                                        )}

                                    </div>

                                `
                            ).join("")
                        }

                    </div>

                `
            ).join("");


    } catch (error) {

        console.error(
            "RAG error:",
            error
        );

        container.innerHTML = `
            <div class="empty-state">
                Unable to load knowledge retrieval.
                <br><br>
                <small>
                    ${escapeHtml(
                        error.message
                    )}
                </small>
            </div>
        `;
    }
}


/* ============================================================
   ENERGY TIPS
   ============================================================ */

async function loadEnergyTips() {

    const container =
        document.getElementById(
            "ragRecommendations"
        );

    if (!container) {
        return;
    }


    try {

        const data =
            await api(
                "/api/energy/rag-analysis"
            );


        const contexts =
            data.ragContext || [];


        if (!contexts.length) {

            container.innerHTML = `
                <div class="empty-state">
                    No recommendations available.
                </div>
            `;

            return;
        }


        container.innerHTML =

            contexts.map(
                context => `

                    <div class="rag-appliance">

                        <div
                            class="rag-appliance-header"
                        >

                            <h3>
                                ${escapeHtml(
                                    context.deviceName
                                )}
                            </h3>

                            <span>
                                ${Number(
                                    context.contribution || 0
                                ).toFixed(2)}%
                                of recorded energy
                            </span>

                        </div>


                        ${
                            (
                                context.recommendations ||
                                []
                            ).map(
                                recommendation => `

                                    <div
                                        class="rag-section"
                                    >

                                        ${escapeHtml(
                                            recommendation
                                        ).replace(
                                            /\n/g,
                                            "<br>"
                                        )}

                                    </div>

                                `
                            ).join("")
                        }

                    </div>

                `
            ).join("");


    } catch (error) {

        console.error(
            "Energy tips error:",
            error
        );

        container.innerHTML = `
            <div class="empty-state">
                Unable to load recommendations.
                <br><br>
                <small>
                    ${escapeHtml(
                        error.message
                    )}
                </small>
            </div>
        `;
    }
}


/* ============================================================
   TRENDS
   ============================================================ */

let trendReadings = [];


async function loadTrends() {

    const trendSelect =
        document.getElementById(
            "trendAppliance"
        );

    if (!trendSelect) {
        return;
    }


    try {

        const summary =
            await api(
                "/api/energy/summary"
            );


        const devices =
            summary.devices || [];


        trendSelect.innerHTML = `

            <option value="all">
                All Appliances
            </option>

            ${
                devices.map(
                    device => `

                        <option
                            value="${escapeHtml(
                                device.deviceId
                            )}"
                        >
                            ${escapeHtml(
                                device.deviceName
                            )}
                        </option>

                    `
                ).join("")
            }

        `;


        trendReadings =
            await getAllReadings();


        trendSelect.onchange =
            analyzeTrends;


        const limit =
            document.getElementById(
                "trendLimit"
            );

        if (limit) {
            limit.onchange =
                analyzeTrends;
        }


        const button =
            document.getElementById(
                "analyzeTrendBtn"
            );

        if (button) {
            button.onclick =
                analyzeTrends;
        }


        analyzeTrends();

    } catch (error) {

        console.error(
            "Trends error:",
            error
        );

        showTrendError(error);
    }
}


/* ============================================================
   ANALYZE TRENDS
   ============================================================ */

function analyzeTrends() {

    const select =
        document.getElementById(
            "trendAppliance"
        );

    const limitElement =
        document.getElementById(
            "trendLimit"
        );


    const selected =
        select
            ? select.value
            : "all";


    const limit =
        limitElement
            ? Number(
                limitElement.value || 50
            )
            : 50;


    let readings =
        [...trendReadings];


    if (
        selected &&
        selected !== "all"
    ) {

        readings =
            readings.filter(
                reading =>
                    reading.deviceId ===
                    selected
            );
    }


    readings.sort(
        (a, b) =>
            new Date(a.timestamp) -
            new Date(b.timestamp)
    );


    readings =
        readings.slice(
            Math.max(
                0,
                readings.length - limit
            )
        );


    const totalEnergy =
        readings.reduce(
            (sum, reading) =>
                sum +
                Number(
                    reading.energyConsumed || 0
                ),
            0
        );


    const powers =
        readings.map(
            reading =>
                Number(
                    reading.power || 0
                )
        );


    const averagePower =
        powers.length
            ? powers.reduce(
                (a, b) => a + b,
                0
            ) / powers.length
            : 0;


    const peakPower =
        powers.length
            ? Math.max(...powers)
            : 0;


    const totalElement =
        document.getElementById(
            "trendTotalEnergy"
        );

    const averageElement =
        document.getElementById(
            "trendAveragePower"
        );

    const peakElement =
        document.getElementById(
            "trendPeakPower"
        );

    const countElement =
        document.getElementById(
            "trendReadingCount"
        );


    if (totalElement) {
        totalElement.textContent =
            `${energy(totalEnergy)} kWh`;
    }

    if (averageElement) {
        averageElement.textContent =
            `${power(averagePower)} W`;
    }

    if (peakElement) {
        peakElement.textContent =
            `${power(peakPower)} W`;
    }

    if (countElement) {
        countElement.textContent =
            readings.length;
    }


    renderTrendChart(readings);

    renderTrendTable(readings);

    renderTrendInterpretation(
        readings,
        totalEnergy,
        averagePower,
        peakPower
    );
}


/* ============================================================
   TREND CHART
   ============================================================ */

function renderTrendChart(readings) {

    const container =
        document.getElementById(
            "trendChart"
        );

    if (!container) {
        return;
    }


    if (!readings.length) {

        container.innerHTML = `
            <div class="empty-state">
                No readings available.
            </div>
        `;

        return;
    }


    const display =
        readings.slice(-30);


    const max =
        Math.max(
            ...display.map(
                reading =>
                    Number(
                        reading.power || 0
                    )
            ),
            1
        );


    container.innerHTML = `

        <div
            style="
                display:flex;
                align-items:flex-end;
                gap:6px;
                height:260px;
                padding:20px;
                overflow-x:auto;
            "
        >

            ${
                display.map(
                    reading => {

                        const value =
                            Number(
                                reading.power || 0
                            );

                        const height =
                            Math.max(
                                5,
                                (
                                    value / max
                                ) * 210
                            );


                        return `

                            <div
                                title="${escapeHtml(
                                    `${power(value)} W - ${dateTime(
                                        reading.timestamp
                                    )}`
                                )}"
                                style="
                                    width:16px;
                                    min-width:16px;
                                    height:${height}px;
                                    background:#0d6efd;
                                    border-radius:5px 5px 0 0;
                                "
                            ></div>

                        `;
                    }
                ).join("")
            }

        </div>

        <div
            style="
                text-align:center;
                color:#718096;
                font-size:13px;
            "
        >
            Showing last ${
                display.length
            } selected measurements
        </div>

    `;
}


/* ============================================================
   TREND TABLE
   ============================================================ */

function renderTrendTable(readings) {

    const container =
        document.getElementById(
            "trendData"
        );

    if (!container) {
        return;
    }


    if (!readings.length) {

        container.innerHTML = `
            <div class="empty-state">
                No trend data available.
            </div>
        `;

        return;
    }


    container.innerHTML = `

        <div style="overflow-x:auto">

            <table>

                <thead>

                    <tr>
                        <th>#</th>
                        <th>DEVICE</th>
                        <th>POWER</th>
                        <th>ENERGY</th>
                        <th>TIMESTAMP</th>
                    </tr>

                </thead>

                <tbody>

                    ${
                        readings.map(
                            (reading, index) => `

                                <tr>

                                    <td>
                                        ${index + 1}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            reading.deviceName
                                        )}
                                    </td>

                                    <td>
                                        ${power(
                                            reading.power
                                        )} W
                                    </td>

                                    <td>
                                        ${energy(
                                            reading.energyConsumed
                                        )} kWh
                                    </td>

                                    <td>
                                        ${dateTime(
                                            reading.timestamp
                                        )}
                                    </td>

                                </tr>

                            `
                        ).join("")
                    }

                </tbody>

            </table>

        </div>

    `;
}


/* ============================================================
   TREND INTERPRETATION
   ============================================================ */

function renderTrendInterpretation(
    readings,
    totalEnergy,
    averagePower,
    peakPower
) {

    const container =
        document.getElementById(
            "trendInterpretation"
        );

    if (!container) {
        return;
    }


    if (!readings.length) {

        container.innerHTML =
            "No measurements are available.";

        return;
    }


    container.innerHTML = `

        <p>

            EnergyFlow analyzed

            <strong>
                ${readings.length}
            </strong>

            recorded measurements.

        </p>

        <p>

            The selected readings contain

            <strong>
                ${energy(totalEnergy)} kWh
            </strong>

            of recorded energy.

        </p>

        <p>

            Average recorded power:

            <strong>
                ${power(averagePower)} W
            </strong>

            and peak recorded power:

            <strong>
                ${power(peakPower)} W
            </strong>.

        </p>

        ${
            averagePower > 0 &&
            peakPower >= averagePower * 1.5

                ? `
                    <p>
                        The selected measurements show
                        noticeable variation between
                        average and peak power.
                    </p>
                `

                : `
                    <p>
                        The selected measurements remain
                        relatively close to their average
                        recorded power level.
                    </p>
                `
        }

    `;
}


/* ============================================================
   TREND ERROR
   ============================================================ */

function showTrendError(error) {

    const chart =
        document.getElementById(
            "trendChart"
        );

    const data =
        document.getElementById(
            "trendData"
        );

    const interpretation =
        document.getElementById(
            "trendInterpretation"
        );


    if (chart) {

        chart.innerHTML = `
            <div class="empty-state">
                Unable to load trend data.
                <br><br>
                <small>
                    ${escapeHtml(
                        error.message
                    )}
                </small>
            </div>
        `;
    }


    if (data) {

        data.innerHTML = `
            <div class="empty-state">
                Trend data unavailable.
            </div>
        `;
    }


    if (interpretation) {

        interpretation.innerHTML =
            "Unable to analyze trend data.";
    }
}


/* ============================================================
   ALERTS
   ============================================================ */

async function loadAlerts() {

    const alertsContainer =
        document.getElementById(
            "alertsContainer"
        );

    if (!alertsContainer) {
        return;
    }


    try {

        const summary =
            await api(
                "/api/energy/summary"
            );


        const readings =
            await getAllReadings();


        const devices =
            summary.devices || [];


        const alerts = [];


        /* ----------------------------------------
           BUILD DEVICE STATISTICS
        ---------------------------------------- */

        const stats = {};


        devices.forEach(device => {

            stats[device.deviceId] = {

                deviceId:
                    device.deviceId,

                deviceName:
                    device.deviceName,

                energy:
                    Number(
                        device.energyConsumed || 0
                    ),

                contribution:
                    Number(
                        device.contribution || 0
                    ),

                powers: []

            };

        });


        readings.forEach(reading => {

            if (!stats[reading.deviceId]) {

                stats[reading.deviceId] = {

                    deviceId:
                        reading.deviceId,

                    deviceName:
                        reading.deviceName,

                    energy: 0,

                    contribution: 0,

                    powers: []

                };

            }


            stats[
                reading.deviceId
            ].powers.push(
                Number(
                    reading.power || 0
                )
            );

        });


        /* ----------------------------------------
           DETECTION RULES
        ---------------------------------------- */

        Object.values(stats).forEach(device => {

            const values =
                device.powers;


            if (!values.length) {
                return;
            }


            const average =
                values.reduce(
                    (a, b) => a + b,
                    0
                ) / values.length;


            const maximum =
                Math.max(...values);


            const minimum =
                Math.min(...values);


            /* HIGH ENERGY CONTRIBUTION */

            const contribution =
                summary.totalEnergy > 0

                    ? (
                        device.energy /
                        Number(
                            summary.totalEnergy
                        )
                    ) * 100

                    : 0;


            if (contribution >= 20) {

                alerts.push({

                    deviceName:
                        device.deviceName,

                    type:
                        "High Energy Contribution",

                    severity:
                        "HIGH",

                    description:
                        `${device.deviceName} contributes ${contribution.toFixed(2)}% of recorded household energy.`

                });

            }


            /* HIGH POWER */

            if (
                average > 0 &&
                maximum >= average * 1.20
            ) {

                const ratio =
                    maximum / average;


                alerts.push({

                    deviceName:
                        device.deviceName,

                    type:
                        "High Power",

                    severity:
                        ratio >= 1.50
                            ? "HIGH"
                            : "MEDIUM",

                    description:
                        `${device.deviceName} reached ${power(maximum)} W compared with an average of ${power(average)} W.`

                });

            }


            /* VARIABLE USAGE */

            const variation =
                average > 0
                    ? (
                        maximum -
                        minimum
                    ) / average
                    : 0;


            if (variation >= 0.50) {

                alerts.push({

                    deviceName:
                        device.deviceName,

                    type:
                        "Variable Usage Pattern",

                    severity:
                        "MEDIUM",

                    description:
                        `${device.deviceName} shows substantial variation between minimum and maximum recorded power.`

                });

            }

        });


        /* ----------------------------------------
           SUMMARY CARDS
        ---------------------------------------- */

        const alertCount =
            document.getElementById(
                "alertCount"
            );

        const alertReadings =
            document.getElementById(
                "alertReadings"
            );

        const highAlertCount =
            document.getElementById(
                "highAlertCount"
            );

        const alertEnergy =
            document.getElementById(
                "alertEnergy"
            );


        if (alertCount) {
            alertCount.textContent =
                alerts.length;
        }


        if (alertReadings) {
            alertReadings.textContent =
                readings.length;
        }


        if (highAlertCount) {

            highAlertCount.textContent =
                alerts.filter(
                    alert =>
                        alert.severity === "HIGH"
                ).length;

        }


        if (alertEnergy) {

            alertEnergy.textContent =
                `${energy(
                    summary.totalEnergy
                )} kWh`;

        }


        /* ----------------------------------------
           DISPLAY ALERTS
        ---------------------------------------- */

        if (!alerts.length) {

            alertsContainer.innerHTML = `

                <div class="empty-state">

                    No unusual energy conditions
                    were detected in the analyzed
                    measurements.

                </div>

            `;

        } else {

            alertsContainer.innerHTML = `

                <div>

                    ${
                        alerts.map(
                            alert => `

                                <div
                                    class="alert-card"
                                    style="
                                        padding:18px;
                                        margin-bottom:14px;
                                        border:1px solid #dce5ec;
                                        border-radius:12px;
                                        background:#fff;
                                    "
                                >

                                    <div
                                        style="
                                            display:flex;
                                            justify-content:space-between;
                                            align-items:center;
                                            gap:15px;
                                        "
                                    >

                                        <div>

                                            <h3
                                                style="
                                                    margin:0 0 6px;
                                                "
                                            >

                                                ${escapeHtml(
                                                    alert.deviceName
                                                )}

                                            </h3>

                                            <strong>

                                                ${escapeHtml(
                                                    alert.type
                                                )}

                                            </strong>

                                        </div>


                                        <span
                                            style="
                                                font-weight:700;
                                            "
                                        >

                                            ${
                                                alert.severity ===
                                                "HIGH"
                                                    ? "🔴 HIGH"
                                                    : "🟠 MEDIUM"
                                            }

                                        </span>

                                    </div>


                                    <p>

                                        ${escapeHtml(
                                            alert.description
                                        )}

                                    </p>

                                </div>

                            `
                        ).join("")
                    }

                </div>

            `;
        }


        /* ----------------------------------------
           ALERT INSIGHT
        ---------------------------------------- */

        const insight =
            document.getElementById(
                "alertInsight"
            );


        if (insight) {

            insight.innerHTML = `

                <p>

                    EnergyFlow analyzed

                    <strong>
                        ${readings.length}
                    </strong>

                    recorded appliance measurements
                    covering

                    <strong>
                        ${devices.length}
                    </strong>

                    appliances.

                </p>

                <p>

                    The system detected

                    <strong>
                        ${alerts.length}
                    </strong>

                    conditions requiring
                    attention or observation.

                </p>

                <p>

                    Alert detection is based on
                    recorded energy contribution,
                    peak-versus-average power,
                    and variation in appliance
                    measurements.

                </p>

            `;
        }

    } catch (error) {

        console.error(
            "Alerts error:",
            error
        );


        alertsContainer.innerHTML = `

            <div class="empty-state">

                Unable to analyze energy alerts.

                <br><br>

                <small>
                    ${escapeHtml(
                        error.message
                    )}
                </small>

            </div>

        `;
    }
}


/* ============================================================
   REPORTS
   ============================================================ */

let latestReportSummary = null;


async function loadReports() {

    const reportTable =
        document.getElementById(
            "reportTable"
        );

    if (!reportTable) {
        return;
    }


    try {

        const summary =
            await api(
                "/api/energy/summary"
            );


        latestReportSummary =
            summary;


        const devices =
            summary.devices || [];


        const total =
            Number(
                summary.totalEnergy || 0
            );


        /* SUMMARY CARDS */

        const reportEnergy =
            document.getElementById(
                "reportEnergy"
            );

        const reportCost =
            document.getElementById(
                "reportCost"
            );

        const reportHighest =
            document.getElementById(
                "reportHighest"
            );

        const reportHighestContribution =
            document.getElementById(
                "reportHighestContribution"
            );

        const reportReadings =
            document.getElementById(
                "reportReadings"
            );


        if (reportEnergy) {

            reportEnergy.textContent =
                `${energy(total)} kWh`;

        }


        if (reportCost) {

            reportCost.textContent =
                money(
                    summary.estimatedCost
                );

        }


        if (
            reportHighest &&
            summary.highestConsumer
        ) {

            reportHighest.textContent =
                summary.highestConsumer.deviceName;

        }


        if (
            reportHighestContribution &&
            summary.highestConsumer
        ) {

            reportHighestContribution.textContent =
                `${percent(
                    summary.highestConsumer.contribution
                )} of recorded energy`;

        }


        if (reportReadings) {

            reportReadings.textContent =
                summary.totalReadings || 0;

        }


        /* TABLE */

        if (!devices.length) {

            reportTable.innerHTML = `
                <div class="empty-state">
                    No appliance data available.
                </div>
            `;

        } else {

            reportTable.innerHTML = `

                <div style="overflow-x:auto">

                    <table>

                        <thead>

                            <tr>

                                <th>
                                    APPLIANCE
                                </th>

                                <th>
                                    ENERGY
                                </th>

                                <th>
                                    CONTRIBUTION
                                </th>

                                <th>
                                    READINGS
                                </th>

                                <th>
                                    ESTIMATED COST
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            ${
                                devices.map(
                                    device => {

                                        const deviceEnergy =
                                            Number(
                                                device.energyConsumed ||
                                                0
                                            );


                                        const contribution =
                                            total > 0
                                                ? (
                                                    deviceEnergy /
                                                    total
                                                ) * 100
                                                : 0;


                                        const deviceCost =
                                            total > 0
                                                ? (
                                                    deviceEnergy /
                                                    total
                                                ) *
                                                Number(
                                                    summary.estimatedCost ||
                                                    0
                                                )
                                                : 0;


                                        return `

                                            <tr>

                                                <td>
                                                    <strong>
                                                        ${escapeHtml(
                                                            device.deviceName
                                                        )}
                                                    </strong>
                                                </td>

                                                <td>
                                                    ${energy(
                                                        deviceEnergy
                                                    )} kWh
                                                </td>

                                                <td>
                                                    ${contribution.toFixed(2)}%
                                                </td>

                                                <td>
                                                    ${device.readings || 0}
                                                </td>

                                                <td>
                                                    ${money(
                                                        deviceCost
                                                    )}
                                                </td>

                                            </tr>

                                        `;
                                    }
                                ).join("")
                            }

                        </tbody>

                    </table>

                </div>

            `;
        }


        renderReportInsight(
            summary
        );


        renderReportDistribution(
            summary
        );


    } catch (error) {

        console.error(
            "Reports error:",
            error
        );


        reportTable.innerHTML = `

            <div class="empty-state">

                Unable to load report.

                <br><br>

                <small>
                    ${escapeHtml(
                        error.message
                    )}
                </small>

            </div>

        `;


        const insight =
            document.getElementById(
                "reportInsight"
            );

        if (insight) {

            insight.innerHTML = `
                Unable to prepare report interpretation.
            `;
        }
    }
}


/* ============================================================
   REPORT READING COUNT
   ============================================================ */

function deviceReadingsCount(deviceId) {

    if (!allReadingsCache) {
        return "—";
    }

    return allReadingsCache.filter(
        reading =>
            reading.deviceId === deviceId
    ).length;
}


/* ============================================================
   REPORT INSIGHT
   ============================================================ */

function renderReportInsight(summary) {

    const container =
        document.getElementById(
            "reportInsight"
        );

    if (!container) {
        return;
    }


    const highest =
        summary.highestConsumer;


    container.innerHTML = `

        <p>

            EnergyFlow analyzed

            <strong>
                ${summary.totalReadings || 0}
            </strong>

            recorded measurements from

            <strong>
                ${summary.applianceCount || 0}
            </strong>

            appliances.

        </p>


        <p>

            The recorded energy consumption is

            <strong>
                ${energy(
                    summary.totalEnergy
                )} kWh
            </strong>

            with an estimated cost of

            <strong>
                ${money(
                    summary.estimatedCost
                )}
            </strong>.

        </p>


        ${
            highest
                ? `

                    <p>

                        The highest recorded
                        contributor is

                        <strong>
                            ${escapeHtml(
                                highest.deviceName
                            )}
                        </strong>

                        with approximately

                        <strong>
                            ${percent(
                                highest.contribution
                            )}
                        </strong>

                        of the analyzed energy.

                    </p>

                `
                : ""
        }

    `;
}


/* ============================================================
   REPORT DISTRIBUTION
   ============================================================ */

function renderReportDistribution(summary) {

    const container =
        document.getElementById(
            "reportDistribution"
        );

    if (!container) {
        return;
    }


    const devices =
        summary.devices || [];


    const total =
        Number(
            summary.totalEnergy || 0
        );


    if (!devices.length) {

        container.innerHTML = `
            <div class="empty-state">
                No distribution data available.
            </div>
        `;

        return;
    }


    container.innerHTML =

        devices.map(
            device => {

                const contribution =
                    total > 0
                        ? (
                            Number(
                                device.energyConsumed || 0
                            ) /
                            total
                        ) * 100
                        : 0;


                return `

                    <div
                        style="
                            margin-bottom:16px;
                        "
                    >

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                margin-bottom:6px;
                            "
                        >

                            <span>
                                ${escapeHtml(
                                    device.deviceName
                                )}
                            </span>

                            <strong>
                                ${contribution.toFixed(2)}%
                            </strong>

                        </div>


                        <div
                            style="
                                height:10px;
                                background:#e9eef3;
                                border-radius:20px;
                                overflow:hidden;
                            "
                        >

                            <div
                                style="
                                    height:100%;
                                    width:${Math.min(
                                        contribution,
                                        100
                                    )}%;
                                    background:#0d6efd;
                                "
                            ></div>

                        </div>

                    </div>

                `;
            }
        ).join("");
}


/* ============================================================
   REPORT EXPORT CSV
   ============================================================ */

function setupReportActions() {

    const exportButton =
        document.getElementById(
            "exportReportBtn"
        );


    const printButton =
        document.getElementById(
            "printReportBtn"
        );


    if (exportButton) {

        exportButton.onclick =
            exportReportCSV;

    }


    if (printButton) {

        printButton.onclick =
            () => window.print();

    }
}


/* ============================================================
   EXPORT CSV
   ============================================================ */

function exportReportCSV() {

    if (!latestReportSummary) {
        return;
    }


    const summary =
        latestReportSummary;


    const devices =
        summary.devices || [];


    const total =
        Number(
            summary.totalEnergy || 0
        );


    const rows = [

        [
            "Appliance",
            "Energy (kWh)",
            "Contribution (%)",
            "Estimated Cost (INR)"
        ]

    ];


    devices.forEach(device => {

        const deviceEnergy =
            Number(
                device.energyConsumed || 0
            );


        const contribution =
            total > 0
                ? (
                    deviceEnergy /
                    total
                ) * 100
                : 0;


        const cost =
            total > 0
                ? (
                    deviceEnergy /
                    total
                ) *
                Number(
                    summary.estimatedCost || 0
                )
                : 0;


        rows.push([

            device.deviceName,

            deviceEnergy.toFixed(6),

            contribution.toFixed(2),

            cost.toFixed(2)

        ]);

    });


    const csv =
        rows
            .map(
                row =>
                    row.map(
                        value =>
                            `"${String(
                                value
                            ).replaceAll(
                                '"',
                                '""'
                            )}"`
                    ).join(",")
            )
            .join("\n");


    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const link =
        document.createElement("a");


    link.href = url;

    link.download =
        "EnergyFlow_Report.csv";


    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
}


/* ============================================================
   START
   ============================================================ */

async function startEnergyFlow() {

    console.log("EnergyFlow frontend started.");

    setupLogout();
    setupReportActions();

    await loadStatus();

    const path =
        window.location.pathname.toLowerCase();

    try {

        if (
            path.endsWith("/") ||
            path.endsWith("index.html")
        ) {

            await loadDashboard();

        }

        else if (
            path.endsWith("analytics.html")
        ) {

            await loadAnalytics();

        }

        else if (
            path.endsWith("trends.html")
        ) {

            await loadTrends();

        }

        else if (
            path.endsWith("alerts.html")
        ) {

            await loadAlerts();

        }

        else if (
            path.endsWith("energy-tips.html")
        ) {

            await loadEnergyTips();

        }

        else if (
            path.endsWith("reports.html")
        ) {

            await loadReports();

        }

        else if (
            path.endsWith("welcome.html")
        ) {

            // No energy data required.

        }

        else if (
            path.endsWith("login.html") ||
            path.endsWith("register.html")
        ) {

            // Authentication pages.

        }

        else {

            await loadDashboard();

        }

    } catch (error) {

        console.error(
            "EnergyFlow page initialization error:",
            error
        );

    }

    console.log(
        "EnergyFlow page initialization complete."
    );
}


if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        startEnergyFlow
    );

} else {

    startEnergyFlow();

}