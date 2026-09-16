import os
from pathlib import Path

import joblib
import pandas as pd
import requests
from dotenv import load_dotenv

from ml.src.feature_engineering import engineer_features


# ============================================================
# PATHS AND MODEL LOADING
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = PROJECT_ROOT / "ml" / "models" / "irrigation_gb_model.pkl"
PREPROCESSOR_PATH = PROJECT_ROOT / "ml" / "models" / "irrigation_preprocessor.pkl"

model = joblib.load(MODEL_PATH)
preprocessor = joblib.load(PREPROCESSOR_PATH)


# ============================================================
# ENVIRONMENT / WEATHER API
# ============================================================

load_dotenv(PROJECT_ROOT / "backend" / ".env")

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")


def get_weather_forecast(latitude, longitude):
    """
    Get the next available weather forecast from OpenWeather.
    """

    if not OPENWEATHER_API_KEY:
        raise ValueError(
            "OPENWEATHER_API_KEY not found in backend/.env"
        )

    url = "https://api.openweathermap.org/data/2.5/forecast"

    params = {
        "lat": latitude,
        "lon": longitude,
        "appid": OPENWEATHER_API_KEY,
        "units": "metric"
    }

    response = requests.get(
        url,
        params=params,
        timeout=10
    )

    response.raise_for_status()

    data = response.json()

    forecast = data["list"][0]

    forecast_temperature = forecast["main"]["temp"]

    forecast_rainfall = forecast.get(
        "rain",
        {}
    ).get(
        "3h",
        0
    )

    return {
        "forecast_temperature_c": forecast_temperature,
        "forecast_rainfall_mm": forecast_rainfall
    }


# ============================================================
# WATER REQUIREMENT FACTORS
# ============================================================

CROP_FACTORS = {
    "Wheat": 1.00,
    "Rice": 1.40,
    "Maize": 1.10,
    "Cotton": 1.15,
    "Soybean": 1.05,
    "Sugarcane": 1.35
}


GROWTH_STAGE_FACTORS = {
    "Sowing": 0.70,
    "Vegetative": 1.00,
    "Flowering": 1.20,
    "Harvest": 0.80
}


SEASON_FACTORS = {
    "Rabi": 0.90,
    "Kharif": 1.10,
    "Zaid": 1.20
}


SOIL_FACTORS = {
    "Sandy": 1.15,
    "Silt": 1.00,
    "Loamy": 0.95,
    "Clay": 0.85
}


# ============================================================
# WATER REQUIREMENT CALCULATION
# ============================================================

def calculate_water_requirement(
    field_data,
    irrigation_need,
    forecast_rainfall_mm=0,
    forecast_temperature_c=None
):
    """
    Calculate water requirement using the ML irrigation class
    and field, crop, soil and weather characteristics.

    The ML model predicts irrigation need.
    This function calculates the corresponding water requirement.
    """

    crop_factor = CROP_FACTORS.get(
        field_data["Crop_Type"],
        1.00
    )

    growth_factor = GROWTH_STAGE_FACTORS.get(
        field_data["Crop_Growth_Stage"],
        1.00
    )

    season_factor = SEASON_FACTORS.get(
        field_data["Season"],
        1.00
    )

    soil_factor = SOIL_FACTORS.get(
        field_data["Soil_Type"],
        1.00
    )

    soil_moisture = field_data["Soil_Moisture"]
    temperature = field_data["Temperature_C"]
    humidity = field_data["Humidity"]
    rainfall = field_data["Rainfall_mm"]
    previous_irrigation = field_data["Previous_Irrigation_mm"]

    # Base irrigation depth from ML prediction
    if irrigation_need == "Low":
        base_depth = 0

    elif irrigation_need == "Medium":
        base_depth = 15

    else:
        base_depth = 25

    # Soil moisture factor
    if soil_moisture < 30:
        moisture_factor = 1.20

    elif soil_moisture < 50:
        moisture_factor = 1.00

    else:
        moisture_factor = 0.70

    # Temperature and humidity effect
    if temperature > 35:
        weather_factor = 1.20

    elif temperature > 30:
        weather_factor = 1.10

    elif temperature < 20:
        weather_factor = 0.90

    else:
        weather_factor = 1.00

    if humidity < 40:
        weather_factor *= 1.10

    elif humidity > 80:
        weather_factor *= 0.90

    # Recent rainfall
    if rainfall >= 20:
        rainfall_factor = 0.50

    elif rainfall >= 10:
        rainfall_factor = 0.70

    elif rainfall > 0:
        rainfall_factor = 0.90

    else:
        rainfall_factor = 1.00

    # Forecast rainfall
    if forecast_rainfall_mm >= 10:
        forecast_rainfall_factor = 0.50

    elif forecast_rainfall_mm >= 5:
        forecast_rainfall_factor = 0.70

    elif forecast_rainfall_mm > 0:
        forecast_rainfall_factor = 0.90

    else:
        forecast_rainfall_factor = 1.00

    # Forecast temperature
    forecast_temperature_factor = 1.00

    if forecast_temperature_c is not None:

        if forecast_temperature_c > 35:
            forecast_temperature_factor = 1.15

        elif forecast_temperature_c > 30:
            forecast_temperature_factor = 1.08

        elif forecast_temperature_c < 20:
            forecast_temperature_factor = 0.90

    # Previous irrigation
    if previous_irrigation >= 25:
        previous_water_factor = 0.70

    elif previous_irrigation > 0:
        previous_water_factor = 0.85

    else:
        previous_water_factor = 1.00

    # Mulching
    if field_data["Mulching_Used"] == "Yes":
        mulch_factor = 0.90

    else:
        mulch_factor = 1.00

    # Final water depth
    water_depth_mm = (
        base_depth
        * crop_factor
        * growth_factor
        * season_factor
        * soil_factor
        * moisture_factor
        * weather_factor
        * rainfall_factor
        * forecast_rainfall_factor
        * forecast_temperature_factor
        * previous_water_factor
        * mulch_factor
    )

    # Prevent negative values
    water_depth_mm = max(
        0,
        water_depth_mm
    )

    # Prevent excessive irrigation depth
    water_depth_mm = min(
        water_depth_mm,
        40
    )

    # 1 mm water over 1 hectare = 10,000 litres
    water_quantity_litres = (
        water_depth_mm
        * field_data["Field_Area_hectare"]
        * 10000
    )

    return {
        "water_depth_mm": round(
            water_depth_mm,
            2
        ),
        "water_quantity_litres": round(
            water_quantity_litres,
            2
        )
    }


