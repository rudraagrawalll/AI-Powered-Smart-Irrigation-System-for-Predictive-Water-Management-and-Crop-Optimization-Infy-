from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def create_preprocessor():

    numerical_features = [
        "Soil_pH",
        "Soil_Moisture",
        "Organic_Carbon",
        "Electrical_Conductivity",
        "Temperature_C",
        "Humidity",
        "Rainfall_mm",
        "Sunlight_Hours",
        "Wind_Speed_kmh",
        "Field_Area_hectare",
        "Previous_Irrigation_mm",
        "Soil_Moisture_Deficit",
        "Soil_Moisture_Stress",
        "High_Temperature",
        "Low_Humidity",
        "Rain_Observed",
        "Atmospheric_Dryness",
        "Previous_Irrigation_Available"
    ]

    categorical_features = [
        "Soil_Type",
        "Crop_Type",
        "Crop_Growth_Stage",
        "Season",
        "Irrigation_Type",
        "Water_Source",
        "Mulching_Used",
        "Region",
        "Crop_Growth_Combination"
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numerical_features),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore"),
                categorical_features
            )
        ]
    )

    return preprocessor