-- Development seed data for a working first dashboard session.
-- Apply after schema.sql. Safe to run repeatedly.

INSERT INTO farmers (farmer_id, name, email, phone, password_hash)
VALUES (1, 'Test Farmer', 'farmer@example.com', '+91-9000000000', 'scrypt$smart-irrigation-dev-seed$2075a61c093ed13873868076332403187ebf4fa02ac3858850073efe83e24cf656221b8170071063aec911b788826d2cd41126d8338a377322a23498960c6b57')
ON CONFLICT (farmer_id) DO UPDATE SET password_hash = COALESCE(farmers.password_hash, EXCLUDED.password_hash);

INSERT INTO fields (
    field_id, farmer_id, name, latitude, longitude, area,
    soil_type, soil_ph, organic_carbon, irrigation_type,
    water_source, mulching_used, electrical_conductivity, sunlight_hours, region
)
VALUES (
    1, 1, 'North Field', 22.719600, 75.857700, 2.50,
    'Loamy', 6.50, 0.80, 'Drip', 'Borewell', 'No', 0.80, 8.00, 'Central'
)
ON CONFLICT (field_id) DO NOTHING;

INSERT INTO crops (field_id, crop_name, growth_stage, planting_date)
SELECT 1, 'Wheat', 'Vegetative', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM crops WHERE field_id = 1);

INSERT INTO sensors (sensor_id, field_id, sensor_type, status)
VALUES ('SENSOR_001', 1, 'soil_moisture', 'active')
ON CONFLICT (sensor_id) DO NOTHING;

INSERT INTO sensor_readings (sensor_id, field_id, soil_moisture, timestamp)
SELECT 'SENSOR_001', 1, moisture, CURRENT_TIMESTAMP - (offset_minutes || ' minutes')::interval
FROM (VALUES (31.0, 20), (34.5, 40), (38.0, 60), (42.0, 80), (36.5, 100)) AS readings(moisture, offset_minutes)
WHERE NOT EXISTS (
    SELECT 1 FROM sensor_readings WHERE sensor_id = 'SENSOR_001'
);

SELECT setval(
    pg_get_serial_sequence('farmers', 'farmer_id'),
    GREATEST((SELECT MAX(farmer_id) FROM farmers), 1),
    true
);
SELECT setval(
    pg_get_serial_sequence('fields', 'field_id'),
    GREATEST((SELECT MAX(field_id) FROM fields), 1),
    true
);