# ============================================================
# FIELD-SPECIFIC + TIME-SLOTTED IRRIGATION SCHEDULE
# + BASIC OVER-WATERING PREVENTION
# ============================================================

def generate_irrigation_schedule(
    field_data,
    irrigation_prediction
):
    """
    Generate a field-specific, time-slotted irrigation schedule
    with basic over-watering prevention.
    """

    irrigation_need = irrigation_prediction[
        "irrigation_need"
    ]

    water_quantity_litres = irrigation_prediction[
        "water_quantity_litres"
    ]

    soil_moisture = field_data[
        "Soil_Moisture"
    ]

    rainfall_mm = field_data[
        "Rainfall_mm"
    ]

    previous_irrigation_mm = field_data[
        "Previous_Irrigation_mm"
    ]

    # --------------------------------------------------------
    # OVER-WATERING PREVENTION
    # --------------------------------------------------------

    # Soil already sufficiently wet
    if soil_moisture >= 70:

        return {
            "irrigation_required": False,
            "recommended_time": "Not required",
            "frequency": "Monitor soil moisture",
            "water_quantity_litres": 0,
            "overwatering_prevented": True,
            "reason": "Soil moisture is already high"
        }

    # Significant recent rainfall
    if rainfall_mm >= 10:

        return {
            "irrigation_required": False,
            "recommended_time": "Not required",
            "frequency": "Monitor rainfall and soil moisture",
            "water_quantity_litres": 0,
            "overwatering_prevented": True,
            "reason": "Recent rainfall is sufficient"
        }

    # Previous irrigation was substantial
    if (
        previous_irrigation_mm >= 25
        and irrigation_need != "High"
    ):

        return {
            "irrigation_required": False,
            "recommended_time": "Not required",
            "frequency": "Monitor soil moisture",
            "water_quantity_litres": 0,
            "overwatering_prevented": True,
            "reason": "Previous irrigation was substantial"
        }

    # --------------------------------------------------------
    # TIME-SLOTTED IRRIGATION
    # --------------------------------------------------------

    if irrigation_need == "High":

        schedule = {
            "irrigation_required": True,
            "recommended_time": "05:00-07:00",
            "frequency": "Immediate irrigation",
            "water_quantity_litres": water_quantity_litres,
            "overwatering_prevented": False,
            "reason": "High irrigation requirement"
        }

    elif irrigation_need == "Medium":

        schedule = {
            "irrigation_required": True,
            "recommended_time": "06:00-08:00",
            "frequency": "Within 24 hours",
            "water_quantity_litres": water_quantity_litres,
            "overwatering_prevented": False,
            "reason": "Medium irrigation requirement"
        }

    else:

        schedule = {
            "irrigation_required": False,
            "recommended_time": "Not required",
            "frequency": "Monitor soil moisture",
            "water_quantity_litres": 0,
            "overwatering_prevented": False,
            "reason": "Low irrigation requirement"
        }

    return schedule


# ============================================================
# COMPLETE IRRIGATION PREDICTION ENGINE
# ============================================================

