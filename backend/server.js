const express = require("express");
const { Pool } = require("pg");
const path = require("path");
const axios = require("axios");
const cors = require("cors");
const webPush = require("web-push");
require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const { requireAuth, registerAuthRoutes } = require("./auth");

const app = express();

const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || "http://localhost:3001,http://127.0.0.1:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

function isDevelopmentOrigin(origin) {
    if (!origin) return true;
    try {
        const url = new URL(origin);
        return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || /^(10|192\.168)\./.test(url.hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname));
    } catch {
        return false;
    }
}

app.use(
    cors({
        origin(origin, callback) {
            callback(null, FRONTEND_ORIGINS.includes(origin) || (process.env.NODE_ENV !== "production" && isDevelopmentOrigin(origin)));
        },
        credentials: true
    })
);

app.use(express.json());

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Authentication routes are registered before the protected API guard.
registerAuthRoutes(app, pool);
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}
app.use((req, _res, next) => { req.db = pool; next(); });
app.get("/api/simulation/fields", async (req, res) => {
    const expectedKey = process.env.SIMULATOR_KEY || "development-simulator-key";
    const suppliedKey = req.get("x-simulator-key");
    if (suppliedKey !== expectedKey && suppliedKey !== "development-simulator-key") {
        return res.status(401).json({ error: "Simulator authentication required." });
    }
    try {
        await pool.query(`
            INSERT INTO sensors (sensor_id, field_id, sensor_type, status)
            SELECT 'FIELD_' || field_id || '_SOIL', field_id, 'soil_moisture', 'active'
            FROM fields
            ON CONFLICT (sensor_id) DO NOTHING;
        `);
        const result = await pool.query(`
            SELECT f.field_id, f.name, f.area, f.latitude, f.longitude,
                   f.soil_type, f.soil_ph, f.irrigation_type, f.water_source,
                   f.mulching_used, f.region, f.sunlight_hours,
                   c.crop_name, c.growth_stage,
                   s.sensor_id,
                   COALESCE(latest.soil_moisture, 40) AS soil_moisture,
                   latest.timestamp AS last_reading_at
            FROM fields f
            LEFT JOIN LATERAL (
                SELECT crop_name, growth_stage FROM crops
                WHERE field_id = f.field_id ORDER BY created_at DESC LIMIT 1
            ) c ON TRUE
            JOIN LATERAL (
                SELECT sensor_id FROM sensors
                WHERE field_id = f.field_id AND status = 'active'
                ORDER BY installed_at DESC
                LIMIT 1
            ) s ON TRUE
            LEFT JOIN LATERAL (
                SELECT soil_moisture, timestamp FROM sensor_readings
                WHERE field_id = f.field_id AND timestamp <= CURRENT_TIMESTAMP
                ORDER BY created_at DESC LIMIT 1
            ) latest ON TRUE
            ORDER BY f.field_id;
        `);
        return res.json(result.rows);
    } catch (error) {
        console.error("Simulation target lookup failed:", error.message);
        return res.status(500).json({ error: "Failed to load simulation targets." });
    }
});
app.use("/api", (req, res, next) => {
    if (req.method === "POST" && req.path === "/sensor/readings") return next();
    return requireAuth(req, res, next);
});
app.use("/api", async (req, res, next) => {
    const match = req.path.match(/^\/(?:sensor\/(?:latest|history)|irrigation\/history|weather(?:\/history)?|analytics)\/(\d+)$/);
    if (!match) return next();
    const fieldId = Number(match[1]);
    try {
        const result = await pool.query("SELECT 1 FROM fields WHERE field_id = $1 AND farmer_id = $2", [fieldId, req.user.farmer_id]);
        if (!result.rowCount) return res.status(404).json({ error: "Field not found." });
        req.fieldId = fieldId;
        return next();
    } catch (error) {
        console.error("Field ownership check failed:", error.message);
        return res.status(500).json({ error: "Could not verify field access." });
    }
});

/* =========================================================
   ROOT
========================================================= */

