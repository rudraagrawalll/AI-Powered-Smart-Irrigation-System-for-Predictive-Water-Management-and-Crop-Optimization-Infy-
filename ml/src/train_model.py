"""Train and evaluate the irrigation classifier without import-time side effects."""
from pathlib import Path
import joblib
import json
from datetime import datetime, timezone
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split

try:
    from .feature_engineering import engineer_features
    from .preprocessing import create_preprocessor
except ImportError:  # Supports running this file directly from ml/src.
    from feature_engineering import engineer_features
    from preprocessing import create_preprocessor

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = PROJECT_ROOT / "ml" / "data" / "irrigation_prediction.csv"
MODEL_DIR = PROJECT_ROOT / "ml" / "models"


def train_and_evaluate():
    df = pd.read_csv(DATA_PATH)
    df = engineer_features(df)
    X = df.drop(columns=["Irrigation_Need"])
    y = df["Irrigation_Need"]

    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.30, random_state=42, stratify=y
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp
    )

    preprocessor = create_preprocessor()
    X_train_processed = preprocessor.fit_transform(X_train)
    X_val_processed = preprocessor.transform(X_val)
    X_test_processed = preprocessor.transform(X_test)

    model = GradientBoostingClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=3,
        min_samples_split=5,
        random_state=42,
    )
    model.fit(X_train_processed, y_train)
    y_val_pred = model.predict(X_val_processed)
    y_test_pred = model.predict(X_test_processed)

    print("VALIDATION RESULTS")
    print(classification_report(y_val, y_val_pred, zero_division=0))
    print("Validation accuracy:", accuracy_score(y_val, y_val_pred))
    print("FINAL TEST RESULTS")
    print(classification_report(y_test, y_test_pred, zero_division=0))
    print("Test accuracy:", accuracy_score(y_test, y_test_pred))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_DIR / "irrigation_gb_model.pkl")
    joblib.dump(preprocessor, MODEL_DIR / "irrigation_preprocessor.pkl")
    metrics = {
        "validation_accuracy": accuracy_score(y_val, y_val_pred),
        "validation_macro_f1": f1_score(y_val, y_val_pred, average="macro", zero_division=0),
        "test_accuracy": accuracy_score(y_test, y_test_pred),
        "test_macro_f1": f1_score(y_test, y_test_pred, average="macro", zero_division=0),
    }
    version_info = {
        "model_name": "Smart Irrigation Gradient Boosting",
        "model_version": "1.0.0",
        "model_type": "GradientBoostingClassifier",
        "n_estimators": model.n_estimators,
        "learning_rate": model.learning_rate,
        "max_depth": model.max_depth,
        "min_samples_split": model.min_samples_split,
        **metrics,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    (MODEL_DIR / "model_version.json").write_text(json.dumps(version_info, indent=2), encoding="utf-8")

    return {
        "model": model,
        "preprocessor": preprocessor,
        "y_val": y_val,
        "y_val_pred": y_val_pred,
        "y_test": y_test,
        "y_test_pred": y_test_pred,
        **metrics,
    }


if __name__ == "__main__":
    train_and_evaluate()