def predict_irrigation(field_data):

    # --------------------------------------------------------
    # CREATE DATAFRAME
    # --------------------------------------------------------

    df = pd.DataFrame([
        field_data
    ])

    # --------------------------------------------------------
    # FEATURE ENGINEERING
    # --------------------------------------------------------

    df = engineer_features(df)

    # Remove target if supplied
    if "Irrigation_Need" in df.columns:

        df = df.drop(
            "Irrigation_Need",
            axis=1
        )

    # --------------------------------------------------------
    # PREPROCESSING
    # --------------------------------------------------------

    X_processed = preprocessor.transform(
        df
    )

    # --------------------------------------------------------
    # ML PREDICTION
    # --------------------------------------------------------

    prediction = model.predict(
        X_processed
    )[0]

    probabilities = model.predict_proba(
        X_processed
    )[0]

    confidence = probabilities.max()

    # --------------------------------------------------------
    # LIVE WEATHER FORECAST
    # --------------------------------------------------------

    weather_forecast = get_weather_forecast(
        field_data["Latitude"],
        field_data["Longitude"]
    )

    # --------------------------------------------------------
    # WATER REQUIREMENT
    # --------------------------------------------------------

    water_requirement = calculate_water_requirement(
        field_data,
        prediction,
        forecast_rainfall_mm=weather_forecast[
            "forecast_rainfall_mm"
        ],
        forecast_temperature_c=weather_forecast[
            "forecast_temperature_c"
        ]
    )

    # --------------------------------------------------------
    # IRRIGATION PREDICTION OBJECT
    # --------------------------------------------------------

    irrigation_prediction = {
        "irrigation_need": prediction,
        "water_quantity_litres": water_requirement[
            "water_quantity_litres"
        ]
    }

    # --------------------------------------------------------
    # FIELD-SPECIFIC SCHEDULE
    # TIME SLOT
    # OVER-WATERING PREVENTION
    # --------------------------------------------------------

    schedule = generate_irrigation_schedule(
        field_data,
        irrigation_prediction
    )

    # --------------------------------------------------------
    # FINAL RESULT
    # --------------------------------------------------------

    return {
        "irrigation_need": prediction,

        "confidence": round(
            float(confidence),
            4
        ),

        "forecast_temperature_c": round(
            weather_forecast[
                "forecast_temperature_c"
            ],
            2
        ),

        "forecast_rainfall_mm": round(
            weather_forecast[
                "forecast_rainfall_mm"
            ],
            2
        ),

        "water_depth_mm": water_requirement[
            "water_depth_mm"
        ],

        "water_quantity_litres": water_requirement[
            "water_quantity_litres"
        ],

        "schedule": schedule
    }


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    sample_field = {

        "Soil_Type": "Loamy",

        "Soil_pH": 6.5,

        "Soil_Moisture": 30,

        "Organic_Carbon": 1.8,

        "Electrical_Conductivity": 0.8,

        "Temperature_C": 34,

        "Humidity": 42,

        "Rainfall_mm": 0,

        "Sunlight_Hours": 8,

        "Wind_Speed_kmh": 12,

        "Crop_Type": "Wheat",

        "Crop_Growth_Stage": "Vegetative",

        "Season": "Rabi",

        "Irrigation_Type": "Drip",

        "Water_Source": "Groundwater",

        "Field_Area_hectare": 2.5,

        "Mulching_Used": "No",

        "Previous_Irrigation_mm": 0,

        "Region": "Central",

        # Field coordinates
        "Latitude": 22.7196,

        "Longitude": 75.8577
    }

    result = predict_irrigation(
        sample_field
    )

    print(
        "IRRIGATION PREDICTION"
    )

    print(
        "====================="
    )

    print(
        "Irrigation Need:",
        result["irrigation_need"]
    )

    print(
        "Confidence:",
        round(
            result["confidence"] * 100,
            2
        ),
        "%"
    )

    print(
        "Forecast Temperature:",
        result["forecast_temperature_c"],
        "°C"
    )

    print(
        "Forecast Rainfall:",
        result["forecast_rainfall_mm"],
        "mm"
    )

    print(
        "Water Requirement:",
        result["water_depth_mm"],
        "mm"
    )

    print(
        "Required Water:",
        result["water_quantity_litres"],
        "litres"
    )

    print(
        "\nIRRIGATION SCHEDULE"
    )

    print(
        "==================="
    )

    print(
        "Irrigation Required:",
        result["schedule"][
            "irrigation_required"
        ]
    )

    print(
        "Recommended Time:",
        result["schedule"][
            "recommended_time"
        ]
    )

    print(
        "Frequency:",
        result["schedule"][
            "frequency"
        ]
    )

    print(
        "Scheduled Water:",
        result["schedule"][
            "water_quantity_litres"
        ],
        "litres"
    )

    print(
        "Overwatering Prevented:",
        result["schedule"][
            "overwatering_prevented"
        ]
    )

    print(
        "Reason:",
        result["schedule"][
            "reason"
        ]
    )