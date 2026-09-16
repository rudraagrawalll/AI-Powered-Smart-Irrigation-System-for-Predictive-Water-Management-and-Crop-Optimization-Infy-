import pandas as pd
import joblib
import os

from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from sklearn.ensemble import GradientBoostingClassifier

from feature_engineering import engineer_features
from preprocessing import create_preprocessor


# ==========================================
# 1. Load dataset
# ==========================================

df = pd.read_csv("../data/irrigation_prediction.csv")

print("Dataset loaded:", df.shape)


# ==========================================
# 2. Feature engineering
# ==========================================

df = engineer_features(df)

print("Feature engineering completed:", df.shape)


# ==========================================
# 3. Separate features and target
# ==========================================

X = df.drop("Irrigation_Need", axis=1)
y = df["Irrigation_Need"]


# ==========================================
# 4. Train / Validation / Test split
# ==========================================

X_train, X_temp, y_train, y_temp = train_test_split(
    X,
    y,
    test_size=0.30,
    random_state=42,
    stratify=y
)

X_val, X_test, y_val, y_test = train_test_split(
    X_temp,
    y_temp,
    test_size=0.50,
    random_state=42,
    stratify=y_temp
)

print("Training:", X_train.shape)
print("Validation:", X_val.shape)
print("Testing:", X_test.shape)


# ==========================================
# 5. Create preprocessor
# ==========================================

preprocessor = create_preprocessor()

X_train_processed = preprocessor.fit_transform(X_train)

X_val_processed = preprocessor.transform(X_val)

X_test_processed = preprocessor.transform(X_test)

print("Processed training shape:", X_train_processed.shape)


# ==========================================
# 6. Final Gradient Boosting model
# ==========================================

model = GradientBoostingClassifier(
    n_estimators=200,
    learning_rate=0.05,
    max_depth=3,
    min_samples_split=5,
    random_state=42
)

print("\nTraining Gradient Boosting model...")

model.fit(X_train_processed, y_train)

print("Training completed.")


# ==========================================
# 7. Validation evaluation
# ==========================================

y_val_pred = model.predict(X_val_processed)

print("\nVALIDATION RESULTS")
print("==================")

print(classification_report(y_val, y_val_pred))

print(
    "Validation Accuracy:",
    accuracy_score(y_val, y_val_pred)
)


# ==========================================
# 8. Final test evaluation
# ==========================================

y_test_pred = model.predict(X_test_processed)

print("\nFINAL TEST RESULTS")
print("==================")

print(classification_report(y_test, y_test_pred))

print(
    "Test Accuracy:",
    accuracy_score(y_test, y_test_pred)
)


# ==========================================
# 9. Save model and preprocessor
# ==========================================

os.makedirs("../models", exist_ok=True)

joblib.dump(
    model,
    "../models/irrigation_gb_model.pkl"
)

joblib.dump(
    preprocessor,
    "../models/irrigation_preprocessor.pkl"
)

print("\nModel saved successfully.")
print("Preprocessor saved successfully.")
