Pixieset Gallery Scraper

This project processes photo information from Pixieset collections and generates CSV files containing Galleries, Clients and Gallery Photo Information.

Project Structure
.env: Contains email and username fields for authentication.

src/pages/pixiset.js: Main script that logs in pixieset web app & processes the data and generates CSV files.

src/helpers.js: Helper functions to assist with processing.

Prerequisites
Node.js installed on your machine.
Setup
Download the project.

Navigate to the project directory.

Create an .env file in the root directory with the following fields:

EMAIL=<your_email>
USERNAME=<your_username>

Running the Project
To run the project and generate CSV files:

`node src/pages/pixiset.js`

The output will generate 3 CSV files with names Clients, Galleries and Photos.