"""Continuously generate field-aware soil-moisture readings."""

import os
import random
import time
from datetime import datetime

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
API_ROOT = os.getenv("IRRIGATION_API_URL", "http://localhost:3000")
SIMULATOR_KEY = os.getenv("SIMULATOR_KEY", "development-simulator-key")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
INTERVAL_SECONDS = max(5, int(os.getenv("SENSOR_INTERVAL_SECONDS", "30")))


def number(value, fallback=0.0):
    try:
        return float(value) if value is not None else fallback
    except (TypeError, ValueError):
        return fallback


def weather_for(field):
    if not OPENWEATHER_API_KEY:
        return {"temperature": 28.0, "humidity": 60.0, "rainfall": 0.0}
    try:
        response = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": field.get("latitude"), "lon": field.get("longitude"), "appid": OPENWEATHER_API_KEY, "units": "metric"},
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
        return {
            "temperature": number(data.get("main", {}).get("temp"), 28.0),
            "humidity": number(data.get("main", {}).get("humidity"), 60.0),
            "rainfall": number(data.get("rain", {}).get("1h"), 0.0),
        }
    except (requests.RequestException, ValueError, TypeError):
        return {"temperature": 28.0, "humidity": 60.0, "rainfall": 0.0}


def moisture_reading(field, weather):
    """Model infiltration, evaporation, crop demand, and sensor noise."""
    previous = number(field.get("soil_moisture"), 45.0)
    if previous <= 5.0:
        previous = 35.0  # Reset baseline if previously clamped to static 5% floor
    soil = str(field.get("soil_type") or "Loamy").lower()
    crop = str(field.get("crop_name") or "Wheat").lower()
    stage = str(field.get("growth_stage") or "Vegetative").lower()
    irrigation = str(field.get("irrigation_type") or "Drip").lower()

    retention = {"sandy": -0.2, "loamy": 0.0, "silt": 0.1, "clay": 0.2}.get(soil, 0.0)
    crop_demand = {"rice": 0.3, "sugarcane": 0.25, "cotton": 0.2, "maize": 0.15}.get(crop, 0.1)
    stage_demand = {"flowering": 0.2, "fruiting": 0.2, "vegetative": 0.1, "sowing": 0.05}.get(stage, 0.1)
    irrigation_support = {"drip": 0.3, "sprinkler": 0.25, "flood": 0.5, "furrow": 0.4}.get(irrigation, 0.2)
    evaporation = max(0.0, weather["temperature"] - 20.0) * 0.03
    dry_air = max(0.0, 60.0 - weather["humidity"]) * 0.01
    rainfall_gain = weather["rainfall"] * 0.45

    change = retention + irrigation_support + rainfall_gain - evaporation - dry_air - crop_demand - stage_demand
    change += random.uniform(-0.8, 0.8)
    change = max(-2.5, min(2.5, change))

    new_reading = round(previous + change, 2)
    return round(max(15.0, min(85.0, new_reading)), 2)


def fetch_fields():
    response = requests.get(f"{API_ROOT}/api/simulation/fields", headers={"x-simulator-key": SIMULATOR_KEY}, timeout=8)
    response.raise_for_status()
    return response.json()


def send_reading(field, moisture):
    # The database stores TIMESTAMP WITHOUT TIME ZONE. Send local database time
    # without a UTC suffix so new readings sort after older records correctly.
    payload = {"sensor_id": field["sensor_id"], "field_id": field["field_id"], "soil_moisture": moisture, "timestamp": datetime.now().isoformat(timespec="milliseconds")}
    response = requests.post(f"{API_ROOT}/api/sensor/readings", json=payload, timeout=8)
    response.raise_for_status()
    return payload


def run_once():
    fields_by_id = {field["field_id"]: field for field in fetch_fields()}
    fields = list(fields_by_id.values())
    for field in fields:
        weather = weather_for(field)
        payload = send_reading(field, moisture_reading(field, weather))
        print(f"{field['name']} ({field['field_id']}): {payload['soil_moisture']}% | {weather['temperature']:.1f}C, {weather['humidity']:.0f}% humidity, {weather['rainfall']:.1f}mm rain")
    return len(fields)


if __name__ == "__main__":
    print(f"Field-aware sensor simulator started; interval={INTERVAL_SECONDS}s")
    while True:
        try:
            print(f"Generated readings for {run_once()} field(s)")
        except (requests.RequestException, KeyError, ValueError) as error:
            print(f"Sensor cycle failed: {error}")
        time.sleep(INTERVAL_SECONDS)
