# EnergyFlow Real Energy Data

EnergyFlow uses a published real measured electricity dataset for development and demonstration.

The project does NOT generate random energy readings using `Math.random()`.

The selected dataset is UK-DALE.

UK-DALE contains electricity measurements collected from real homes, including appliance-level measurements.

The measurements used by EnergyFlow are therefore treated as:

    Published real measured data
              ↓
       EnergyFlow system
              ↓
          Analytics
              ↓
       Recommendations


## Important clarification

The data is NOT being collected by our own physical hardware.

The project currently does not have an IoT hardware device.

Therefore, the project must not claim that the UK-DALE measurements were collected by our hardware.

Instead, the project uses the published measurements as the input dataset.

The EnergyFlow ingestion API is designed using a hardware-compatible data format so that future hardware can send readings through the same API.


## Dataset folder

The required dataset files will be placed under:

    data/
    └── ukdale/
        └── house_1/


The folder can contain:

    labels.dat
    channel_*.dat


The exact channel numbers are determined from `labels.dat`.


## Importing the data

After the required dataset files are placed in the folder, first create or obtain a user account through the EnergyFlow application.

Then use that user's `homeId` when running the importer:

    node scripts/import-ukdale.js --home YOUR_HOME_ID --limit 500


The importer:

1. Reads the appliance labels.
2. Finds supported appliance channels.
3. Reads measured power values.
4. Uses the measurement timestamps.
5. Calculates energy consumption.
6. Stores the readings in EnergyFlow.


## Energy calculation

The importer converts measured power into energy using:

    Energy (kWh)
    =
    Power (W) × Time (seconds)
    --------------------------------
    3,600,000


The measurement interval is obtained from consecutive timestamps whenever possible.


## Source field

Imported readings are marked with:

    UK-DALE-real-dataset


This allows the dashboard and reports to distinguish dataset-derived readings from other possible ingestion sources.


## Data size

Only a limited number of readings should initially be imported for demonstration and testing.

For example:

    --limit 500

This keeps the development database manageable.

The complete raw dataset should not be committed to GitHub because the files can be large.


## Future hardware

A future IoT device can send data to:

    POST /api/energy/ingest

using the EnergyFlow ingestion format.

Therefore:

    Current:
    Published real measured dataset
              ↓
        EnergyFlow API

    Future:
    IoT hardware
              ↓
        EnergyFlow API

The backend architecture remains the same.