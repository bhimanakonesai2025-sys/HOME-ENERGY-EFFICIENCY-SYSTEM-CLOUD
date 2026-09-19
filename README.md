# EnergyFlow

## Cloud-Based Home Energy Efficiency Monitoring System

EnergyFlow is a cloud-based web application designed to provide appliance-level energy consumption analysis and energy-efficiency recommendations.

The system processes real measured appliance-level electricity data, stores the readings in cloud storage, performs analytics, and retrieves relevant energy-saving knowledge through a RAG-based knowledge layer.

---

# 1. Problem Statement

Households generally receive overall electricity consumption or electricity-bill information, but they may not have clear appliance-wise visibility into where energy is being consumed.

EnergyFlow addresses this problem by providing appliance-level energy monitoring, cloud-based storage, consumption analysis, and understandable energy-efficiency recommendations.

---

# 2. Important Data Source Decision

This project does NOT generate random energy values using Math.random().

The project uses a published real measured electricity dataset for development and demonstration.

The selected dataset is UK-DALE.

The dataset contains appliance-level and whole-home electricity measurements collected from real homes.

The project uses the published measurements as its input data.

The project does NOT claim that these measurements were collected by our own hardware.

The ingestion API is designed using a hardware-compatible data format so that future IoT hardware can send measurements through the same API.

---

# 3. Architecture

```text
Published Real Measured Dataset
            |
            v
      Data Ingestion
            |
            v
       AWS EC2 VM
   Node.js + Express
            |
       +----+----+
       |         |
       v         v
   DynamoDB     RAG
       |         |
       +----+----+
            |
            v
        Analytics
            |
            v
      EnergyFlow UI