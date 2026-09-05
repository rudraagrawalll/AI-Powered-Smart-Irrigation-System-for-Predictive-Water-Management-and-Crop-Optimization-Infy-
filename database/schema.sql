-- AI-Powered Smart Irrigation System
-- Database Schema

CREATE TABLE farmers (
    farmer_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fields (
    field_id SERIAL PRIMARY KEY,
    farmer_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    area DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (farmer_id)
        REFERENCES farmers(farmer_id)
        ON DELETE CASCADE
);

CREATE TABLE crops (
    crop_id SERIAL PRIMARY KEY,
    field_id INTEGER NOT NULL,
    crop_name VARCHAR(100) NOT NULL,
    growth_stage VARCHAR(100),
    planting_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (field_id)
        REFERENCES fields(field_id)
        ON DELETE CASCADE
);

CREATE TABLE sensors (
    sensor_id VARCHAR(50) PRIMARY KEY,
    field_id INTEGER NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (field_id)
        REFERENCES fields(field_id)
        ON DELETE CASCADE
);

CREATE TABLE sensor_readings (
    reading_id SERIAL PRIMARY KEY,
    sensor_id VARCHAR(50) NOT NULL,
    field_id INTEGER NOT NULL,
    soil_moisture DECIMAL(5,2) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sensor_id)
        REFERENCES sensors(sensor_id)
        ON DELETE CASCADE,

    FOREIGN KEY (field_id)
        REFERENCES fields(field_id)
        ON DELETE CASCADE,

    CHECK (soil_moisture >= 0 AND soil_moisture <= 100),

    UNIQUE (sensor_id, timestamp)
);

CREATE TABLE weather_data (
    weather_id SERIAL PRIMARY KEY,
    field_id INTEGER NOT NULL,
    temperature DECIMAL(6,2),
    humidity DECIMAL(5,2),
    rainfall DECIMAL(8,2),
    rain_probability DECIMAL(5,2),
    forecast TEXT,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (field_id)
        REFERENCES fields(field_id)
        ON DELETE CASCADE
);

CREATE TABLE irrigation_history (
    irrigation_id SERIAL PRIMARY KEY,
    field_id INTEGER NOT NULL,
    irrigation_time TIMESTAMP NOT NULL,
    water_amount DECIMAL(10,2),
    duration INTEGER,
    source VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (field_id)
        REFERENCES fields(field_id)
        ON DELETE CASCADE
);