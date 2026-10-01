"""Run model training and log its metrics/model to the local MLflow store."""
from pathlib import Path
import mlflow
import mlflow.sklearn

try:
    from .train_model import PROJECT_ROOT, train_and_evaluate
except ImportError:  # Supports running this file directly from ml/src.
    from train_model import PROJECT_ROOT, train_and_evaluate


def train_and_log():
    result = train_and_evaluate()
    mlflow.set_tracking_uri(f"sqlite:///{PROJECT_ROOT / 'ml' / 'mlflow.db'}")
    mlflow.set_experiment("Smart Irrigation - Gradient Boosting")
    with mlflow.start_run(run_name="Gradient_Boosting"):
        model = result["model"]
        mlflow.log_params({
            "model": "GradientBoostingClassifier",
            "n_estimators": model.n_estimators,
            "learning_rate": model.learning_rate,
            "max_depth": model.max_depth,
            "min_samples_split": model.min_samples_split,
        })
        mlflow.log_metrics({
            "validation_accuracy": result["validation_accuracy"],
            "validation_macro_f1": result["validation_macro_f1"],
            "test_accuracy": result["test_accuracy"],
            "test_macro_f1": result["test_macro_f1"],
        })
        mlflow.sklearn.log_model(model, name="irrigation_gradient_boosting_model")
        print("MLflow run:", mlflow.active_run().info.run_id)


if __name__ == "__main__":
    train_and_log()
