import requests
import random
import time
from datetime import datetime

API_URL = "http://localhost:3000/api/sensor/readings"

SENSOR_ID = "SENSOR_001"
FIELD_ID = 1

soil_moisture = 42.5

while True:

    # Simulate natural change in soil moisture
    change = random.uniform(-3, 3)
    soil_moisture += change

    # Keep moisture between 0 and 100
    soil_moisture = max(0, min(100, soil_moisture))

    data = {
        "sensor_id": SENSOR_ID,
        "field_id": FIELD_ID,
        "soil_moisture": round(soil_moisture, 2),
        "timestamp": datetime.now().isoformat()
    }

    try:
        response = requests.post(API_URL, json=data)

        print(
            f"Sent: {data['soil_moisture']}% | "
            f"Status: {response.status_code}"
        )

        print(response.json())

    except Exception as e:
        print("Error:", e)

    # Send a reading every 5 seconds
    time.sleep(5)
