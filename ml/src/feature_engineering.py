def engineer_features(df):
    df = df.copy()

    df["Soil_Moisture_Deficit"] = 100 - df["Soil_Moisture"]

    df["Soil_Moisture_Stress"] = (
        df["Soil_Moisture"] < 40
    ).astype(int)

    df["High_Temperature"] = (
        df["Temperature_C"] > 30
    ).astype(int)

    df["Low_Humidity"] = (
        df["Humidity"] < 50
    ).astype(int)

    df["Rain_Observed"] = (
        df["Rainfall_mm"] > 0
    ).astype(int)

    df["Atmospheric_Dryness"] = (
        df["Temperature_C"] * (100 - df["Humidity"])
    )

    df["Previous_Irrigation_Available"] = (
        df["Previous_Irrigation_mm"] > 0
    ).astype(int)

    df["Crop_Growth_Combination"] = (
        df["Crop_Type"] + "_" + df["Crop_Growth_Stage"]
    )

    return df