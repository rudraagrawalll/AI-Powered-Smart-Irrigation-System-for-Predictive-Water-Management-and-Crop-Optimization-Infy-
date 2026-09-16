import mlflow
import mlflow.sklearn

from sklearn.metrics import accuracy_score, f1_score

from train_model import (
    model,
    y_val,
    y_val_pred,
    y_test,
    y_test_pred
)


# Set local MLflow tracking
mlflow.set_tracking_uri("sqlite:///../mlflow.db")

# Create/select experiment
mlflow.set_experiment("Smart Irrigation - Gradient Boosting")


with mlflow.start_run(run_name="Final_Gradient_Boosting"):

    # Log model parameters
    mlflow.log_param("model", "GradientBoostingClassifier")
    mlflow.log_param("n_estimators", 200)
    mlflow.log_param("learning_rate", 0.05)
    mlflow.log_param("max_depth", 3)
    mlflow.log_param("min_samples_split", 5)

    # Validation metrics
    val_accuracy = accuracy_score(y_val, y_val_pred)
    val_macro_f1 = f1_score(
        y_val,
        y_val_pred,
        average="macro"
    )

    # Test metrics
    test_accuracy = accuracy_score(y_test, y_test_pred)
    test_macro_f1 = f1_score(
        y_test,
        y_test_pred,
        average="macro"
    )

    mlflow.log_metric("validation_accuracy", val_accuracy)
    mlflow.log_metric("validation_macro_f1", val_macro_f1)

    mlflow.log_metric("test_accuracy", test_accuracy)
    mlflow.log_metric("test_macro_f1", test_macro_f1)

    # Log trained model
    mlflow.sklearn.log_model(
        model,
        name="irrigation_gradient_boosting_model"
    )

    print("MLflow experiment logged successfully.")
    print("Validation Accuracy:", val_accuracy)
    print("Validation Macro F1:", val_macro_f1)
    print("Test Accuracy:", test_accuracy)
    print("Test Macro F1:", test_macro_f1)
    print("Run ID:", mlflow.active_run().info.run_id)