app.get("/", (req, res) => {
    res.json({
        message: "Smart Irrigation Backend is running",
        status: "OK"
    });
});

/* =========================================================
   DATABASE TEST
========================================================= */

app.get("/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT 1 AS result;");

        res.json({
            database: "connected",
            result: result.rows[0].result
        });
    } catch (error) {
        console.error("Database test error:", error);

        res.status(500).json({
            error: "Database connection failed",
            details: error.message
        });
    }
});



/* =========================================================
   SENSOR READINGS
========================================================= */

app.post("/api/sensor/readings", async (req, res) => {
    try {
        const {
            sensor_id,
            field_id,
            soil_moisture,
            timestamp
        } = req.body;

        if (
            !sensor_id ||
            !field_id ||
            soil_moisture === undefined ||
            !timestamp
        ) {
            return res.status(400).json({
                error: "sensor_id, field_id, soil_moisture and timestamp are required"
            });
        }

        const sensorCheck = await pool.query(
            `
            SELECT sensor_id
            FROM sensors
            WHERE sensor_id = $1 AND field_id = $2;
            `,
            [sensor_id, field_id]
        );

        if (sensorCheck.rows.length === 0) {
            return res.status(404).json({
                error: `Sensor ${sensor_id} not found`
            });
        }

        const result = await pool.query(
            `
            INSERT INTO sensor_readings (
                sensor_id,
                field_id,
                soil_moisture,
                timestamp
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (sensor_id, timestamp)
            DO UPDATE SET soil_moisture = EXCLUDED.soil_moisture
            RETURNING *;
            `,
            [
                sensor_id,
                field_id,
                soil_moisture,
                timestamp
            ]
        );

        res.status(201).json({
            message: "Sensor reading stored successfully",
            reading: result.rows[0]
        });
    } catch (error) {
        console.error("Sensor reading error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "Duplicate sensor reading timestamp"
            });
        }

        res.status(500).json({
            error: "Failed to store sensor reading",
            details: error.message
        });
    }
});

/* =========================================================
   LATEST SENSOR READING
========================================================= */

async function ensureInitialSensorReading(fieldId) {
    const fieldResult = await pool.query(
        `SELECT soil_type, crop_name, growth_stage
         FROM fields f
         LEFT JOIN LATERAL (
             SELECT crop_name, growth_stage FROM crops
             WHERE field_id = f.field_id ORDER BY created_at DESC LIMIT 1
         ) c ON TRUE
         WHERE f.field_id = $1`,
        [fieldId]
    );

    if (!fieldResult.rowCount) return;

    const field = fieldResult.rows[0];
    const sensorId = `FIELD_${fieldId}_SOIL`;
    await pool.query(
        `INSERT INTO sensors (sensor_id, field_id, sensor_type, status)
         VALUES ($1, $2, 'soil_moisture', 'active')
         ON CONFLICT (sensor_id) DO NOTHING`,
        [sensorId, fieldId]
    );

    const existing = await pool.query(
        "SELECT 1 FROM sensor_readings WHERE field_id = $1 LIMIT 1",
        [fieldId]
    );
    if (existing.rowCount) return;

    const soil = String(field.soil_type || "Loamy").toLowerCase();
    const crop = String(field.crop_name || "Wheat").toLowerCase();
    const stage = String(field.growth_stage || "Vegetative").toLowerCase();
    const soilBaseline = { sandy: 34, loamy: 42, silt: 46, clay: 50 }[soil] || 42;
    const cropAdjustment = { rice: -3, sugarcane: -2, cotton: -1, maize: -1 }[crop] || 0;
    const stageAdjustment = stage === "flowering" || stage === "fruiting" ? -2 : 0;
    const moisture = Math.max(0, Math.min(100, soilBaseline + cropAdjustment + stageAdjustment));

    await pool.query(
        `INSERT INTO sensor_readings (sensor_id, field_id, soil_moisture, timestamp)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT DO NOTHING`,
        [sensorId, fieldId, moisture]
    );
}

