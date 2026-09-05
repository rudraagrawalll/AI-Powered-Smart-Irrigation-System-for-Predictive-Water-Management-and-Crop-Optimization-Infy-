const express = require("express");
const { Pool } = require("pg");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(express.json());

// ===============================
// PostgreSQL Connection
// ===============================

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || undefined
});

// ===============================
// HOME ROUTE
// ===============================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Smart Irrigation Backend is running"
    });
});

// ===============================
// DATABASE TEST
// ===============================

app.get("/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            success: true,
            message: "Database connected successfully",
            time: result.rows[0].now
        });

    } catch (error) {
        console.error("Database error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

// ============================================================
// SENSOR DATA INGESTION
// POST /api/sensor/readings
// ============================================================

app.post("/api/sensor/readings", async (req, res) => {

    try {

        const {
            sensor_id,
            field_id,
            soil_moisture,
            timestamp
        } = req.body;

        // --------------------------------
        // Required fields validation
        // --------------------------------

        if (
            sensor_id === undefined ||
            field_id === undefined ||
            soil_moisture === undefined ||
            timestamp === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "sensor_id, field_id, soil_moisture and timestamp are required"
            });
        }

        // --------------------------------
        // Numeric validation
        // --------------------------------

        if (
            isNaN(Number(field_id)) ||
            isNaN(Number(soil_moisture))
        ) {
            return res.status(400).json({
                success: false,
                message: "field_id and soil_moisture must be valid numbers"
            });
        }

        // --------------------------------
        // Timestamp validation
        // --------------------------------

        if (isNaN(Date.parse(timestamp))) {
            return res.status(400).json({
                success: false,
                message: "Invalid timestamp"
            });
        }

        // --------------------------------
        // Soil moisture validation
        // --------------------------------

        const moisture = Number(soil_moisture);

        if (moisture < 0 || moisture > 100) {
            return res.status(400).json({
                success: false,
                message: "soil_moisture must be between 0 and 100"
            });
        }

        // --------------------------------
        // Check sensor exists and belongs
        // to the specified field
        // --------------------------------

        const sensorCheck = await pool.query(
            `
            SELECT sensor_id
            FROM sensors
            WHERE sensor_id = $1
            AND field_id = $2
            `,
            [sensor_id, Number(field_id)]
        );

        if (sensorCheck.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Sensor does not exist or does not belong to this field"
            });
        }

        // --------------------------------
        // Insert sensor reading
        // --------------------------------

        const result = await pool.query(
            `
            INSERT INTO sensor_readings
            (
                sensor_id,
                field_id,
                soil_moisture,
                timestamp
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [
                sensor_id,
                Number(field_id),
                moisture,
                timestamp
            ]
        );

        res.status(201).json({
            success: true,
            message: "Sensor reading stored successfully",
            data: result.rows[0]
        });

    } catch (error) {

        console.error("Sensor ingestion error:", error);

        // Duplicate reading
        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Duplicate sensor reading"
            });
        }

        // Foreign key violation
        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "Invalid sensor or field"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to store sensor reading",
            error: error.message
        });
    }
});

// ============================================================
// WEATHER API
// GET /api/weather/:field_id
// ============================================================

app.get("/api/weather/:field_id", async (req, res) => {

    try {

        const field_id = Number(req.params.field_id);

        // --------------------------------
        // Validate field_id
        // --------------------------------

        if (isNaN(field_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid field_id"
            });
        }

        // --------------------------------
        // Get field location
        // --------------------------------

        const fieldResult = await pool.query(
            `
            SELECT
                field_id,
                name,
                latitude,
                longitude
            FROM fields
            WHERE field_id = $1
            `,
            [field_id]
        );

        if (fieldResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Field not found"
            });
        }

        const field = fieldResult.rows[0];

        // --------------------------------
        // Check API key
        // --------------------------------

        if (
            !process.env.OPENWEATHER_API_KEY ||
            process.env.OPENWEATHER_API_KEY === "YOUR_REAL_KEY"
        ) {
            return res.status(500).json({
                success: false,
                message: "OpenWeather API key is not configured"
            });
        }

        // --------------------------------
        // Current weather API
        // --------------------------------

        const currentWeatherResponse = await axios.get(
            "https://api.openweathermap.org/data/2.5/weather",
            {
                params: {
                    lat: field.latitude,
                    lon: field.longitude,
                    appid: process.env.OPENWEATHER_API_KEY,
                    units: "metric"
                },
                timeout: 10000
            }
        );

        const currentWeather = currentWeatherResponse.data;

        // --------------------------------
        // Validate current weather response
        // --------------------------------

        if (
            !currentWeather ||
            !currentWeather.main ||
            !currentWeather.weather
        ) {
            return res.status(502).json({
                success: false,
                message: "Invalid response received from weather service"
            });
        }

        const temperature = currentWeather.main.temp;
        const humidity = currentWeather.main.humidity;

        let rainfall = 0;

        if (
            currentWeather.rain &&
            currentWeather.rain["1h"] !== undefined
        ) {
            rainfall = currentWeather.rain["1h"];
        }

        const weatherDescription =
            currentWeather.weather[0]?.description || "Unknown";

        // --------------------------------
        // Forecast API
        // --------------------------------

        const forecastResponse = await axios.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            {
                params: {
                    lat: field.latitude,
                    lon: field.longitude,
                    appid: process.env.OPENWEATHER_API_KEY,
                    units: "metric"
                },
                timeout: 10000
            }
        );

        const forecastData = forecastResponse.data;

        // --------------------------------
        // Calculate rain probability
        // --------------------------------

        let rainProbability = 0;

        if (
            forecastData &&
            Array.isArray(forecastData.list) &&
            forecastData.list.length > 0
        ) {

            // Take approximately next 24 hours
            const next24Hours = forecastData.list.slice(0, 8);

            const probabilities = next24Hours
                .map(item => {
                    if (
                        typeof item.pop === "number"
                    ) {
                        return item.pop;
                    }

                    return 0;
                });

            if (probabilities.length > 0) {

                // Maximum probability during next 24 hours
                rainProbability =
                    Math.max(...probabilities) * 100;

                rainProbability =
                    Math.round(rainProbability * 100) / 100;
            }
        }

        // --------------------------------
        // Store weather data
        // --------------------------------

        const weatherResult = await pool.query(
            `
            INSERT INTO weather_data
            (
                field_id,
                temperature,
                humidity,
                rainfall,
                rain_probability,
                forecast,
                timestamp
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING *
            `,
            [
                field_id,
                temperature,
                humidity,
                rainfall,
                rainProbability,
                weatherDescription
            ]
        );

        // --------------------------------
        // Response
        // --------------------------------

        res.json({
            success: true,
            message: "Weather data retrieved and stored successfully",

            field: {
                field_id: field.field_id,
                name: field.name,
                latitude: field.latitude,
                longitude: field.longitude
            },

            weather: {
                temperature: temperature,
                humidity: humidity,
                rainfall: rainfall,
                rain_probability: rainProbability,
                forecast: weatherDescription
            },

            database: weatherResult.rows[0]
        });

    } catch (error) {

        console.error(
            "Weather API error:",
            error.response?.data || error.message
        );

        // --------------------------------
        // OpenWeather authentication error
        // --------------------------------

        if (error.response?.status === 401) {
            return res.status(502).json({
                success: false,
                message: "Invalid or inactive OpenWeather API key"
            });
        }

        // --------------------------------
        // OpenWeather rate limit
        // --------------------------------

        if (error.response?.status === 429) {
            return res.status(503).json({
                success: false,
                message: "Weather API rate limit exceeded"
            });
        }

        // --------------------------------
        // Weather service unavailable
        // --------------------------------

        if (error.code === "ECONNABORTED") {
            return res.status(504).json({
                success: false,
                message: "Weather API request timed out"
            });
        }

        if (error.response) {
            return res.status(502).json({
                success: false,
                message: "Weather service returned an error",
                error: error.response.data
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to retrieve weather data",
            error: error.message
        });
    }
});

// ============================================================
// FARMER REGISTRATION
// POST /api/farmers
// ============================================================

app.post("/api/farmers", async (req, res) => {

    try {

        const {
            name,
            email,
            phone
        } = req.body;

        // --------------------------------
        // Validation
        // --------------------------------

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: "name and email are required"
            });
        }

        // --------------------------------
        // Insert farmer
        // --------------------------------

        const result = await pool.query(
            `
            INSERT INTO farmers
            (
                name,
                email,
                phone
            )
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                name,
                email,
                phone || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "Farmer registered successfully",
            data: result.rows[0]
        });

    } catch (error) {

        console.error("Farmer registration error:", error);

        // Duplicate email
        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A farmer with this email already exists"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to register farmer",
            error: error.message
        });
    }
});

