-- Additive migration: authentication, notification preferences, and full model inputs.
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE fields ADD COLUMN IF NOT EXISTS electrical_conductivity DECIMAL(6,3);
ALTER TABLE fields ADD COLUMN IF NOT EXISTS sunlight_hours DECIMAL(5,2);
ALTER TABLE fields ADD COLUMN IF NOT EXISTS region VARCHAR(80);
ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS wind_speed_kmh DECIMAL(6,2);
CREATE TABLE IF NOT EXISTS notification_preferences (
    farmer_id INTEGER PRIMARY KEY REFERENCES farmers(farmer_id) ON DELETE CASCADE,
    in_app BOOLEAN NOT NULL DEFAULT TRUE,
    browser_push BOOLEAN NOT NULL DEFAULT FALSE,
    sms BOOLEAN NOT NULL DEFAULT FALSE,
    email BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    subscription_id BIGSERIAL PRIMARY KEY,
    farmer_id INTEGER NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
