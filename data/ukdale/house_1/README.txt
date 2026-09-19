ENERGYFLOW - UK-DALE HOUSE 1 DATA

This folder is reserved for the required UK-DALE House 1 dataset files.

Expected files include:

    labels.dat
    channel_*.dat


The importer reads labels.dat to determine which appliance channels are available.

It then reads the corresponding channel files and converts the measured power values into EnergyFlow energy readings.


IMPORTANT:

The measurements come from the published UK-DALE dataset.

They are NOT measurements collected by our own hardware.

Do not describe these values as live hardware measurements.


After placing the dataset files here, the importer can be run from the project root:

    node scripts/import-ukdale.js --home YOUR_HOME_ID --limit 500


Do not commit the large raw dataset files to GitHub.