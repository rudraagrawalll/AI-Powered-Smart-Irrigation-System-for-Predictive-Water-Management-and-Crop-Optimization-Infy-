import pandas as pd

from feature_engineering import engineer_features
from preprocessing import create_preprocessor


# Load dataset
df = pd.read_csv("../data/irrigation_prediction.csv")

# Apply feature engineering
df = engineer_features(df)

# Separate features and target
X = df.drop("Irrigation_Need", axis=1)
y = df["Irrigation_Need"]

# Create preprocessor
preprocessor = create_preprocessor()

# Fit and transform
X_processed = preprocessor.fit_transform(X)

print("Preprocessing successful")
print("Original feature shape:", X.shape)
print("Processed feature shape:", X_processed.shape)
print("Target shape:", y.shape)
