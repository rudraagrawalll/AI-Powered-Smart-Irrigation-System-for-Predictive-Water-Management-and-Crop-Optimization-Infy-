const express = require("express");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(express.json());

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || undefined
});

// Home route
app.get("/", (req, res) => {
    res.json({
        message: "Smart Irrigation Backend is running"
    });
});

// Database test
app.get("/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            success: true,
            message: "Database connected successfully",
            database_time: result.rows[0].now
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

// Sensor data ingestion
app.post("/api/sensor/readings", async (req, res) => {

    try {

        const {
            sensor_id,
            field_id,
            soil_moisture,
            timestamp
        } = req.body;

        // Check required fields
        if (
            !sensor_id ||
            !field_id ||
            soil_moisture === undefined ||
            !timestamp
        ) {
            return res.status(400).json({
                success: false,
                message: "sensor_id, field_id, soil_moisture and timestamp are required"
            });
        }

        // Validate soil moisture
        if (soil_moisture < 0 || soil_moisture > 100) {
            return res.status(400).json({
                success: false,
                message: "Soil moisture must be between 0 and 100"
            });
        }

        // Insert into database
        const result = await pool.query(
            `INSERT INTO sensor_readings
            (sensor_id, field_id, soil_moisture, timestamp)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [
                sensor_id,
                field_id,
                soil_moisture,
                timestamp
            ]
        );

        res.status(201).json({
            success: true,
            message: "Sensor reading stored successfully",
            data: result.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to store sensor reading",
            error: error.message
        });
    }
});


// Start server
app.listen(3000, () => {
    console.log("Smart Irrigation Backend running on port 3000");
});