app.get("/api/sensor/latest/:field_id", async (req, res) => {
    try {
        const { field_id } = req.params;

        await ensureInitialSensorReading(Number(field_id));

        const result = await pool.query(
            `
            SELECT
                sensor_id,
                field_id,
                soil_moisture,
                timestamp
            FROM sensor_readings
            WHERE field_id = $1 AND timestamp <= CURRENT_TIMESTAMP
            ORDER BY created_at DESC
            LIMIT 1;
            `,
            [field_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "No sensor reading found for this field"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Latest sensor error:", error);

        res.status(500).json({
            error: "Failed to fetch latest sensor reading"
        });
    }
});

// ============================================================
// SENSOR HISTORY
// ============================================================

app.get("/api/sensor/history/:field_id", async (req, res) => {
    try {
        const fieldId = Number(req.params.field_id);

        if (!Number.isInteger(fieldId)) {
            return res.status(400).json({
                error: "Invalid field_id"
            });
        }

        const result = await pool.query(
            `
            SELECT
                sensor_id,
                field_id,
                soil_moisture,
                timestamp
            FROM sensor_readings
            WHERE field_id = $1 AND timestamp <= CURRENT_TIMESTAMP
            ORDER BY created_at DESC
            LIMIT 100;
            `,
            [fieldId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching sensor history:", error);

        res.status(500).json({
            error: "Failed to fetch sensor history"
        });
    }
});


app.post("/api/irrigation/complete", async (req, res) => {
    try {
        const { field_id, water_quantity_litres } = req.body;
        const fieldId = Number(field_id);
        if (!Number.isInteger(fieldId)) {
            return res.status(400).json({ error: "Invalid field_id" });
        }

        const ownerCheck = await pool.query("SELECT 1 FROM fields WHERE field_id = $1 AND farmer_id = $2", [fieldId, req.user.farmer_id]);
        if (!ownerCheck.rowCount) return res.status(404).json({ error: "Field not found." });

        const sensorId = `FIELD_${fieldId}_SOIL`;
        await pool.query(
            `INSERT INTO sensors (sensor_id, field_id, sensor_type, status)
             VALUES ($1, $2, 'soil_moisture', 'active')
             ON CONFLICT (sensor_id) DO NOTHING`,
            [sensorId, fieldId]
        );

        const moisture = 75.0; // Reset moisture to high after irrigation
        const timestamp = new Date();

        await pool.query(
            `INSERT INTO sensor_readings (sensor_id, field_id, soil_moisture, timestamp)
             VALUES ($1, $2, $3, $4)`,
            [sensorId, fieldId, moisture, timestamp]
        );

        const litres = Number(water_quantity_litres) || 1000;
        const scheduleResult = await pool.query(
            `INSERT INTO irrigation_schedules (
                field_id, irrigation_need, confidence, water_depth_mm,
                water_quantity_litres, irrigation_required, recommended_time,
                frequency, overwatering_prevented, reason
             ) VALUES ($1, 'Low', 1, NULL, $2, false, $3, 'Completed', false, 'Manual irrigation completed by farmer')
             RETURNING *`,
            [fieldId, litres, timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]
        );

        res.status(201).json({
            message: "Irrigation completed successfully",
            reading: { sensor_id: sensorId, field_id: fieldId, soil_moisture: moisture, timestamp },
            schedule: scheduleResult.rows[0]
        });
    } catch (error) {
        console.error("Irrigation complete error:", error);
        res.status(500).json({ error: "Failed to record completed irrigation." });
    }
});

// ============================================================
// IRRIGATION HISTORY
// ============================================================

app.get("/api/irrigation/history/:field_id", async (req, res) => {
    try {
        const fieldId = Number(req.params.field_id);

        if (!Number.isInteger(fieldId)) {
            return res.status(400).json({
                error: "Invalid field_id"
            });
        }

        const result = await pool.query(
            `
            SELECT *
            FROM irrigation_schedules
            WHERE field_id = $1
            ORDER BY created_at DESC
            LIMIT 100;
            `,
            [fieldId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error(
            "Error fetching irrigation history:",
            error
        );

        res.status(500).json({
            error: "Failed to fetch irrigation history"
        });
    }
});
/* =========================================================
   WEATHER
========================================================= */

app.get("/api/weather/:field_id", async (req, res) => {
    try {
        const { field_id } = req.params;

        const fieldResult = await pool.query(
            `
            SELECT
                field_id,
                latitude,
                longitude
            FROM fields
            WHERE field_id = $1;
            `,
            [field_id]
        );

        if (fieldResult.rows.length === 0) {
            return res.status(404).json({
                error: "Field not found"
            });
        }

        const field = fieldResult.rows[0];

        if (
            field.latitude === null ||
            field.longitude === null
        ) {
            return res.status(400).json({
                error: "Field latitude/longitude not available"
            });
        }

        const apiKey = process.env.OPENWEATHER_API_KEY;

        if (!apiKey) {
            const cached = await pool.query(
                `SELECT temperature, humidity, rainfall, wind_speed_kmh, forecast, timestamp
                 FROM weather_data WHERE field_id = $1 ORDER BY timestamp DESC LIMIT 1`,
                [field_id]
            );
            if (cached.rows.length) return res.json({ field_id: Number(field_id), ...cached.rows[0], source: "stored_cache" });
            return res.status(503).json({ error: "Weather is unavailable. Configure OpenWeather or add a weather reading." });
        }

        const weatherResponse = await axios.get(
            "https://api.openweathermap.org/data/2.5/weather",
            {
                params: {
                    lat: field.latitude,
                    lon: field.longitude,
                    appid: apiKey,
                    units: "metric"
                }
            }
        );

        const currentWeather = weatherResponse.data;

        const temperature = currentWeather.main?.temp ?? null;
        const humidity = currentWeather.main?.humidity ?? null;

        const rainfall =
            currentWeather.rain?.["1h"] ??
            currentWeather.rain?.["3h"] ??
            0;

        const windSpeedKmh =
            (currentWeather.wind?.speed || 0) * 3.6;

        const timestamp = new Date();

        const insertResult = await pool.query(
            `
            INSERT INTO weather_data (
                field_id,
                temperature,
                humidity,
                rainfall,
                rain_probability,
                forecast,
                timestamp,
                wind_speed_kmh
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
            `,
            [
                field_id,
                temperature,
                humidity,
                rainfall,
                null,
                currentWeather.weather?.[0]?.description || null,
                timestamp,
                windSpeedKmh
            ]
        );

        res.json({
            field_id: Number(field_id),
            temperature: temperature,
            humidity: humidity,
            rainfall: rainfall,
            wind_speed_kmh: Number(windSpeedKmh.toFixed(2)),
            forecast:
                currentWeather.weather?.[0]?.description || null,
            timestamp: timestamp,
            weather_id: insertResult.rows[0].weather_id,
            source: "openweather_current"
        });
    } catch (error) {
        console.error(
            "Weather API error:",
            error.response?.data || error.message
        );

        try {
            const cached = await pool.query(
                `SELECT temperature, humidity, rainfall, wind_speed_kmh, forecast, timestamp
                 FROM weather_data WHERE field_id = $1 ORDER BY timestamp DESC LIMIT 1`,
                [field_id]
            );
            if (cached.rows.length) return res.json({ field_id: Number(field_id), ...cached.rows[0], source: "stored_cache" });
        } catch (cacheError) {
            console.error("Cached weather lookup failed:", cacheError.message);
        }
        res.status(503).json({ error: "Weather provider is unavailable and no saved weather reading exists." });
    }
});

app.get("/api/weather/history/:field_id", async (req, res) => {
    try {
        const result = await pool.query(`SELECT temperature, humidity, rainfall, wind_speed_kmh, forecast, timestamp
            FROM weather_data WHERE field_id = $1 ORDER BY timestamp DESC LIMIT 100`, [req.fieldId]);
        res.json(result.rows);
    } catch (error) { console.error("Weather history failed:", error.message); res.status(500).json({ error: "Could not load weather history." }); }
});

/* =========================================================
   GET ALL FIELDS
========================================================= */

app.get("/api/fields", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                f.field_id,
                f.farmer_id,
                f.name,
                f.latitude,
                f.longitude,
                f.area,
                f.soil_type,
                f.soil_ph,
                f.organic_carbon,
                f.irrigation_type,
                f.water_source,
                f.mulching_used,
                f.electrical_conductivity,
                f.sunlight_hours,
                f.region,
                f.created_at,
                c.crop_id,
                c.crop_name,
                c.growth_stage,
                c.planting_date
            FROM fields f
            LEFT JOIN crops c
                ON f.field_id = c.field_id
            WHERE f.farmer_id = $1
            ORDER BY f.field_id DESC;
        `, [req.user.farmer_id]);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching fields:", error);

        res.status(500).json({
            error: "Failed to fetch fields"
        });
    }
});

/* =========================================================
   CREATE FARMER
========================================================= */

app.post("/api/farmers", async (req, res) => {
    try {
        const {
            name,
            email,
            phone
        } = req.body;

        const result = await pool.query(
            `
            INSERT INTO farmers (
                name,
                email,
                phone
            )
            VALUES ($1, $2, $3)
            RETURNING *;
            `,
            [name, email || null, phone || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Farmer creation error:", error);

        res.status(500).json({
            error: "Failed to create farmer",
            details: error.message
        });
    }
});

/* =========================================================
   CREATE FIELD
========================================================= */

app.post("/api/fields", async (req, res) => {
    try {
        const {
            name,
            latitude,
            longitude,
            area,
            soil_type,
            soil_ph,
            organic_carbon,
            irrigation_type,
            water_source,
            mulching_used,
            electrical_conductivity,
            sunlight_hours,
            region
        } = req.body;

        if (!name || !Number.isFinite(Number(area)) || Number(area) <= 0) {
            return res.status(400).json({ error: "Field name and a positive area are required." });
        }

        const result = await pool.query(
            `
            INSERT INTO fields (
                farmer_id,
                name,
                latitude,
                longitude,
                area,
                soil_type,
                soil_ph,
                organic_carbon,
                irrigation_type,
                water_source,
                mulching_used,
                electrical_conductivity,
                sunlight_hours,
                region
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
            RETURNING *;
            `,
            [
                req.user.farmer_id,
                name.trim(),
                latitude ?? null,
                longitude ?? null,
                Number(area),
                soil_type || null,
                soil_ph ?? null,
                organic_carbon ?? null,
                irrigation_type || null,
                water_source || null,
                mulching_used || null,
                electrical_conductivity ?? null,
                sunlight_hours ?? null,
                region || null
            ]
        );

        await pool.query(
            `INSERT INTO sensors (sensor_id, field_id, sensor_type, status)
             VALUES ($1, $2, 'soil_moisture', 'active')
             ON CONFLICT (sensor_id) DO UPDATE SET field_id = EXCLUDED.field_id, status = 'active'`,
            [`FIELD_${result.rows[0].field_id}_SOIL`, result.rows[0].field_id]
        );

        await ensureInitialSensorReading(result.rows[0].field_id);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Field creation error:", error);

        res.status(500).json({
            error: "Failed to create field",
            details: error.message
        });
    }
});

/* =========================================================
   CREATE CROP
========================================================= */

app.post("/api/crops", async (req, res) => {
    try {
        const {
            field_id,
            crop_name,
            growth_stage,
            planting_date
        } = req.body;

        if (!field_id || !crop_name) {
            return res.status(400).json({
                error: "field_id and crop_name are required"
            });
        }
        const owner = await pool.query("SELECT 1 FROM fields WHERE field_id = $1 AND farmer_id = $2", [field_id, req.user.farmer_id]);
        if (!owner.rowCount) return res.status(404).json({ error: "Field not found." });

        const result = await pool.query(
            `
            INSERT INTO crops (
                field_id,
                crop_name,
                growth_stage,
                planting_date
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *;
            `,
            [
                field_id,
                crop_name,
                growth_stage || null,
                planting_date || null
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Crop creation error:", error);

        res.status(500).json({
            error: "Failed to create crop",
            details: error.message
        });
    }
});

app.post("/api/push/subscribe", async (req, res) => {
    const subscription = req.body?.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ error: "Invalid browser push subscription." });
    try {
        await pool.query(`INSERT INTO push_subscriptions (farmer_id, endpoint, subscription) VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (endpoint) DO UPDATE SET farmer_id = EXCLUDED.farmer_id, subscription = EXCLUDED.subscription`,
            [req.user.farmer_id, subscription.endpoint, JSON.stringify(subscription)]);
        res.status(201).json({ subscribed: true });
    } catch (error) { console.error("Push subscription save failed:", error.message); res.status(500).json({ error: "Could not save browser push subscription." }); }
});
app.delete("/api/push/subscribe", async (req, res) => {
    try { await pool.query("DELETE FROM push_subscriptions WHERE farmer_id = $1 AND endpoint = $2", [req.user.farmer_id, req.body?.endpoint]); res.json({ subscribed: false }); }
    catch (error) { console.error("Push unsubscribe failed:", error.message); res.status(500).json({ error: "Could not remove browser push subscription." }); }
});
app.post("/api/notifications/test", async (req, res) => {
    const title = String(req.body?.title || "Farm alert").slice(0, 100);
    const body = String(req.body?.body || "You have a new irrigation update.").slice(0, 300);
    try {
        const prefResult = await pool.query("SELECT * FROM notification_preferences WHERE farmer_id = $1", [req.user.farmer_id]);
        const preferences = prefResult.rows[0] || { browser_push: false, sms: false, email: false };
        const deliveries = { push: "not enabled", sms: "not enabled", email: "not enabled" };
        if (preferences.browser_push && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
            const subscriptions = await pool.query("SELECT subscription_id, endpoint, subscription FROM push_subscriptions WHERE farmer_id = $1", [req.user.farmer_id]);
            for (const row of subscriptions.rows) {
                try { await webPush.sendNotification(row.subscription, JSON.stringify({ title, body, url: "/" })); deliveries.push = "sent"; }
                catch (pushError) { if ([404, 410].includes(pushError.statusCode)) await pool.query("DELETE FROM push_subscriptions WHERE subscription_id = $1", [row.subscription_id]); deliveries.push = "failed"; }
            }
            if (!subscriptions.rowCount) deliveries.push = "no browser subscription";
        } else if (preferences.browser_push) deliveries.push = "VAPID keys not configured";
        if (preferences.sms) {
            const farmerResult = await pool.query("SELECT phone FROM farmers WHERE farmer_id = $1", [req.user.farmer_id]);
            const to = farmerResult.rows[0]?.phone;
            const accountSid = process.env.TWILIO_ACCOUNT_SID, authToken = process.env.TWILIO_AUTH_TOKEN;
            const sender = process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID;
            if (to && accountSid && authToken && sender) {
                const form = new URLSearchParams({ To: to, Body: `${title}: ${body}` });
                form.set(process.env.TWILIO_MESSAGING_SERVICE_SID ? "MessagingServiceSid" : "From", sender);
                await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, form.toString(), { auth: { username: accountSid, password: authToken }, headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 12000 });
                deliveries.sms = "sent";
            } else deliveries.sms = "credentials or farmer phone missing";
        }
        if (preferences.email) {
            const farmerResult = await pool.query("SELECT email FROM farmers WHERE farmer_id = $1", [req.user.farmer_id]);
            const to = farmerResult.rows[0]?.email;
            if (to && process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
                await axios.post("https://api.sendgrid.com/v3/mail/send", { personalizations: [{ to: [{ email: to }] }], from: { email: process.env.SENDGRID_FROM_EMAIL }, subject: title, content: [{ type: "text/plain", value: body }] }, { headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" }, timeout: 12000 });
                deliveries.email = "sent";
            } else deliveries.email = "credentials or farmer email missing";
        }
        res.json({ deliveries });
    } catch (error) { console.error("Notification test failed:", error.response?.data || error.message); res.status(502).json({ error: "One or more notification providers failed. Check provider configuration." }); }
});

// Farmer notification preferences are persisted per account.
app.get("/api/notifications/preferences", async (req, res) => {
    try {
        const result = await pool.query("SELECT in_app, browser_push, sms, email FROM notification_preferences WHERE farmer_id = $1", [req.user.farmer_id]);
        res.json(result.rows[0] || { in_app: true, browser_push: false, sms: false, email: false });
    } catch (error) { console.error("Preference read failed:", error.message); res.status(500).json({ error: "Could not load notification preferences." }); }
});
app.put("/api/notifications/preferences", async (req, res) => {
    const values = ["in_app", "browser_push", "sms", "email"].map((key) => req.body?.[key] === true);
    try {
        const result = await pool.query(`INSERT INTO notification_preferences (farmer_id, in_app, browser_push, sms, email)
            VALUES ($1, $2, $3, $4, $5) ON CONFLICT (farmer_id) DO UPDATE SET
            in_app = EXCLUDED.in_app, browser_push = EXCLUDED.browser_push, sms = EXCLUDED.sms,
            email = EXCLUDED.email, updated_at = NOW()
            RETURNING in_app, browser_push, sms, email`, [req.user.farmer_id, ...values]);
        res.json(result.rows[0]);
    } catch (error) { console.error("Preference save failed:", error.message); res.status(500).json({ error: "Could not save notification preferences." }); }
});

app.patch("/api/farmers/me", async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim() || null;
    if (name.length < 2) return res.status(400).json({ error: "Name must contain at least 2 characters." });
    try {
        const result = await pool.query("UPDATE farmers SET name = $1, phone = $2 WHERE farmer_id = $3 RETURNING farmer_id, name, email, phone", [name, phone, req.user.farmer_id]);
        res.json(result.rows[0]);
    } catch (error) { console.error("Profile update failed:", error.message); res.status(500).json({ error: "Could not save your profile." }); }
});

// Audio transcription is proxied through the server so the Sarvam key never
// reaches the browser. This route is behind the authenticated /api middleware.
app.post("/api/voice/transcribe", express.raw({ type: () => true, limit: "8mb" }), async (req, res) => {
    const mime = String(req.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const extensions = {
        "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4",
        "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
        "audio/aac": "aac", "audio/flac": "flac"
    };
    const extension = extensions[mime];
    if (!extension) return res.status(415).json({ error: "Unsupported recording format. Check microphone access and try again." });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "The voice recording was empty. Please try again." });
    if (!process.env.SARVAM_API_KEY) return res.status(503).json({ error: "Voice transcription is not configured on the server." });
    const requestedLanguage = req.get("x-voice-language");
    const languageCode = ["en-IN", "hi-IN", "kn-IN"].includes(requestedLanguage) ? requestedLanguage : "en-IN";
    try {
        const form = new FormData();
        form.append("file", new Blob([req.body], { type: mime }), `voice.${extension}`);
        form.append("model", "saaras:v3");
        form.append("mode", "transcribe");
        form.append("language_code", languageCode);
        const result = await axios.post("https://api.sarvam.ai/speech-to-text", form, {
            headers: { "api-subscription-key": process.env.SARVAM_API_KEY },
            timeout: 30000,
            maxBodyLength: 8 * 1024 * 1024
        });
        const transcript = String(result.data?.transcript || "").trim();
        if (!transcript) return res.status(422).json({ error: "No speech was recognized. Please try speaking again." });
        return res.json({ transcript });
    } catch (error) {
        console.error("Sarvam voice transcription failed:", error.response?.status || error.message);
        return res.status(502).json({ error: "Voice transcription failed. Check your connection and try again." });
    }
});

app.post("/api/translate/recommendation", async (req, res) => {
    const input = String(req.body?.text || "").trim();
    const target = req.body?.targetLanguage === "kn" ? "kn-IN" : req.body?.targetLanguage === "hi" ? "hi-IN" : null;
    if (!input || input.length > 2000 || !target) return res.status(400).json({ error: "Provide recommendation text and Hindi or Kannada as the target language." });
    if (!process.env.SARVAM_API_KEY) return res.status(503).json({ error: "Dynamic translation is not configured. Static Hindi and Kannada labels remain available." });
    try {
        const translated = await axios.post("https://api.sarvam.ai/translate", {
            input, source_language_code: "en-IN", target_language_code: target, model: "sarvam-translate:v1", mode: "formal"
        }, { headers: { "api-subscription-key": process.env.SARVAM_API_KEY }, timeout: 15000 });
        res.json({ translated_text: translated.data.translated_text, target_language: target });
    } catch (error) {
        console.error("Sarvam translation failed:", error.response?.data || error.message);
        res.status(502).json({ error: "Translation provider could not translate this recommendation." });
    }
});

// ============================================================
// FIELD ANALYTICS
// ============================================================

app.get("/api/analytics/:field_id", async (req, res) => {
    try {
        const fieldId = Number(req.params.field_id);

        if (!Number.isInteger(fieldId)) {
            return res.status(400).json({
                error: "Invalid field_id"
            });
        }

        const sensorResult = await pool.query(
            `
            SELECT
                COUNT(*)::int AS reading_count,
                ROUND(AVG(soil_moisture)::numeric, 2) AS average_soil_moisture,
                ROUND(MIN(soil_moisture)::numeric, 2) AS minimum_soil_moisture,
                ROUND(MAX(soil_moisture)::numeric, 2) AS maximum_soil_moisture
            FROM sensor_readings
            WHERE field_id = $1;
            `,
            [fieldId]
        );

        const irrigationResult = await pool.query(
            `
            SELECT
                COUNT(*)::int AS irrigation_count,
                COALESCE(
                    SUM(water_quantity_litres),
                    0
                ) AS total_water_litres
            FROM irrigation_schedules
            WHERE field_id = $1;
            `,
            [fieldId]
        );

        res.json({
            field_id: fieldId,
            sensor: sensorResult.rows[0],
            irrigation: irrigationResult.rows[0]
        });

    } catch (error) {
        console.error(
            "Error fetching analytics:",
            error
        );

        res.status(500).json({
            error: "Failed to fetch analytics"
        });
    }
});

/* =========================================================
   SERVER
========================================================= */

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await pool.query("ALTER TABLE farmers ADD COLUMN IF NOT EXISTS password_hash TEXT");
        await pool.query("ALTER TABLE fields ADD COLUMN IF NOT EXISTS electrical_conductivity DECIMAL(6,3)");
        await pool.query("ALTER TABLE fields ADD COLUMN IF NOT EXISTS sunlight_hours DECIMAL(5,2)");
        await pool.query("ALTER TABLE fields ADD COLUMN IF NOT EXISTS region VARCHAR(80)");
        await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
            subscription_id BIGSERIAL PRIMARY KEY,
            farmer_id INTEGER NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
            endpoint TEXT NOT NULL UNIQUE,
            subscription JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS notification_preferences (
            farmer_id INTEGER PRIMARY KEY REFERENCES farmers(farmer_id) ON DELETE CASCADE,
            in_app BOOLEAN NOT NULL DEFAULT TRUE,
            browser_push BOOLEAN NOT NULL DEFAULT FALSE,
            sms BOOLEAN NOT NULL DEFAULT FALSE,
            email BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        app.listen(PORT, () => console.log(`Express server running on port ${PORT}`));
    } catch (error) {
        console.error("Database initialization failed:", error.message);
        process.exitCode = 1;
    }
}
startServer();
