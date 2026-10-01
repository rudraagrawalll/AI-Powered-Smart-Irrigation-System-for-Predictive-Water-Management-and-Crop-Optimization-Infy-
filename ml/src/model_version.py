"""Display metadata produced by train_model.train_and_evaluate()."""
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
VERSION_PATH = PROJECT_ROOT / "ml" / "models" / "model_version.json"


def show_model_version():
    if not VERSION_PATH.exists():
        raise FileNotFoundError("Train the model before reading model metadata.")
    version_info = json.loads(VERSION_PATH.read_text(encoding="utf-8"))
    print("Model version:", version_info.get("model_version", "unknown"))
    print("Model:", version_info.get("model_name", "unknown"))
    print("Test accuracy:", version_info.get("test_accuracy", "not recorded"))
    return version_info


if __name__ == "__main__":
    show_model_version()