// ============================================================
// FIELD REGISTRATION
// POST /api/fields
// ============================================================

app.post("/api/fields", async (req, res) => {

    try {

        const {
            farmer_id,
            name,
            latitude,
            longitude,
            area
        } = req.body;

        // --------------------------------
        // Required fields
        // --------------------------------

        if (
            farmer_id === undefined ||
            !name ||
            latitude === undefined ||
            longitude === undefined ||
            area === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "farmer_id, name, latitude, longitude and area are required"
            });
        }

        // --------------------------------
        // Numeric validation
        // --------------------------------

        if (
            isNaN(Number(farmer_id)) ||
            isNaN(Number(latitude)) ||
            isNaN(Number(longitude)) ||
            isNaN(Number(area))
        ) {
            return res.status(400).json({
                success: false,
                message: "farmer_id, latitude, longitude and area must be valid numbers"
            });
        }

        // --------------------------------
        // Coordinate validation
        // --------------------------------

        if (
            Number(latitude) < -90 ||
            Number(latitude) > 90
        ) {
            return res.status(400).json({
                success: false,
                message: "latitude must be between -90 and 90"
            });
        }

        if (
            Number(longitude) < -180 ||
            Number(longitude) > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "longitude must be between -180 and 180"
            });
        }

        // --------------------------------
        // Area validation
        // --------------------------------

        if (Number(area) <= 0) {
            return res.status(400).json({
                success: false,
                message: "area must be greater than 0"
            });
        }

        // --------------------------------
        // Insert field
        // --------------------------------

        const result = await pool.query(
            `
            INSERT INTO fields
            (
                farmer_id,
                name,
                latitude,
                longitude,
                area
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [
                Number(farmer_id),
                name,
                Number(latitude),
                Number(longitude),
                Number(area)
            ]
        );

        res.status(201).json({
            success: true,
            message: "Field registered successfully",
            data: result.rows[0]
        });

    } catch (error) {

        console.error("Field registration error:", error);

        // Farmer doesn't exist
        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "Farmer does not exist"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to register field",
            error: error.message
        });
    }
});

// ============================================================
// CROP REGISTRATION
// POST /api/crops
// ============================================================

app.post("/api/crops", async (req, res) => {

    try {

        const {
            field_id,
            crop_name,
            growth_stage,
            planting_date
        } = req.body;

        // --------------------------------
        // Required fields
        // --------------------------------

        if (
            field_id === undefined ||
            !crop_name ||
            !growth_stage
        ) {
            return res.status(400).json({
                success: false,
                message: "field_id, crop_name and growth_stage are required"
            });
        }

        // --------------------------------
        // Validate field_id
        // --------------------------------

        if (isNaN(Number(field_id))) {
            return res.status(400).json({
                success: false,
                message: "field_id must be a valid number"
            });
        }

        // --------------------------------
        // Validate planting date
        // --------------------------------

        if (
            planting_date !== undefined &&
            planting_date !== null &&
            isNaN(Date.parse(planting_date))
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid planting_date"
            });
        }

        // --------------------------------
        // Insert crop
        // --------------------------------

        const result = await pool.query(
            `
            INSERT INTO crops
            (
                field_id,
                crop_name,
                growth_stage,
                planting_date
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [
                Number(field_id),
                crop_name,
                growth_stage,
                planting_date || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "Crop registered successfully",
            data: result.rows[0]
        });

    } catch (error) {

        console.error("Crop registration error:", error);

        // Field doesn't exist
        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "Field does not exist"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to register crop",
            error: error.message
        });
    }
});

// ============================================================
// START SERVER
// ============================================================

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Smart Irrigation Backend running on port ${PORT}`);
});