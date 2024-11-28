# CARBONOZ MONGO BROKER

## Overview

CARBONOZ MONGO BROKER is a specialized service designed to manage energy data effectively by leveraging Redis as a high-performance data source and MongoDB for persistent storage. The broker retrieves raw data from Redis, applies meaningful filtering and logic-based calculations, and ensures that only refined, conflict-free data is saved to MongoDB daily. The system also includes mechanisms to avoid data duplication and resolve conflicts during data processing.

## Key Features

1. `Redis Retrieval`: Retrieves real-time data from Redis for processing.
2. `Data Filtering`: Filters and processes raw data to extract meaningful insights.
3. `Logic-based Calculations`: Applies predefined business logic to enhance and refine data for reporting or analytics purposes.
4. `Conflict Resolution`: Implements robust mechanisms to handle duplicate or conflicting entries during data storage.
5. `Processing`: Automatically processes and persists data to MongoDB every 5 seconds.
6. `Data Integrity`: Ensures data accuracy and consistency while maintaining efficient storage.

## How It Works

1. `Data Retrieval`: The broker pulls raw data from Redis periodically or in real time, depending on the setup.

2. `Data Filtering`: Unnecessary or irrelevant data is discarded. The system identifies key data points that are critical for business use cases.

3. `Logic Application`: Advanced logic and calculations are applied to the filtered data, such as aggregating energy totals, detecting anomalies, or calculating differences between data points.

4. `Conflict Resolution`: Before saving to MongoDB, the broker ensures there are no duplicate records. It checks for existing entries and resolves conflicts based on predefined rules.

5. `Data Persistence`: Refined and validated data is stored in MongoDB as a persistent layer for long-term use and analysis.
