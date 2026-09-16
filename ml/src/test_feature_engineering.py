import pandas as pd
from feature_engineering import engineer_features

df = pd.read_csv("../data/irrigation_prediction.csv")

df = engineer_features(df)

print("Feature engineering successful")
print("Dataset shape:", df.shape)
print("\nNew features:")
print(df.columns.tolist())