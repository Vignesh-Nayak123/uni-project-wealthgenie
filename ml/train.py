
from pathlib import Path

import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "processed" / "findex_resilience.csv"

FEATURES = [
    "age", "educ", "inc_q", "emp_in",
    "urbanicity", "saved", "borrowed"
]
TARGET = "fin24a"

df = pd.read_csv(DATA)
X = df[FEATURES]
y = df[TARGET].astype(int)

# Hold out test data before fitting any preprocessing.
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y,
)

numeric_features = ["age"]
categorical_features = [
    "educ", "inc_q", "emp_in", "urbanicity", "saved", "borrowed"
]

numeric_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
])

categorical_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("onehot", OneHotEncoder(handle_unknown="ignore")),
])

preprocessor = ColumnTransformer([
    ("numeric", numeric_pipeline, numeric_features),
    ("categorical", categorical_pipeline, categorical_features),
])

models = {
    "Majority baseline": DummyClassifier(strategy="most_frequent"),
    "Logistic Regression": LogisticRegression(
        max_iter=2000, class_weight="balanced"
    ),
    "Random Forest": RandomForestClassifier(
        n_estimators=300,
        class_weight="balanced",
        random_state=42,
    ),
}

for name, model in models.items():
    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("model", model),
    ])

    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)

    print("\n" + "=" * 60)
    print(name)
    print("=" * 60)
    print("Accuracy:", round(accuracy_score(y_test, predictions), 4))
    print(
        "Balanced accuracy:",
        round(balanced_accuracy_score(y_test, predictions), 4),
    )
    print(
        "Macro-F1:",
        round(f1_score(y_test, predictions, average="macro"), 4),
    )
    print("\nClassification report:")
    print(classification_report(y_test, predictions, zero_division=0))
    print("Confusion matrix:")
    print(confusion_matrix(y_test, predictions, labels=[1, 2, 3]))
