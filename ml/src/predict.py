import os
import joblib
import pandas as pd

from ml.src.feature_engineering import engineer_features


# Project root
BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../..")
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "ml",
    "models",
    "irrigation_gb_model.pkl"
)

PREPROCESSOR_PATH = os.path.join(
    BASE_DIR,
    "ml",
    "models",
    "irrigation_preprocessor.pkl"
)


# Load trained model and preprocessor
model = joblib.load(MODEL_PATH)
preprocessor = joblib.load(PREPROCESSOR_PATH)


def predict_irrigation(data: dict):

    # Convert input dictionary to DataFrame
    input_df = pd.DataFrame([data])

    # Create the same engineered features used during training
    input_df = engineer_features(input_df)

    # Apply trained preprocessing
    processed_data = preprocessor.transform(input_df)

    # Predict irrigation requirement
    prediction = model.predict(processed_data)[0]

    # Prediction probabilities
    probabilities = model.predict_proba(processed_data)[0]

    # Model classes
    classes = model.classes_

    probability_dict = {
        str(cls): float(prob)
        for cls, prob in zip(classes, probabilities)
    }

    confidence = float(max(probabilities))

    return {
        "irrigation_need": str(prediction),
        "confidence": confidence,
        "probabilities": probability_dict
    }