import sys
import os
import base64
import hashlib
import hmac
import json
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import psycopg2


# =========================================================
# PATHS
# =========================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

ML_SRC = PROJECT_ROOT / "ml" / "src"

sys.path.insert(0, str(ML_SRC))


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv(
    PROJECT_ROOT / "backend" / ".env"
)


# =========================================================
# DATABASE CONFIG
# =========================================================

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "database": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD")
}


# =========================================================
# ML ENGINE
# =========================================================

from prediction_engine import predict_irrigation


# =========================================================
# FASTAPI
# =========================================================

app = FastAPI(
    title="AI Smart Irrigation API",
    description="ML-powered irrigation prediction and scheduling API",
    version="1.0.0"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        os.getenv("FRONTEND_ORIGIN", "http://localhost:3001")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


JWT_SECRET = os.getenv("JWT_SECRET") or "local-development-only-change-this-secret"
SESSION_COOKIE = "irrigation_session"


def authenticated_farmer(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    try:
        header, payload, signature = token.split(".")
        signed = f"{header}.{payload}".encode()
        expected = hmac.new(JWT_SECRET.encode(), signed, hashlib.sha256).digest()
        actual = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        if not hmac.compare_digest(expected, actual):
            raise ValueError("Invalid token signature")
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if int(claims.get("exp", 0)) <= int(time.time()):
            raise ValueError("Expired session")
        farmer_id = int(claims["farmer_id"])
        return {"farmer_id": farmer_id}
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Your session is invalid or expired.")


# =========================================================
# REQUEST MODEL
# =========================================================

class FieldData(BaseModel):
    Soil_Type: str
    Soil_pH: float = Field(ge=0, le=14)
    Organic_Carbon: float = Field(ge=0)
    Electrical_Conductivity: float = Field(ge=0)

    Temperature_C: float = Field(ge=-50, le=70)
    Humidity: float = Field(ge=0, le=100)
    Rainfall_mm: float = Field(ge=0)
    Sunlight_Hours: float = Field(ge=0, le=24)
    Wind_Speed_kmh: float = Field(ge=0)

    Crop_Type: str
    Crop_Growth_Stage: str
    Season: str

    Irrigation_Type: str
    Water_Source: str

    Field_Area_hectare: float = Field(gt=0)

    Mulching_Used: str
    Previous_Irrigation_mm: float = Field(ge=0)

    Region: str

    Latitude: float = Field(ge=-90, le=90)
    Longitude: float = Field(ge=-180, le=180)

    field_id: int = Field(ge=1)


# =========================================================
# DATABASE CONNECTION
# =========================================================

def get_db_connection():
    try:
        return psycopg2.connect(**DB_CONFIG)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Database connection failed. Check the backend database configuration."
        )


# =========================================================
# LATEST SENSOR MOISTURE
# =========================================================

def get_latest_sensor_moisture(field_id: int, farmer_id: int):

    connection = get_db_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                soil_moisture,
                timestamp
            FROM sensor_readings sr
            JOIN fields f ON f.field_id = sr.field_id
            WHERE sr.field_id = %s AND f.farmer_id = %s
            ORDER BY sr.timestamp DESC
            LIMIT 1;
            """,
            (field_id, farmer_id)
        )

        result = cursor.fetchone()

        cursor.close()
        connection.close()

        if result is None:
            return None

        return {
            "soil_moisture": float(result[0]),
            "timestamp": result[1]
        }

    except Exception as e:

        connection.close()

        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve sensor data: {str(e)}"
        )


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():

    return {
        "message": "AI Smart Irrigation API is running",
        "status": "OK"
    }


# =========================================================
# DATABASE TEST
# =========================================================

@app.get("/db-test")
def database_test():

    connection = get_db_connection()

    try:

        cursor = connection.cursor()

        cursor.execute("SELECT 1;")

        result = cursor.fetchone()

        cursor.close()
        connection.close()

        return {
            "database": "connected",
            "result": result[0]
        }

    except Exception as e:

        connection.close()

        raise HTTPException(
            status_code=500,
            detail=f"Database test failed: {str(e)}"
        )


# =========================================================
# IRRIGATION PREDICTION
# =========================================================

@app.post("/api/predict-irrigation")
def predict(field_data: FieldData, farmer=Depends(authenticated_farmer)):

    try:

        data = field_data.model_dump()

        field_id = data.pop("field_id")
        owner_connection = get_db_connection()
        try:
            owner_cursor = owner_connection.cursor()
            owner_cursor.execute("SELECT 1 FROM fields WHERE field_id = %s AND farmer_id = %s", (field_id, farmer["farmer_id"]))
            is_owner = owner_cursor.fetchone() is not None
            owner_cursor.close()
        finally:
            owner_connection.close()
        if not is_owner:
            raise HTTPException(status_code=404, detail="Field not found.")

        # -------------------------------------------------
        # SENSOR
        # -------------------------------------------------

        latest_sensor = get_latest_sensor_moisture(
            field_id, farmer["farmer_id"]
        )

        if latest_sensor is None:

            raise HTTPException(
                status_code=404,
                detail="No sensor reading found for this field. Add a sensor reading before requesting an irrigation prediction."
            )

        # Replace supplied moisture with actual sensor value
        data["Soil_Moisture"] = (
            latest_sensor["soil_moisture"]
        )

        # -------------------------------------------------
        # ML PREDICTION
        # -------------------------------------------------

        prediction = predict_irrigation(data)

        schedule = prediction["schedule"]

        # -------------------------------------------------
        # SAVE SCHEDULE
        # -------------------------------------------------

        connection = get_db_connection()

        cursor = connection.cursor()

        insert_query = """
            INSERT INTO irrigation_schedules (
                field_id,
                irrigation_need,
                confidence,
                water_depth_mm,
                water_quantity_litres,
                irrigation_required,
                recommended_time,
                frequency,
                overwatering_prevented,
                reason
            )
            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s
            )
            RETURNING schedule_id, created_at;
        """

        cursor.execute(
            insert_query,
            (
                field_id,

                prediction["irrigation_need"],

                prediction["confidence"],

                prediction["water_depth_mm"],

                schedule.get("water_quantity_litres", prediction["water_quantity_litres"]),

                schedule["irrigation_required"],

                schedule["recommended_time"],

                schedule["frequency"],

                schedule["overwatering_prevented"],

                schedule["reason"]
            )
        )

        saved_schedule = cursor.fetchone()

        connection.commit()

        cursor.close()
        connection.close()

        # -------------------------------------------------
        # RESPONSE
        # -------------------------------------------------

        return {

            "status": "success",

            "schedule_id": saved_schedule[0],

            "field_id": field_id,

            "sensor": {

                "soil_moisture":
                    latest_sensor["soil_moisture"],

                "timestamp":
                    latest_sensor["timestamp"]
            },

            "irrigation_prediction": {

                "irrigation_need":
                    prediction["irrigation_need"],

                "confidence":
                    prediction["confidence"]
            },

            "weather": {

                "forecast_temperature_c":
                    prediction[
                        "forecast_temperature_c"
                    ],

                "forecast_rainfall_mm":
                    prediction[
                        "forecast_rainfall_mm"
                    ],
                "source": prediction.get("weather_source", "current_observation")
            },

            "water_requirement": {

                "water_depth_mm":
                    prediction[
                        "water_depth_mm"
                    ],

                "water_quantity_litres":
                    prediction[
                        "water_quantity_litres"
                    ]
            },

            "schedule": schedule,

            "database": {

                "stored": True,

                "schedule_id":
                    saved_schedule[0]
            }
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                "Irrigation prediction failed: "
                f"{str(e)}"
            )
        )