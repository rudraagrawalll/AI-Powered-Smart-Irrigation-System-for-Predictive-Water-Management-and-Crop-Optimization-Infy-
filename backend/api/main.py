import sys
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import psycopg2


# ---------------------------------------------------------
# PROJECT PATHS
# ---------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[2]

ML_SRC = PROJECT_ROOT / "ml" / "src"

sys.path.insert(0, str(ML_SRC))


# ---------------------------------------------------------
# ENVIRONMENT VARIABLES
# ---------------------------------------------------------

load_dotenv(PROJECT_ROOT / "backend" / ".env")


DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "database": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD")
}


# ---------------------------------------------------------
# IMPORT PREDICTION ENGINE
# ---------------------------------------------------------

from prediction_engine import predict_irrigation


# ---------------------------------------------------------
# FASTAPI APPLICATION
# ---------------------------------------------------------

app = FastAPI(
    title="AI Smart Irrigation API",
    description="ML-powered irrigation prediction and scheduling API",
    version="1.0.0"
)


# ---------------------------------------------------------
# INPUT MODEL
# ---------------------------------------------------------

class FieldData(BaseModel):

    Soil_Type: str
    Soil_pH: float
    Organic_Carbon: float
    Electrical_Conductivity: float
    Temperature_C: float
    Humidity: float
    Rainfall_mm: float
    Sunlight_Hours: float
    Wind_Speed_kmh: float

    Crop_Type: str
    Crop_Growth_Stage: str
    Season: str
    Irrigation_Type: str
    Water_Source: str

    Field_Area_hectare: float
    Mulching_Used: str
    Previous_Irrigation_mm: float
    Region: str

    Latitude: float
    Longitude: float

    field_id: int


# ---------------------------------------------------------
# DATABASE CONNECTION
# ---------------------------------------------------------

def get_db_connection():

    try:
        return psycopg2.connect(**DB_CONFIG)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed: {str(e)}"
        )


# ---------------------------------------------------------
# GET LATEST SENSOR READING
# ---------------------------------------------------------

def get_latest_sensor_moisture(field_id: int):

    connection = get_db_connection()

    try:

        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT soil_moisture, timestamp
            FROM sensor_readings
            WHERE field_id = %s
            ORDER BY timestamp DESC
            LIMIT 1;
            """,
            (field_id,)
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


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@app.get("/")
def root():

    return {
        "message": "AI Smart Irrigation API is running",
        "status": "OK"
    }


# ---------------------------------------------------------
# DATABASE TEST
# ---------------------------------------------------------

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


# ---------------------------------------------------------
# IRRIGATION PREDICTION ENDPOINT
# ---------------------------------------------------------

@app.post("/api/predict-irrigation")
def predict(field_data: FieldData):

    try:

        data = field_data.model_dump()

        # -------------------------------------------------
        # KEEP FIELD ID FOR DATABASE
        # -------------------------------------------------

        field_id = data.pop("field_id")


        # -------------------------------------------------
        # GET LATEST SENSOR READING
        # -------------------------------------------------

        latest_sensor = get_latest_sensor_moisture(field_id)

        if latest_sensor is None:

            raise HTTPException(
                status_code=404,
                detail=f"No sensor reading found for field {field_id}"
            )


        # -------------------------------------------------
        # REPLACE MANUAL SOIL MOISTURE
        # WITH LIVE SENSOR VALUE
        # -------------------------------------------------

        data["Soil_Moisture"] = latest_sensor["soil_moisture"]


        # -------------------------------------------------
        # RUN COMPLETE ML PREDICTION PIPELINE
        # -------------------------------------------------

        prediction = predict_irrigation(data)

        schedule = prediction["schedule"]


        # -------------------------------------------------
        # STORE GENERATED IRRIGATION SCHEDULE
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
                prediction["water_quantity_litres"],
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
        # FINAL API RESPONSE
        # -------------------------------------------------

        return {

            "status": "success",

            "schedule_id": saved_schedule[0],

            "field_id": field_id,


            # -------------------------------------------------
            # SENSOR INFORMATION
            # -------------------------------------------------

            "sensor": {

                "soil_moisture":
                    latest_sensor["soil_moisture"],

                "timestamp":
                    latest_sensor["timestamp"]
            },


            # -------------------------------------------------
            # ML PREDICTION
            # -------------------------------------------------

            "irrigation_prediction": {

                "irrigation_need":
                    prediction["irrigation_need"],

                "confidence":
                    prediction["confidence"]
            },


            # -------------------------------------------------
            # WEATHER
            # -------------------------------------------------

            "weather": {

                "forecast_temperature_c":
                    prediction["forecast_temperature_c"],

                "forecast_rainfall_mm":
                    prediction["forecast_rainfall_mm"]
            },


            # -------------------------------------------------
            # WATER REQUIREMENT
            # -------------------------------------------------

            "water_requirement": {

                "water_depth_mm":
                    prediction["water_depth_mm"],

                "water_quantity_litres":
                    prediction["water_quantity_litres"]
            },


            # -------------------------------------------------
            # IRRIGATION SCHEDULE
            # -------------------------------------------------

            "schedule": schedule,


            # -------------------------------------------------
            # DATABASE
            # -------------------------------------------------

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
            detail=f"Irrigation prediction failed: {str(e)}"
        )