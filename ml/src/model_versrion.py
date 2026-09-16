import joblib
import json
import os
from datetime import datetime


MODEL_PATH = "../models/irrigation_gb_model.pkl"
VERSION_PATH = "../models/model_version.json"


model = joblib.load(MODEL_PATH)

version_info = {
    "model_name": "Smart Irrigation Gradient Boosting",
    "model_version": "1.0.0",
    "model_type": "GradientBoostingClassifier",
    "n_estimators": model.n_estimators,
    "learning_rate": model.learning_rate,
    "max_depth": model.max_depth,
    "min_samples_split": model.min_samples_split,
    "test_accuracy": 0.9953333333333333,
    "test_macro_f1": 0.9804008049005866,
    "high_recall": 0.90,
    "created_at": datetime.now().isoformat()
}

with open(VERSION_PATH, "w") as file:
    json.dump(version_info, file, indent=4)

print("Model version saved successfully.")
print("Version:", version_info["model_version"])
print("Model:", version_info["model_name"])
