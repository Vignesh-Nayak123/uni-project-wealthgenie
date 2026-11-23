"""
WealthGenie - reproducible evaluation (results section of the research report).

Regenerates everything in evaluation/results/ and evaluation/RESULTS.md:

  Component 1  Findex emergency-money classifier (the only learned model;
               an isolated research experiment that the app does not use).
  Component 2  Fund recommendation engine (rule-based): label-free checks.
  Component 3  Money Check-up / What-if Planner: `npm run experiment`.
  Component 5  Paper trading + historical simulation: correctness checks
               against independently computed reference values.

Usage (from the repository root):
    .venv/Scripts/python.exe evaluation/evaluate.py          # everything
    .venv/Scripts/python.exe evaluation/evaluate.py --fast   # reuse archived
        outputs of the two slow Node harnesses (npm experiment + the
        recommender report script, which also runs the full test suite)

Requirements: see evaluation/requirements.txt (Python) and Node >= 20 with
backend dependencies installed (`npm --prefix backend install`).
Seed: 42 everywhere (split, CV, bootstrap, models, permutation importance).
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import warnings
from datetime import date, datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import scipy
import seaborn as sns
import sklearn
import statsmodels
from matplotlib.colors import LinearSegmentedColormap
from scipy.optimize import brentq
from scipy.stats import spearmanr
from sklearn.calibration import calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    log_loss,
    matthews_corrcoef,
    precision_recall_curve,
    precision_recall_fscore_support,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler, label_binarize
from statsmodels.stats.contingency_tables import mcnemar

warnings.filterwarnings("ignore", category=FutureWarning)

SEED = 42
ROOT = Path(__file__).resolve().parent.parent
EVAL = ROOT / "evaluation"
OUT = EVAL / "results"
RAW = ROOT / "data" / "Findex_Microdata_2025_updateIndia.csv"
PROCESSED = ROOT / "data" / "processed" / "findex_resilience.csv"
PY = sys.executable

FEATURES = ["age", "educ", "inc_q", "emp_in", "urbanicity", "saved", "borrowed"]
NUMERIC = ["age"]
CATEGORICAL = ["educ", "inc_q", "emp_in", "urbanicity", "saved", "borrowed"]
TARGET = "fin24a"
CLASSES = [1, 2, 3]
N_BOOT = 1000

# Palette (validated reference palette, light mode) - print-friendly figures.
BLUE, ORANGE, AQUA, YELLOW = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
CLASS_COLORS = {1: BLUE, 2: ORANGE, 3: AQUA}
SEQ = LinearSegmentedColormap.from_list("wg_blues", ["#ffffff", "#cde2fb", "#6da7ec", "#2a78d6", "#184f95", "#0d366b"])

MODEL_LABELS = {
    "dummy_majority": "Majority class (dummy)",
    "dummy_stratified": "Stratified random (dummy)",
    "logreg": "Logistic regression",
    "logreg_balanced": "Logistic regression (class-weighted)",
    "random_forest": "Random forest (class-weighted)",
    "hist_gb": "Histogram gradient boosting",
}


def style():
    sns.set_theme(style="white")
    plt.rcParams.update({
        "figure.dpi": 100, "savefig.dpi": 300, "savefig.bbox": "tight",
        "font.size": 10, "axes.titlesize": 11, "axes.labelsize": 10,
        "axes.edgecolor": INK2, "axes.labelcolor": INK, "text.color": INK,
        "xtick.color": INK2, "ytick.color": INK2, "axes.grid": True,
        "grid.color": GRID, "grid.linewidth": 0.6, "axes.spines.top": False,
        "axes.spines.right": False, "legend.frameon": False,
        "figure.facecolor": "white", "axes.facecolor": "white",
    })


# ════════════════════════════════════════════════════════════════════════════
# Component 1 - data
# ════════════════════════════════════════════════════════════════════════════
def load_findex():
    """Rebuild the processed dataset exactly as ml/prepare_dataset.py does,
    keeping the survey weight, and verify it equals the committed CSV."""
    raw = pd.read_csv(RAW, low_memory=False)
    target_counts_raw = raw[TARGET].value_counts(dropna=False).sort_index()
    clean = raw.loc[raw[TARGET].isin(CLASSES), FEATURES + [TARGET, "wgt"]].copy()
    clean = clean.dropna(subset=FEATURES + [TARGET])
    for c in FEATURES + [TARGET]:
        clean[c] = clean[c].astype(int)
    clean = clean.reset_index(drop=True)
    proc = pd.read_csv(PROCESSED)
    matches = proc.shape[0] == clean.shape[0] and bool(
        (proc[FEATURES + [TARGET]].to_numpy() == clean[FEATURES + [TARGET]].to_numpy()).all())
    if not matches:
        raise SystemExit("Rebuilt dataset does not match data/processed/findex_resilience.csv")
    info = {
        "raw_rows": int(raw.shape[0]),
        "raw_columns": int(raw.shape[1]),
        "raw_target_counts": {("missing" if pd.isna(k) else str(int(k))): int(v) for k, v in target_counts_raw.items()},
        "rows_retained": int(clean.shape[0]),
        "rows_excluded": int(raw.shape[0] - clean.shape[0]),
        "rebuilt_equals_processed_csv": matches,
        "missing_weights": int(clean["wgt"].isna().sum()),
    }
    return clean, info


def make_pipeline(estimator, features=FEATURES):
    num = [f for f in NUMERIC if f in features]
    cat = [f for f in CATEGORICAL if f in features]
    transformers = []
    if num:
        transformers.append(("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), num))
    if cat:
        transformers.append(("categorical", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")),
                                                       ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cat))
    return Pipeline([("preprocessor", ColumnTransformer(transformers)), ("model", estimator)])


def make_models():
    """Hyperparameters fixed in advance (train.py settings / library defaults);
    nothing is tuned on any test data."""
    return {
        "dummy_majority": DummyClassifier(strategy="most_frequent"),
        "dummy_stratified": DummyClassifier(strategy="stratified", random_state=SEED),
        "logreg": LogisticRegression(max_iter=2000),
        "logreg_balanced": LogisticRegression(max_iter=2000, class_weight="balanced"),
        "random_forest": RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=SEED, n_jobs=1),
        "hist_gb": HistGradientBoostingClassifier(random_state=SEED),
    }


# ════════════════════════════════════════════════════════════════════════════
# Component 1 - metrics
# ════════════════════════════════════════════════════════════════════════════
def ece_top_label(y, proba, n_bins=10):
    conf = proba.max(axis=1)
    pred = np.array(CLASSES)[proba.argmax(axis=1)]
    correct = (pred == y).astype(float)
    edges = np.linspace(0, 1, n_bins + 1)
    ece, rows = 0.0, []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi) if lo > 0 else (conf >= lo) & (conf <= hi)
        if m.sum() == 0:
            continue
        gap = abs(correct[m].mean() - conf[m].mean())
        ece += m.mean() * gap
        rows.append({"bin_low": lo, "bin_high": hi, "n": int(m.sum()), "mean_confidence": float(conf[m].mean()),
                     "accuracy": float(correct[m].mean()), "abs_gap": float(gap)})
    return float(ece), rows


def none_if_nan(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else float(x)


def full_metrics(y, pred, proba, w=None):
    y = np.asarray(y)
    pred = np.asarray(pred)
    p, r, f, s = precision_recall_fscore_support(y, pred, labels=CLASSES, zero_division=0)
    Y = label_binarize(y, classes=CLASSES)
    rho = spearmanr(y, pred).statistic if len(np.unique(pred)) > 1 else float("nan")
    ece, _ = ece_top_label(y, proba)
    m = {
        "accuracy": accuracy_score(y, pred),
        "balanced_accuracy": balanced_accuracy_score(y, pred),
        "precision_macro": precision_recall_fscore_support(y, pred, average="macro", zero_division=0)[0],
        "recall_macro": precision_recall_fscore_support(y, pred, average="macro", zero_division=0)[1],
        "f1_macro": f1_score(y, pred, average="macro", zero_division=0),
        "precision_weighted": precision_recall_fscore_support(y, pred, average="weighted", zero_division=0)[0],
        "recall_weighted": precision_recall_fscore_support(y, pred, average="weighted", zero_division=0)[1],
        "f1_weighted": f1_score(y, pred, average="weighted", zero_division=0),
        "mcc": matthews_corrcoef(y, pred),
        "cohen_kappa": cohen_kappa_score(y, pred),
        "quadratic_weighted_kappa": cohen_kappa_score(y, pred, weights="quadratic"),
        "mae_class_index": float(np.mean(np.abs(y - pred))),
        "spearman_rho": rho,
        "roc_auc_ovr_macro": roc_auc_score(y, proba, multi_class="ovr", average="macro", labels=CLASSES),
        "pr_auc_macro": average_precision_score(Y, proba, average="macro"),
        "brier_multiclass": float(np.mean(np.sum((proba - Y) ** 2, axis=1))),
        "log_loss": log_loss(y, proba, labels=CLASSES),
        "ece_top_label_10bin": ece,
    }
    m = {k: none_if_nan(float(v)) for k, v in m.items()}
    m["per_class"] = {str(c): {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
                      for i, c in enumerate(CLASSES)}
    if w is not None:
        m["survey_weighted"] = {
            "accuracy": float(accuracy_score(y, pred, sample_weight=w)),
            "balanced_accuracy": float(balanced_accuracy_score(y, pred, sample_weight=w)),
            "f1_macro": float(f1_score(y, pred, average="macro", sample_weight=w, zero_division=0)),
            "f1_weighted": float(f1_score(y, pred, average="weighted", sample_weight=w, zero_division=0)),
            "mcc": float(matthews_corrcoef(y, pred, sample_weight=w)),
        }
    return m


def cm_metrics(cm):
    """Headline metrics from a 3x3 confusion matrix (fast path for bootstrap).
    Cross-checked against scikit-learn on the full test set."""
    cm = cm.astype(float)
    n = cm.sum()
    tp = np.diag(cm)
    row, col = cm.sum(1), cm.sum(0)
    acc = tp.sum() / n
    with np.errstate(divide="ignore", invalid="ignore"):
        rec = np.where(row > 0, tp / row, 0.0)
        prec = np.where(col > 0, tp / col, 0.0)
        f1 = np.where(prec + rec > 0, 2 * prec * rec / (prec + rec), 0.0)
    present = row > 0
    bal = rec[present].mean()
    cov_ytyp = tp.sum() * n - (row * col).sum()
    cov_ypyp = n * n - (col * col).sum()
    cov_ytyt = n * n - (row * row).sum()
    denom = np.sqrt(cov_ytyt * cov_ypyp)
    mcc = cov_ytyp / denom if denom > 0 else 0.0
    k = cm.shape[0]
    W = np.array([[(i - j) ** 2 for j in range(k)] for i in range(k)], dtype=float) / (k - 1) ** 2
    E = np.outer(row, col) / n
    qwk = 1 - (W * cm).sum() / (W * E).sum() if (W * E).sum() > 0 else 0.0
    # sklearn's macro-F1 averages over labels present in y_true or y_pred
    labels_present = (row > 0) | (col > 0)
    return {"accuracy": acc, "balanced_accuracy": bal, "f1_macro": f1[labels_present].mean(), "mcc": mcc,
            "quadratic_weighted_kappa": qwk}


def cm_of(y, pred):
    yi = np.searchsorted(CLASSES, y)
    pi = np.searchsorted(CLASSES, pred)
    return np.bincount(yi * 3 + pi, minlength=9).reshape(3, 3)


HEADLINE = ["f1_macro", "balanced_accuracy", "mcc", "accuracy", "quadratic_weighted_kappa"]


def cv_scores(model_name, X, y, splitter, groups=None):
    rows = []
    split_iter = splitter.split(X, y, groups) if groups is not None else splitter.split(X, y)
    for fold, (tr, va) in enumerate(split_iter):
        pipe = make_pipeline(make_models()[model_name]).fit(X.iloc[tr], y.iloc[tr])
        pred = pipe.predict(X.iloc[va])
        yv = y.iloc[va].to_numpy()
        rows.append({"fold": fold, "f1_macro": f1_score(yv, pred, average="macro", zero_division=0),
                     "balanced_accuracy": balanced_accuracy_score(yv, pred), "mcc": matthews_corrcoef(yv, pred),
                     "accuracy": accuracy_score(yv, pred),
                     "quadratic_weighted_kappa": cohen_kappa_score(yv, pred, weights="quadratic")})
    return rows


def summarize_cv(rows):
    df = pd.DataFrame(rows)
    return {m: {"mean": float(df[m].mean()), "std": float(df[m].std(ddof=1))} for m in HEADLINE}


# ════════════════════════════════════════════════════════════════════════════
# Component 1 - main evaluation
# ════════════════════════════════════════════════════════════════════════════
def evaluate_classifier():
    t_start = time.time()
    data, data_info = load_findex()
    X, y, w = data[FEATURES], data[TARGET], data["wgt"]
    res = {"data": data_info}

    # ── integrity ─────────────────────────────────────────────────────────
    counts = y.value_counts().sort_index()
    res["data"]["class_distribution"] = {str(k): {"n": int(v), "pct": float(v / len(y))} for k, v in counts.items()}
    res["data"]["imbalance_ratio_majority_to_minority"] = float(counts.max() / counts.min())
    ct = pd.crosstab(data["inc_q"], data[TARGET], normalize="index")
    res["data"]["class_share_by_income_quintile"] = {str(q): {str(c): float(ct.loc[q, c]) for c in CLASSES} for q in ct.index}
    ct_s = pd.crosstab(data["saved"], data[TARGET], normalize="index")
    res["data"]["class_share_by_saved"] = {str(q): {str(c): float(ct_s.loc[q, c]) for c in CLASSES} for q in ct_s.index}
    res["data"]["target_wording"] = {
        "found_in_repo": False,
        "repo_description": "ml/README.md: 'reported difficulty obtaining emergency money (fin24a)', 'a 3-point ordinal survey response'",
        "status": "exact category wording to be verified against the Findex 2025 codebook",
    }
    group_id = data.groupby(FEATURES, sort=True).ngroup()
    labels_per_group = data.groupby(FEATURES)[TARGET].nunique()
    group_sizes = data.groupby(FEATURES).size()
    conflicting = labels_per_group[labels_per_group > 1]
    res["data"]["duplicates"] = {
        "exact_duplicate_rows_features_and_target": int(data[FEATURES + [TARGET]].duplicated().sum()),
        "unique_feature_vectors": int(group_sizes.shape[0]),
        "feature_vectors_with_conflicting_labels": int(conflicting.shape[0]),
        "rows_in_conflicting_feature_vectors": int(group_sizes.loc[conflicting.index].sum()),
    }
    # Bayes-style accuracy ceiling: predicting the majority label within each
    # identical feature vector is the best any function of these 7 features
    # can do on this sample (in-sample, so optimistic).
    def ceiling(df):
        return float(df.groupby(FEATURES)[TARGET].agg(lambda s: s.value_counts().max()).sum() / len(df))

    X_tr, X_te, y_tr, y_te, w_tr, w_te = train_test_split(X, y, w, test_size=0.20, random_state=SEED, stratify=y)
    train_keys = set(map(tuple, X_tr.to_numpy()))
    overlap = np.array([tuple(r) in train_keys for r in X_te.to_numpy()])
    res["split"] = {
        "method": "stratified train_test_split, test_size=0.20, random_state=42 (identical to ml/train.py)",
        "train_n": int(len(y_tr)), "test_n": int(len(y_te)),
        "train_class_counts": {str(k): int(v) for k, v in y_tr.value_counts().sort_index().items()},
        "test_class_counts": {str(k): int(v) for k, v in y_te.value_counts().sort_index().items()},
        "test_rows_with_feature_vector_seen_in_train": int(overlap.sum()),
        "test_rows_with_feature_vector_seen_in_train_pct": float(overlap.mean()),
        "exact_row_duplicates_across_split": int(pd.concat([X_te.assign(y=y_te)]).merge(
            X_tr.assign(y=y_tr).drop_duplicates(), how="inner", on=FEATURES + ["y"]).shape[0]),
    }
    test_df = X_te.assign(**{TARGET: y_te})
    sizes = data.groupby(FEATURES)[TARGET].transform("size")
    repeated = data[sizes >= 2]
    res["accuracy_ceiling"] = {
        "full_dataset_in_sample": ceiling(data),
        "test_set_in_sample": ceiling(test_df),
        "rows_in_singleton_feature_vectors": int((sizes == 1).sum()),
        "rows_in_repeated_feature_vectors": int(len(repeated)),
        "repeated_vectors_only_in_sample": ceiling(repeated),
        "majority_class_rate_on_repeated_rows": float(repeated[TARGET].value_counts(normalize=True).max()),
        "note": "Max accuracy achievable by any classifier that maps identical feature vectors to one label, "
                "computed by predicting the within-vector majority label (in-sample, optimistic upper bound).",
    }
    res["leakage_checks"] = {
        "fin24_excluded": "fin24 (source of emergency money) is not a feature; fin24a is only defined for respondents who answered fin24.",
        "target_derived_features": "none of the 7 features is derived from fin24/fin24a",
        "temporal": "single cross-sectional survey wave (2025); no time ordering, so a random stratified split is appropriate",
        "preprocessing_fit_on_train_only": True,
    }

    # ── CV on the training portion (model selection uses only this) ──────
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    cv_train_rows, cv_train = [], {}
    for name in make_models():
        rows = cv_scores(name, X_tr, y_tr, skf)
        cv_train[name] = summarize_cv(rows)
        cv_train_rows += [{"model": name, **r} for r in rows]
    res["cv_train_5fold"] = cv_train
    pd.DataFrame(cv_train_rows).to_csv(OUT / "c1_cv_train_folds.csv", index=False)
    candidates = [m for m in make_models() if not m.startswith("dummy")]
    best = max(candidates, key=lambda m: cv_train[m]["f1_macro"]["mean"])
    res["best_model"] = {"name": best, "label": MODEL_LABELS[best],
                         "selection_rule": "highest mean 5-fold stratified CV macro-F1 on the training portion (test set not used)"}

    # ── CV sensitivity on the full dataset: standard vs grouped ──────────
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    sens = {}
    sens_rows = []
    for name in make_models():
        std_rows = cv_scores(name, X, y, skf)
        grp_rows = cv_scores(name, X, y, sgkf, groups=group_id)
        sens[name] = {"stratified_5fold": summarize_cv(std_rows), "grouped_5fold": summarize_cv(grp_rows)}
        sens_rows += [{"model": name, "scheme": "stratified", **r} for r in std_rows]
        sens_rows += [{"model": name, "scheme": "grouped_by_feature_vector", **r} for r in grp_rows]
    res["cv_full_sensitivity"] = sens
    pd.DataFrame(sens_rows).to_csv(OUT / "c1_cv_full_sensitivity_folds.csv", index=False)

    # ── held-out test evaluation ─────────────────────────────────────────
    fitted, preds, probas, test_metrics = {}, {}, {}, {}
    for name, est in make_models().items():
        pipe = make_pipeline(est).fit(X_tr, y_tr)
        fitted[name] = pipe
        preds[name] = pipe.predict(X_te)
        probas[name] = pipe.predict_proba(X_te)
        assert list(pipe.classes_) == CLASSES
        test_metrics[name] = full_metrics(y_te.to_numpy(), preds[name], probas[name], w_te.to_numpy())
    res["test"] = test_metrics

    # like-for-like ceiling comparison on test rows whose profile repeats
    rep_mask = (sizes.loc[X_te.index] >= 2).to_numpy()
    maj_label = data.groupby(FEATURES)[TARGET].agg(lambda s: s.value_counts().idxmax())
    te_keys = pd.MultiIndex.from_frame(X_te[FEATURES])
    ceiling_pred = maj_label.reindex(te_keys).to_numpy()
    res["accuracy_ceiling"]["test_rows_in_repeated_vectors"] = int(rep_mask.sum())
    res["accuracy_ceiling"]["ceiling_on_those_test_rows_full_data_majority"] = float(np.mean(ceiling_pred[rep_mask] == y_te.to_numpy()[rep_mask]))
    res["accuracy_ceiling"]["model_accuracy_on_those_test_rows"] = {
        n_: float(np.mean(preds[n_][rep_mask] == y_te.to_numpy()[rep_mask])) for n_ in preds}

    # cross-check fast confusion-matrix metrics against sklearn
    for name in test_metrics:
        fast = cm_metrics(cm_of(y_te.to_numpy(), preds[name]))
        for k in HEADLINE:
            assert abs(fast[k] - test_metrics[name][k]) < 1e-9, (name, k, fast[k], test_metrics[name][k])

    # ── bootstrap CIs (1000 resamples of the test set, seed 42) ──────────
    rng = np.random.default_rng(SEED)
    yt = y_te.to_numpy()
    n = len(yt)
    idx = rng.integers(0, n, size=(N_BOOT, n))
    boot = {name: {k: np.empty(N_BOOT) for k in HEADLINE} for name in preds}
    for b in range(N_BOOT):
        ii = idx[b]
        for name, pr in preds.items():
            mm = cm_metrics(cm_of(yt[ii], pr[ii]))
            for k in HEADLINE:
                boot[name][k][b] = mm[k]
    ci = {name: {k: {"point": test_metrics[name][k], "ci95_low": float(np.percentile(v, 2.5)),
                     "ci95_high": float(np.percentile(v, 97.5))} for k, v in d.items()} for name, d in boot.items()}
    res["bootstrap_ci95"] = ci
    diffs = {}
    for other in preds:
        if other == best:
            continue
        diffs[other] = {}
        for k in ["f1_macro", "balanced_accuracy", "mcc"]:
            dv = boot[best][k] - boot[other][k]
            diffs[other][k] = {"point": test_metrics[best][k] - test_metrics[other][k], "ci95_low": float(np.percentile(dv, 2.5)),
                               "ci95_high": float(np.percentile(dv, 97.5)), "share_resamples_best_not_better": float(np.mean(dv <= 0))}
    res["paired_bootstrap_best_minus_other"] = diffs

    # ── McNemar ──────────────────────────────────────────────────────────
    mc = {}
    comparisons = ["dummy_majority", "logreg", "logreg_balanced"]
    for other in comparisons:
        if other == best:
            continue
        cb, co = preds[best] == yt, preds[other] == yt
        table = np.array([[np.sum(cb & co), np.sum(cb & ~co)], [np.sum(~cb & co), np.sum(~cb & ~co)]])
        b_, c_ = int(table[0, 1]), int(table[1, 0])
        exact = (b_ + c_) < 25
        r = mcnemar(table, exact=exact, correction=True)
        mc[other] = {"both_correct": int(table[0, 0]), "best_only_correct": b_, "other_only_correct": c_,
                     "both_wrong": int(table[1, 1]), "test": "exact binomial" if exact else "chi-square with continuity correction",
                     "statistic": float(r.statistic), "p_value": float(r.pvalue)}
    res["mcnemar_best_vs"] = mc

    # ── calibration bins / curves for best ───────────────────────────────
    _, ece_rows = ece_top_label(yt, probas[best])
    pd.DataFrame(ece_rows).to_csv(OUT / "c1_calibration_bins_best.csv", index=False)

    # ── permutation importance (test set, best model) ────────────────────
    pi = permutation_importance(fitted[best], X_te, y_te, scoring="f1_macro", n_repeats=30, random_state=SEED, n_jobs=1)
    pi_df = pd.DataFrame({"feature": FEATURES, "importance_mean": pi.importances_mean, "importance_std": pi.importances_std}) \
        .sort_values("importance_mean", ascending=False)
    pi_df.to_csv(OUT / "c1_permutation_importance.csv", index=False)
    res["permutation_importance_f1_macro"] = pi_df.to_dict(orient="records")

    # ── ablation: refit best model without features / groups ────────────
    abl_sets = {f"drop {f}": [x for x in FEATURES if x != f] for f in FEATURES}
    abl_sets["drop saved + borrowed (financial behaviour)"] = [x for x in FEATURES if x not in ("saved", "borrowed")]
    abl_sets["drop age + educ + emp_in + urbanicity (demographics)"] = ["inc_q", "saved", "borrowed"]
    abl_sets["only inc_q"] = ["inc_q"]
    abl_rows = []
    full_ref = test_metrics[best]
    for label, feats in abl_sets.items():
        pipe = make_pipeline(make_models()[best], feats).fit(X_tr[feats], y_tr)
        pr = pipe.predict(X_te[feats])
        row = {"ablation": label, "features": ",".join(feats),
               "f1_macro": f1_score(yt, pr, average="macro", zero_division=0),
               "balanced_accuracy": balanced_accuracy_score(yt, pr), "mcc": matthews_corrcoef(yt, pr)}
        for k in ["f1_macro", "balanced_accuracy", "mcc"]:
            row[f"delta_{k}"] = row[k] - full_ref[k]
        abl_rows.append(row)
    abl_df = pd.DataFrame(abl_rows)
    abl_df.to_csv(OUT / "c1_ablation.csv", index=False)
    res["ablation"] = abl_rows

    # ── de-duplicated sensitivity ────────────────────────────────────────
    dd = data.drop_duplicates(subset=FEATURES + [TARGET]).reset_index(drop=True)
    Xd, yd = dd[FEATURES], dd[TARGET]
    Xd_tr, Xd_te, yd_tr, yd_te = train_test_split(Xd, yd, test_size=0.20, random_state=SEED, stratify=yd)
    keys_d = set(map(tuple, Xd_tr.to_numpy()))
    ov_d = np.array([tuple(r) in keys_d for r in Xd_te.to_numpy()])
    dedup = {"rows": int(len(dd)), "train_n": int(len(yd_tr)), "test_n": int(len(yd_te)),
             "class_counts": {str(k): int(v) for k, v in yd.value_counts().sort_index().items()},
             "test_rows_with_feature_vector_seen_in_train": int(ov_d.sum()),
             "note": "Exact duplicate rows (features AND target) removed, keeping the first; feature vectors with conflicting labels remain.",
             "models": {}}
    dd_rows = []
    for name, est in make_models().items():
        pipe = make_pipeline(est).fit(Xd_tr, yd_tr)
        pr = pipe.predict(Xd_te)
        m = {"f1_macro": f1_score(yd_te, pr, average="macro", zero_division=0),
             "balanced_accuracy": balanced_accuracy_score(yd_te, pr), "mcc": matthews_corrcoef(yd_te, pr),
             "accuracy": accuracy_score(yd_te, pr)}
        m.update({f"delta_{k}": m[k] - test_metrics[name][k] for k in list(m)})
        dedup["models"][name] = {k: float(v) for k, v in m.items()}
        dd_rows.append({"model": name, **dedup["models"][name]})
    res["dedup_sensitivity"] = dedup
    pd.DataFrame(dd_rows).to_csv(OUT / "c1_dedup_sensitivity.csv", index=False)

    # ── segment analysis (best model, test set) ──────────────────────────
    seg = X_te.copy()
    seg["y"], seg["pred"] = yt, preds[best]
    seg["age_band"] = pd.cut(seg["age"], [14, 24, 34, 44, 54, 64, 120], labels=["15-24", "25-34", "35-44", "45-54", "55-64", "65+"])
    seg_rows = []
    for col in ["inc_q", "age_band", "educ", "urbanicity", "emp_in", "saved", "borrowed"]:
        for val, g in seg.groupby(col, observed=True):
            seg_rows.append({"segment": col, "value": str(val), "n": int(len(g)),
                             "n_class1": int((g.y == 1).sum()), "n_class2": int((g.y == 2).sum()), "n_class3": int((g.y == 3).sum()),
                             "accuracy": accuracy_score(g.y, g.pred), "balanced_accuracy": balanced_accuracy_score(g.y, g.pred),
                             "f1_macro": f1_score(g.y, g.pred, average="macro", labels=CLASSES, zero_division=0),
                             "low_n_flag": bool(len(g) < 30)})
    seg_df = pd.DataFrame(seg_rows)
    seg_df.to_csv(OUT / "c1_segment_metrics.csv", index=False)
    res["segments"] = seg_rows

    # ── error analysis: 10 representative misclassifications ─────────────
    tr_df = X_tr.assign(y=y_tr.to_numpy())
    tr_lookup = tr_df.groupby(FEATURES)["y"].apply(lambda s: s.value_counts().to_dict()).to_dict()
    err = seg[seg.y != seg.pred].copy()
    pb = probas[best][(seg.y != seg.pred).to_numpy()]
    err["confidence"] = pb.max(axis=1)
    err["p_true_class"] = pb[np.arange(len(err)), np.searchsorted(CLASSES, err.y.to_numpy())]
    err["pair"] = list(zip(err.y, err.pred))
    pair_order = err["pair"].value_counts().index.tolist()
    # Representative = most confident error per confusion pair, round-robin,
    # skipping repeats of the same peer segment so the 10 cases differ.
    picked, used = [], set()
    pools = {pp: err[err.pair == pp].sort_values("confidence", ascending=False) for pp in pair_order}
    while len(picked) < 10 and any(len(v) for v in pools.values()):
        for pp in pair_order:
            while len(pools[pp]) and len(picked) < 10:
                cand = pools[pp].iloc[0]
                pools[pp] = pools[pp].iloc[1:]
                k = (int(cand.y), int(cand.pred), int(cand.inc_q), int(cand.saved), int(cand.borrowed))
                if k not in used:
                    used.add(k)
                    picked.append(cand)
                    break
    class_w = {c: len(y_tr) / (3 * int((y_tr == c).sum())) for c in CLASSES}
    res["class_weights_balanced"] = {str(c): float(v) for c, v in class_w.items()}
    err_rows = []
    for r in picked:
        key = tuple(int(r[f]) for f in FEATURES)
        seen = tr_lookup.get(key)
        t_, p_ = int(r.y), int(r.pred)
        sub = tr_df[(tr_df.inc_q == r.inc_q) & (tr_df.saved == r.saved) & (tr_df.borrowed == r.borrowed)]
        share = {int(k): round(float(v), 2) for k, v in sorted(sub.y.value_counts(normalize=True).to_dict().items())}
        for c in CLASSES:
            share.setdefault(c, 0.0)
        peer = f"training peers with same income quintile/saved/borrowed (n={len(sub)}) split {dict(sorted(share.items()))}"
        if seen and len(seen) > 1:
            dist = dict(sorted({int(k): int(v) for k, v in seen.items()}.items()))
            cause = f"Label noise: identical profile appears {sum(dist.values())}x in training with mixed labels {dist}"
        elif seen:
            maj = int(next(iter(seen)))
            cause = f"Atypical answer: identical profile appears {sum(seen.values())}x in training, always class {maj}"
        elif share[p_] == max(share.values()):
            cause = f"Atypical for segment: {peer}; model followed the segment majority"
        elif class_w[p_] > class_w[t_] and share[p_] < share[t_]:
            cause = (f"Class weighting: {peer}; class {p_} carries {class_w[p_]:.2f}x sample weight vs {class_w[t_]:.2f}x "
                     f"for class {t_}, tipping a mixed segment toward the rarer class")
        else:
            cause = f"Weak signal: {peer}; the 7 features do not separate these classes here"
        err_rows.append({"age": int(r.age), "educ": int(r.educ), "inc_q": int(r.inc_q), "emp_in": int(r.emp_in),
                         "urbanicity": int(r.urbanicity), "saved": int(r.saved), "borrowed": int(r.borrowed),
                         "true_class": int(r.y), "predicted_class": int(r.pred), "confidence_in_prediction": float(r.confidence),
                         "p_true_class": float(r.p_true_class), "ordinal_distance": int(abs(r.y - r.pred)), "likely_cause": cause})
    pd.DataFrame(err_rows).to_csv(OUT / "c1_misclassifications.csv", index=False)
    res["error_analysis"] = {"n_test_errors": int(len(err)), "error_pairs": {f"{a}->{b}": int(c) for (a, b), c in err["pair"].value_counts().items()},
                             "representative": err_rows}

    # ── tables ───────────────────────────────────────────────────────────
    comp = []
    for name in make_models():
        tm, c = test_metrics[name], ci[name]
        comp.append({"model": name, "label": MODEL_LABELS[name],
                     **{f"test_{k}": tm[k] for k in ["f1_macro", "balanced_accuracy", "mcc", "accuracy", "f1_weighted",
                                                     "quadratic_weighted_kappa", "mae_class_index", "spearman_rho",
                                                     "roc_auc_ovr_macro", "pr_auc_macro", "brier_multiclass", "log_loss", "ece_top_label_10bin"]},
                     **{f"ci_{k}_low": c[k]["ci95_low"] for k in HEADLINE}, **{f"ci_{k}_high": c[k]["ci95_high"] for k in HEADLINE},
                     **{f"cv_{k}_mean": cv_train[name][k]["mean"] for k in HEADLINE}, **{f"cv_{k}_std": cv_train[name][k]["std"] for k in HEADLINE},
                     **{f"weighted_{k}": tm["survey_weighted"][k] for k in tm["survey_weighted"]}})
    pd.DataFrame(comp).to_csv(OUT / "c1_model_comparison.csv", index=False)
    pc = pd.DataFrame([{"class": c, **v} for c, v in test_metrics[best]["per_class"].items()])
    pc.to_csv(OUT / "c1_per_class_best.csv", index=False)
    cm = confusion_matrix(yt, preds[best], labels=CLASSES)
    pd.DataFrame(cm, index=[f"true_{c}" for c in CLASSES], columns=[f"pred_{c}" for c in CLASSES]).to_csv(OUT / "c1_confusion_matrix_best.csv")
    res["confusion_matrix_best"] = cm.tolist()
    res["runtime_seconds"] = time.time() - t_start

    figures_c1(res, best, yt, preds, probas, cm, pi_df, seg_df, ci)
    return res


# ════════════════════════════════════════════════════════════════════════════
# Component 1 - figures
# ════════════════════════════════════════════════════════════════════════════
def figures_c1(res, best, yt, preds, probas, cm, pi_df, seg_df, ci):
    label = MODEL_LABELS[best]
    cls_names = [f"Class {c}" for c in CLASSES]

    # confusion matrix: counts + row-normalised
    fig, axes = plt.subplots(1, 2, figsize=(9.5, 3.9))
    norm = cm / cm.sum(axis=1, keepdims=True)
    for ax, mat, fmt, title in [(axes[0], cm, "d", "Counts"), (axes[1], norm, ".2f", "Row-normalised (recall)")]:
        sns.heatmap(mat, annot=True, fmt=fmt, cmap=SEQ, cbar=False, ax=ax, linewidths=2, linecolor="white",
                    xticklabels=cls_names, yticklabels=cls_names, annot_kws={"size": 11})
        ax.set_xlabel("Predicted")
        ax.set_ylabel("True", labelpad=10)
        ax.tick_params(axis="y", rotation=0)
        ax.set_title(title, loc="left")
        ax.grid(False)
    fig.suptitle(f"Confusion matrix - {label}, held-out test set (n={len(yt)})", x=0.02, ha="left", fontsize=12)
    fig.tight_layout()
    fig.savefig(OUT / "c1_confusion_matrix.png")
    plt.close(fig)

    Y = label_binarize(yt, classes=CLASSES)
    P = probas[best]
    # ROC
    fig, ax = plt.subplots(figsize=(5.2, 4.6))
    for i, c in enumerate(CLASSES):
        fpr, tpr, _ = roc_curve(Y[:, i], P[:, i])
        auc = roc_auc_score(Y[:, i], P[:, i])
        ax.plot(fpr, tpr, color=CLASS_COLORS[c], lw=2, label=f"Class {c} vs rest (AUC {auc:.3f})")
    ax.plot([0, 1], [0, 1], ls="--", color=INK2, lw=1, label="Chance")
    ax.set(xlabel="False positive rate", ylabel="True positive rate", xlim=(0, 1), ylim=(0, 1.01))
    ax.set_title(f"ROC curves (one-vs-rest) - {label}\nmacro AUC {res['test'][best]['roc_auc_ovr_macro']:.3f}", loc="left")
    ax.legend(loc="lower right", fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT / "c1_roc_curves.png")
    plt.close(fig)
    # PR
    fig, ax = plt.subplots(figsize=(5.2, 4.6))
    for i, c in enumerate(CLASSES):
        pr, rc, _ = precision_recall_curve(Y[:, i], P[:, i])
        ap = average_precision_score(Y[:, i], P[:, i])
        ax.plot(rc, pr, color=CLASS_COLORS[c], lw=2, label=f"Class {c} (AP {ap:.3f})")
        ax.axhline(Y[:, i].mean(), color=CLASS_COLORS[c], ls=":", lw=1)
    ax.set(xlabel="Recall", ylabel="Precision", xlim=(0, 1), ylim=(0, 1.01))
    ax.set_title(f"Precision-recall curves - {label}\ndotted lines: class prevalence (chance level)", loc="left")
    ax.legend(loc="upper right", fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT / "c1_pr_curves.png")
    plt.close(fig)

    # calibration
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.4))
    ax = axes[0]
    for i, c in enumerate(CLASSES):
        frac, mean_p = calibration_curve(Y[:, i], P[:, i], n_bins=8, strategy="quantile")
        ax.plot(mean_p, frac, marker="o", ms=5, lw=2, color=CLASS_COLORS[c], label=f"Class {c} vs rest")
    ax.plot([0, 1], [0, 1], ls="--", color=INK2, lw=1, label="Perfect calibration")
    ax.set(xlabel="Mean predicted probability", ylabel="Observed frequency", xlim=(0, 1), ylim=(0, 1))
    ax.set_title("Per-class reliability (8 quantile bins)", loc="left")
    ax.legend(fontsize=9, loc="upper left")
    ax = axes[1]
    bins = pd.read_csv(OUT / "c1_calibration_bins_best.csv")
    ax.plot([0, 1], [0, 1], ls="--", color=INK2, lw=1)
    ax.plot(bins.mean_confidence, bins.accuracy, marker="o", ms=6, lw=2, color=BLUE)
    for _, r in bins.iterrows():
        ax.annotate(f"n={int(r.n)}", (r.mean_confidence, r.accuracy), textcoords="offset points", xytext=(6, -14), fontsize=8, color=INK2,
                    bbox=dict(facecolor="white", edgecolor="none", pad=0.8))
    t = res["test"][best]
    ax.set(xlabel="Top-label confidence", ylabel="Accuracy", xlim=(0, 1), ylim=(0, 1))
    ax.set_title(f"Top-label reliability (10 bins)\nECE {t['ece_top_label_10bin']:.3f} | Brier {t['brier_multiclass']:.3f} | log loss {t['log_loss']:.3f}", loc="left")
    fig.suptitle(f"Calibration - {label}, held-out test set", x=0.02, ha="left", fontsize=12)
    fig.tight_layout()
    fig.savefig(OUT / "c1_calibration.png")
    plt.close(fig)

    # permutation importance
    d = pi_df.sort_values("importance_mean")
    fig, ax = plt.subplots(figsize=(6.2, 3.8))
    ax.barh(d.feature, d.importance_mean, xerr=d.importance_std, color=BLUE, height=0.6, error_kw={"ecolor": INK2, "lw": 1, "capsize": 3})
    ax.axvline(0, color=INK2, lw=0.8)
    for yy, (m, s) in enumerate(zip(d.importance_mean, d.importance_std)):
        ax.text(max(m + s, 0) + 0.002, yy, f"{m:+.3f}", va="center", fontsize=8.5, color=INK)
    ax.set_xlabel("Drop in macro-F1 when the feature is shuffled (mean ± SD, 30 repeats)")
    ax.set_title(f"Permutation importance - {label}, test set", loc="left")
    ax.grid(axis="y", visible=False)
    fig.tight_layout()
    fig.savefig(OUT / "c1_permutation_importance.png")
    plt.close(fig)

    # segment performance
    overall = res["test"][best]["f1_macro"]
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.0), sharey=True)
    for ax, col, title in [(axes[0], "inc_q", "Income quintile (inc_q)"), (axes[1], "age_band", "Age band")]:
        s = seg_df[seg_df.segment == col]
        colors = [BLUE if not f else "#9ec5f4" for f in s.low_n_flag]
        ax.bar(s.value, s.f1_macro, color=colors, width=0.62)
        for xx, (v, nn) in enumerate(zip(s.f1_macro, s.n)):
            ax.text(xx, v + 0.01, f"{v:.2f}\nn={nn}", ha="center", va="bottom", fontsize=8, color=INK, zorder=5,
                    bbox=dict(facecolor="white", edgecolor="none", pad=1.0))
        ax.axhline(overall, ls="--", color=ORANGE, lw=1.5, zorder=2)
        ax.text(len(s) - 0.5, overall + 0.01, f"overall {overall:.2f}", ha="right", va="bottom", fontsize=8.5, color=INK2)
        ax.set_title(title, loc="left")
        ax.set_ylim(0, 1)
        ax.grid(axis="x", visible=False)
    axes[0].set_ylabel("Macro-F1 (test set)")
    fig.suptitle(f"Performance by segment - {label} (light bars: n < 30, interpret with caution)", x=0.02, ha="left", fontsize=12)
    fig.tight_layout()
    fig.savefig(OUT / "c1_segment_performance.png")
    plt.close(fig)

    # model comparison with CIs
    names = list(MODEL_LABELS)
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.9), sharey=True)
    for ax, k, title in [(axes[0], "f1_macro", "Macro-F1"), (axes[1], "balanced_accuracy", "Balanced accuracy"), (axes[2], "mcc", "MCC")]:
        for yy, nm in enumerate(names):
            c = ci[nm][k]
            col = BLUE if nm == best else INK2
            ax.errorbar(c["point"], yy, xerr=[[c["point"] - c["ci95_low"]], [c["ci95_high"] - c["point"]]], fmt="o", ms=7,
                        color=col, ecolor=col, elinewidth=2, capsize=3)
            ax.text(c["ci95_high"] + 0.01, yy, f"{c['point']:.3f}", va="center", fontsize=8.5, color=INK)
        ax.set_title(title, loc="left")
        ax.grid(axis="y", visible=False)
    axes[0].set_yticks(range(len(names)))
    axes[0].set_yticklabels([MODEL_LABELS[n] for n in names])
    axes[0].invert_yaxis()
    fig.suptitle("Held-out test metrics with bootstrap 95% CIs (1000 resamples); blue = selected model", x=0.02, ha="left", fontsize=12)
    fig.tight_layout()
    fig.savefig(OUT / "c1_model_comparison.png")
    plt.close(fig)


# ════════════════════════════════════════════════════════════════════════════
# Components 2 and 5 - independent checks on the Node raw output
# ════════════════════════════════════════════════════════════════════════════
def xirr_reference(flows, days_per_year):
    d0 = date.fromisoformat(flows[0]["date"])
    t = np.array([(date.fromisoformat(f["date"]) - d0).days / days_per_year for f in flows])
    a = np.array([f["amount"] for f in flows], dtype=float)
    if not ((a < 0).any() and (a > 0).any()):
        return None, "undefined (no sign change)"
    npv = lambda r: float(np.sum(a / (1 + r) ** t))
    if len(flows) == 2:
        return ((-a[1] / a[0]) ** (1 / t[1]) - 1) * 100, "closed form (FV/PV)^(1/t) - 1"
    return brentq(npv, -0.99, 10, xtol=1e-12) * 100, "scipy brentq root of NPV"


def r2(x):
    """JS Math.round(x*100)/100 (round half up), used by the app's ledger."""
    return float(np.floor(x * 100 + 0.5) / 100)


def verify_components(raw):
    out = {}
    # ── XIRR ─────────────────────────────────────────────────────────────
    rows = []
    for c in raw["xirr"]:
        ref, method = xirr_reference(c["flows"], 365.25)
        ref365, _ = xirr_reference(c["flows"], 365.0)
        app = c["appXirrPct"]
        if ref is None:
            ok = app is None
            err = None
        else:
            err = None if app is None else abs(app - ref)
            ok = app is not None and err <= 0.005 + 1e-9  # app rounds to 2 dp of a percent
        rows.append({"case": c["id"], "description": c["note"], "n_flows": len(c["flows"]), "app_xirr_pct": app,
                     "reference_xirr_pct_365_25": None if ref is None else round(ref, 6),
                     "reference_xirr_pct_365_excel": None if ref365 is None else round(ref365, 6),
                     "reference_method": method, "abs_error_pct_points": err, "pass": bool(ok)})
    out["xirr"] = {"tolerance_pct_points": 0.005, "day_count": "actual/365.25 (the app's MS_PER_YEAR); actual/365 (Excel XIRR) shown for reference",
                   "cases": rows, "passed": sum(r["pass"] for r in rows), "total": len(rows)}
    pd.DataFrame(rows).to_csv(OUT / "c5_xirr_checks.csv", index=False)

    # ── paper-trading ledger (hand-derived expected values) ──────────────
    cash, qty, avg, realized_total = 100000.0, 0, 0.0, 0.0
    led_rows = []
    for o in raw["ledger"]:
        exp = {"ok": True, "error": None}
        q, p = o["quantity"], o["price"]
        if o["op"] == "buyAt":
            cost = r2(p * q) if float(q).is_integer() else None
            if not float(q).is_integer() or q <= 0:
                exp = {"ok": False, "error": "Quantity must be a positive whole number."}
            elif cost > cash:
                exp = {"ok": False, "error": "Insufficient virtual cash."}
            else:
                avg = r2((qty * avg + q * p) / (qty + q))
                qty += q
                cash = r2(cash - cost)
                exp.update({"tradeTotal": cost, "cash": cash, "holdingQty": qty, "avgCost": avg, "realizedPnl": None})
        else:
            if q > qty:
                exp = {"ok": False, "error": "Insufficient holdings."}
            else:
                proceeds = r2(p * q)
                realized = r2((p - avg) * q)
                qty -= q
                cash = r2(cash + proceeds)
                realized_total = r2(realized_total + realized)
                exp.update({"tradeTotal": proceeds, "cash": cash, "holdingQty": qty, "avgCost": avg if qty else None, "realizedPnl": realized})
        checks = {k: (o.get(k) == v) for k, v in exp.items()}
        if o.get("ok"):
            checks["equity_identity"] = abs(o["totalEquity"] - r2(o["cash"] + o["holdingsValue"])) < 1e-9
            checks["realized_total"] = abs(o["realizedTotal"] - realized_total) < 1e-9
        led_rows.append({"op": o["op"], "quantity": q, "price": p, "expected": exp,
                         "app": {k: o.get(k) for k in ["ok", "error", "tradeTotal", "cash", "holdingQty", "avgCost", "realizedPnl", "totalEquity", "holdingsValue"]},
                         "fields_checked": len(checks), "fields_passed": int(sum(checks.values())), "pass": all(checks.values())})
    out["paper_trading"] = {"ops": led_rows, "passed": sum(r["pass"] for r in led_rows), "total": len(led_rows),
                            "fields_passed": sum(r["fields_passed"] for r in led_rows), "fields_checked": sum(r["fields_checked"] for r in led_rows)}
    pd.DataFrame([{"op": r["op"], "quantity": r["quantity"], "price": r["price"], "expected": json.dumps(r["expected"]),
                   "app": json.dumps(r["app"]), "pass": r["pass"]} for r in led_rows]).to_csv(OUT / "c5_paper_trading_checks.csv", index=False)

    # ── historical SIP arithmetic ────────────────────────────────────────
    s = raw["sip"]
    obs = {o["date"]: o["nav"] for o in s["observations"]}
    P = s["monthlyInvestment"]
    contrib_dates = [f"{y}-{m:02d}-01" for y, m in [(2023, mm) for mm in range(1, 13)] + [(2024, 1)]]
    units = sum(P / obs[d] for d in contrib_dates)
    last = obs[max(obs)]
    value = units * last
    flows = [{"date": d, "amount": -P} for d in contrib_dates] + [{"date": max(obs), "amount": value}]
    # aggregate same-day flows (final contribution and valuation share a date)
    agg = {}
    for f in flows:
        agg[f["date"]] = agg.get(f["date"], 0) + f["amount"]
    flows_agg = [{"date": k, "amount": v} for k, v in sorted(agg.items())]
    ref_x, _ = xirr_reference(flows_agg, 365.25)
    app = s["app"]
    sip_checks = {
        "installments": (app["installmentsCount"], len(contrib_dates), app["installmentsCount"] == len(contrib_dates)),
        "total_invested": (app["totalInvested"], P * len(contrib_dates), abs(app["totalInvested"] - P * len(contrib_dates)) < 1e-9),
        "units_accumulated_4dp": (app["unitsAccumulated"], round(units, 4), abs(app["unitsAccumulated"] - round(units, 4)) < 1e-9),
        "portfolio_value_rounded_to_rupee": (app["portfolioValue"], float(np.floor(value + 0.5)), app["portfolioValue"] == float(np.floor(value + 0.5))),
        "xirr_within_0.01pp": (app["annualizedReturnXIRR"], round(ref_x, 4), abs(app["annualizedReturnXIRR"] - ref_x) <= 0.01),
    }
    out["sip"] = {"series": s["series"], "checks": {k: {"app": v[0], "reference": v[1], "pass": bool(v[2])} for k, v in sip_checks.items()},
                  "passed": sum(bool(v[2]) for v in sip_checks.values()), "total": len(sip_checks),
                  "unrounded_reference_portfolio_value": float(value),
                  "note": "The app rounds portfolio value to whole rupees (historicalSimulation.js Math.round) and units to 4 dp; both are compared exactly after the same rounding."}

    # ── recommender sweep ────────────────────────────────────────────────
    rec = raw["recommender"]
    sw = rec["sweep"]
    cat = rec["catalog"]
    all_recs = [r for p in sw for r in p["recommendations"]]
    uniq = {r["schemeCode"] for r in all_recs}
    lat = np.array(rec["latencyMs"])
    per_profile = []
    for p in sw:
        rs = p["recommendations"]
        n = len(rs)
        pairs = [(a, b) for i, a in enumerate(rs) for b in rs[i + 1:]]
        per_profile.append({
            "id": p["id"], "tier": p["tier"], "risk": p["riskTolerance"], "horizon_months": p["investmentHorizonMonths"], "goal": p["goal"],
            "readiness": p["readinessStatus"], "effective_risk": p["effectiveRiskLevel"], "n_recs": n,
            # SEBI sub-category (normalised); the raw AMFI `category` text has
            # several spellings for one sub-category, so it overstates diversity.
            "distinct_subcategories": len({r["categorySub"] for r in rs}),
            "distinct_raw_category_labels": len({r["category"] for r in rs}), "distinct_amcs": len({r["amc"] for r in rs}),
            "distinct_riskometer_levels": len({r["riskometerLevel"] for r in rs}), "distinct_pools": len({r["sourceGate"] for r in rs}),
            "equity_group_recs": sum(r["categoryGroup"] == "Equity Scheme" for r in rs),
            "intra_list_diversity_subcategory": (np.mean([a["categorySub"] != b["categorySub"] for a, b in pairs]) if pairs else None),
            "intra_list_diversity_amc": (np.mean([a["amc"] != b["amc"] for a, b in pairs]) if pairs else None),
            "mean_riskometer": (np.mean([r["riskometerLevel"] for r in rs]) if rs else None),
            "min_riskometer": (min(r["riskometerLevel"] for r in rs) if rs else None),
            "max_riskometer": (max(r["riskometerLevel"] for r in rs) if rs else None),
            "violations": sum(r["violation"] is not None for r in rs), "deterministic": p["deterministic"],
        })
    pp = pd.DataFrame(per_profile)
    pp.to_csv(OUT / "c2_recommender_per_profile.csv", index=False)

    def agg_stat(col):
        # diversity is defined only for profiles that received a list
        v = pp.loc[pp.n_recs > 0, col].dropna().astype(float)
        return {"mean": float(v.mean()), "min": float(v.min()), "max": float(v.max())} if len(v) else None

    readiness_by_tier = pp.groupby(["tier", "readiness"]).size().reset_index(name="profiles")
    readiness_by_tier.to_csv(OUT / "c2_recommender_readiness_by_tier.csv", index=False)
    tier_table = pp.groupby("tier").agg(profiles=("id", "count"), with_recommendations=("n_recs", lambda s: int((s > 0).sum())),
                                        mean_recs=("n_recs", "mean"), mean_riskometer=("mean_riskometer", "mean"),
                                        mean_effective_risk=("effective_risk", "mean")).reset_index()
    tier_table.to_csv(OUT / "c2_recommender_by_tier.csv", index=False)
    risk_table = pp.groupby("risk").agg(profiles=("id", "count"), mean_effective_risk=("effective_risk", "mean"),
                                        min_effective_risk=("effective_risk", "min"), max_effective_risk=("effective_risk", "max"),
                                        mean_riskometer=("mean_riskometer", "mean"),
                                        min_riskometer=("min_riskometer", "min"), max_riskometer=("max_riskometer", "max"),
                                        mean_distinct_subcategories=("distinct_subcategories", "mean")).reset_index()
    risk_table.to_csv(OUT / "c2_recommender_by_risk.csv", index=False)
    horizon_table = pp.groupby("horizon_months").agg(profiles=("id", "count"), mean_riskometer=("mean_riskometer", "mean"),
                                                     mean_distinct_subcategories=("distinct_subcategories", "mean")).reset_index()
    horizon_table.to_csv(OUT / "c2_recommender_by_horizon.csv", index=False)
    mono_risk = bool(np.all(np.diff(risk_table.mean_riskometer.to_numpy()) >= -1e-12))
    out["recommender"] = {
        "profiles": int(len(sw)), "grid": rec["profileGrid"], "top_n": rec["topN"],
        "profiles_with_recommendations": int((pp.n_recs > 0).sum()), "recommendations_total": int(len(all_recs)),
        "readiness_counts": pp.readiness.value_counts().to_dict(),
        "readiness_by_tier": readiness_by_tier.to_dict(orient="records"),
        "by_tier": tier_table.to_dict(orient="records"),
        "coverage": {
            "unique_funds_recommended": len(uniq),
            "active_catalog_funds": cat["catalogFunds"], "eligible_universe_funds": cat["eligibleUniverseFunds"],
            "catalog_coverage_pct": 100 * len(uniq) / cat["catalogFunds"],
            "eligible_universe_coverage_pct": 100 * len(uniq) / cat["eligibleUniverseFunds"],
            "unique_amcs_recommended": len({r["amc"] for r in all_recs}), "eligible_universe_amcs": cat["eligibleUniverseAmcs"], "catalog_amcs": cat["catalogAmcs"],
            "unique_subcategories_recommended": len({r["categorySub"] for r in all_recs}),
            "subcategories_recommended": sorted({r["categorySub"] for r in all_recs if r["categorySub"]}),
            "eligible_universe_subcategories": cat["eligibleUniverseSubcategories"], "catalog_subcategories": cat["catalogSubcategories"],
            "unique_raw_category_labels_recommended": len({r["category"] for r in all_recs}),
            "recommendations_by_category_group": pd.Series([r["categoryGroup"] for r in all_recs]).value_counts().to_dict(),
            "recommendations_by_pool": pd.Series([r["sourceGate"] for r in all_recs]).value_counts().to_dict(),
            "eligible_universe_definition": "active funds passing at least one pool's hard rules with the horizon rule not binding",
        },
        "diversity_top_n": {k: agg_stat(k) for k in ["n_recs", "distinct_subcategories", "distinct_raw_category_labels", "distinct_amcs",
                                                       "distinct_riskometer_levels", "distinct_pools", "intra_list_diversity_subcategory",
                                                       "intra_list_diversity_amc", "equity_group_recs"]},
        "pool_diagnostics_most_aggressive_profile": rec["poolDiagnostics"],
        "top_recommended_funds_share": {"most_frequent_fund_share_of_profiles": float(pd.Series([r["schemeCode"] for r in all_recs]).value_counts().iloc[0] / len(sw))},
        "risk_alignment": {"by_risk_tolerance": risk_table.to_dict(orient="records"), "mean_riskometer_non_decreasing_with_risk": mono_risk},
        "by_horizon": horizon_table.to_dict(orient="records"),
        "constraint_violations": int(pp.violations.sum()),
        "determinism": {"profiles_identical_across_two_runs": int(pp.deterministic.sum()), "profiles": int(len(pp))},
        "latency_in_process_ms": {"calls": int(len(lat)), "p50": float(np.percentile(lat, 50)), "p95": float(np.percentile(lat, 95)),
                                  "mean": float(lat.mean()), "max": float(lat.max()), "catalog_cold_load_ms": cat["catalogLoadMs"],
                                  "note": "generateRecommendation() called directly (no HTTP), catalog already loaded; numpy linear-interpolated percentiles"},
        "catalog_stats": cat["stats"],
    }
    figures_c2(pp, risk_table)
    return out


def figures_c2(pp, risk_table):
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 3.9))
    ax = axes[0]
    ax.plot(risk_table.risk, risk_table.mean_riskometer, marker="o", ms=8, lw=2, color=BLUE, label="Mean riskometer of top-N")
    ax.fill_between(risk_table.risk, risk_table.min_riskometer, risk_table.max_riskometer, color=BLUE, alpha=0.15, label="Min-max riskometer across profiles")
    ax.plot(risk_table.risk, risk_table.mean_effective_risk, marker="s", ms=7, lw=2, ls="--", color=ORANGE,
            label="Mean effective risk = min(tolerance, capacity)")
    ax.set(xlabel="User risk tolerance (1-5)", ylabel="Level", xticks=[1, 2, 3, 4, 5], ylim=(0.5, 6.5))
    ax.set_title("Risk alignment across the profile grid", loc="left")
    ax.legend(fontsize=9, loc="upper left")
    ax = axes[1]
    nonempty = pp[pp.n_recs > 0]
    cnt = nonempty.distinct_subcategories.value_counts().sort_index()
    ax.bar(cnt.index.astype(str), cnt.values, color=BLUE, width=0.6)
    for xx, v in enumerate(cnt.values):
        ax.text(xx, v + 1, str(v), ha="center", va="bottom", fontsize=9)
    ax.set(xlabel="Distinct SEBI sub-categories in a profile's top-6", ylabel="Profiles")
    ax.set_title(f"Category diversity of top-N lists ({len(nonempty)} profiles with a list)", loc="left")
    ax.grid(axis="x", visible=False)
    fig.tight_layout()
    fig.savefig(OUT / "c2_recommender_risk_and_diversity.png")
    plt.close(fig)


def recommender_rerun_comparison():
    prev = json.loads((OUT / "recommender_previous" / "evaluation_report.json").read_text(encoding="utf-8"))
    new = json.loads((OUT / "recommender_rerun" / "evaluation_report.json").read_text(encoding="utf-8"))
    rows = []

    def add(metric, a, b, kind):
        rows.append({"metric": metric, "previous": a, "rerun": b, "kind": kind, "match": a == b})

    add("recommendations re-validated", prev["eligibility_constraints"]["recommendations_checked"], new["eligibility_constraints"]["recommendations_checked"], "deterministic")
    add("constraint violations", prev["eligibility_constraints"]["violation_count"], new["eligibility_constraints"]["violation_count"], "deterministic")
    add("determinism (all identical)", prev["determinism"]["all_identical"], new["determinism"]["all_identical"], "deterministic")
    for r_old, r_new in zip(prev["determinism"]["results"], new["determinism"]["results"]):
        add(f"payload bytes - {r_old['profile']}", r_old["length"], r_new["length"], "deterministic")
    for prof in prev["profile_summaries"]:
        a = [f["schemeCode"] for f in prev["profile_summaries"][prof]["funds"]]
        b = [f["schemeCode"] for f in new["profile_summaries"][prof]["funds"]]
        add(f"top-N scheme codes - {prof}", ",".join(map(str, a)), ",".join(map(str, b)), "deterministic")
    for k in ["activeFunds", "fundsWithRiskometer", "fundsWithTer", "fundsWithNavMetrics", "fundsWithHistoryOneYear"]:
        add(f"catalog {k}", prev["fund_catalog_stats"][k], new["fund_catalog_stats"][k], "deterministic")
    add("tests total", prev["tests"]["total"], new["tests"]["total"], "changes when tests are added")
    add("tests failed", prev["tests"]["failed"], new["tests"]["failed"], "deterministic")
    for prof, l in prev["api_latency_ms"].items():
        add(f"HTTP latency p50 ms - {prof}", l["p50Ms"], new["api_latency_ms"][prof]["p50Ms"], "timing (expected to vary)")
        add(f"HTTP latency p95 ms - {prof}", l["p95Ms"], new["api_latency_ms"][prof]["p95Ms"], "timing (expected to vary)")
    df = pd.DataFrame(rows)
    df.to_csv(OUT / "c2_recommender_rerun_vs_previous.csv", index=False)
    det = df[df.kind == "deterministic"]
    return {"previous_generated": prev["generated_on"], "rerun_generated": new["generated_on"], "rows": rows,
            "deterministic_items_matching": int(det.match.sum()), "deterministic_items": int(len(det)),
            "rerun_tests": new["tests"], "rerun_latency": new["api_latency_ms"]}


def experiment_summary():
    run = json.loads((OUT / "experiment_run" / "run.json").read_text(encoding="utf-8"))
    r = run["results"]
    pick = lambda d: {k: d[k] for k in ["passed", "total", "failed", "rate"] if k in d}
    rows = [
        ("Formula correctness (14 core metrics vs independent reference)", pick(r["formula"]["overall"])),
        ("Goal calculations (11 fields)", pick(r["goal"]["overall"])),
        ("Recommendation trigger set (exact match)", pick(r["recommendation"]["exact"]["overall"])),
        ("Recommendation per-ID decisions", pick(r["recommendation"]["decisions"]["overall"])),
        ("What-if scenario comparison", pick(r["comparison"]["overall"])),
        ("Determinism (repeat runs identical)", pick(r["determinism"]["overall"])),
        ("Directional invariants (applicable cases)", pick(r["invariants"]["overall"])),
        ("Explainability coverage", pick(r["explainability"]["overall"])),
        ("Validation - invalid inputs rejected with correct message", {"passed": r["validation"]["invalid"]["passed"], "total": r["validation"]["invalid"]["total"],
                                                                       "failed": r["validation"]["invalid"]["failed"], "rate": r["validation"]["invalid"]["passRate"]}),
        ("Validation - valid inputs accepted", {"passed": r["validation"]["valid"]["accepted"], "total": r["validation"]["valid"]["total"],
                                                "failed": r["validation"]["valid"]["failed"], "rate": r["validation"]["valid"]["acceptanceRate"]}),
    ]
    inv = [{"id": i["id"], "description": i["description"], "applicable": i["applicable"], "passed": i["passed"],
            "not_applicable": i["notApplicable"]} for i in r["invariants"]["byInvariant"]]
    pd.DataFrame([{"check": a, **b} for a, b in rows]).to_csv(OUT / "c3_experiment_summary.csv", index=False)
    pd.DataFrame(inv).to_csv(OUT / "c3_invariants.csv", index=False)
    return {"run_directory": run.get("runDirectory"), "generated_at": run.get("generatedAt"), "seed": run["config"]["seed"],
            "as_of_date": run["config"]["asOfDate"], "profiles": run["dataset"]["meta"]["totalProfiles"],
            "random_profiles": run["dataset"]["meta"]["randomProfiles"], "edge_case_profiles": run["dataset"]["meta"]["edgeCaseProfiles"],
            "checks": [{"check": a, **b} for a, b in rows], "invariants": inv, "synthetic_only": run["meta"]["syntheticOnly"]}


# ════════════════════════════════════════════════════════════════════════════
# Orchestration
# ════════════════════════════════════════════════════════════════════════════
def run(cmd, log):
    print(f"$ {' '.join(cmd)}")
    with open(log, "w", encoding="utf-8") as fh:
        p = subprocess.run(cmd, cwd=ROOT, stdout=fh, stderr=subprocess.STDOUT, shell=(os.name == "nt"))
        fh.write(f"\nexit={p.returncode}\n")
    if p.returncode != 0:
        raise SystemExit(f"command failed ({p.returncode}): {' '.join(cmd)} - see {log}")


def run_slow_node_harnesses():
    # 1) npm run experiment -> archive the newest run directory
    run(["npm", "run", "experiment"], OUT / "npm_experiment_stdout.txt")
    runs = sorted((ROOT / "experiments" / "results").glob("run-*"), key=lambda p: p.stat().st_mtime)
    dest = OUT / "experiment_run"
    dest.mkdir(exist_ok=True)
    for f in ["run.json", "report.md", "manifest.json"]:
        shutil.copy2(runs[-1] / f, dest / f)
    # 2) recommender report script; it overwrites data/reports/evaluation_report.*,
    #    so the committed copies are kept as "previous" and restored afterwards.
    prev = OUT / "recommender_previous"
    if not (prev / "evaluation_report.json").exists():
        prev.mkdir(exist_ok=True)
        for ext in ["json", "md"]:
            shutil.copy2(ROOT / "data" / "reports" / f"evaluation_report.{ext}", prev)
    run(["node", "scripts/evaluateRecommendations.mjs"], OUT / "recommender_rerun_stdout.txt")
    rr = OUT / "recommender_rerun"
    rr.mkdir(exist_ok=True)
    for ext in ["json", "md"]:
        shutil.copy2(ROOT / "data" / "reports" / f"evaluation_report.{ext}", rr)
        shutil.copy2(prev / f"evaluation_report.{ext}", ROOT / "data" / "reports")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fast", action="store_true", help="reuse archived outputs of the two slow Node harnesses")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    style()
    np.random.seed(SEED)

    if not args.fast:
        run_slow_node_harnesses()
    run(["node", "evaluation/verify_components.mjs"], OUT / "verify_components_stdout.txt")
    raw = json.loads((OUT / "components_raw.json").read_text(encoding="utf-8"))

    print("Component 1: Findex classifier ...")
    c1 = evaluate_classifier()
    print("Components 2/5: verification ...")
    comp = verify_components(raw)
    comp["recommender"]["rerun_vs_previous_report"] = recommender_rerun_comparison()
    c3 = experiment_summary()

    node_v = subprocess.run(["node", "-v"], capture_output=True, text=True, shell=(os.name == "nt")).stdout.strip()
    metrics = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED, "bootstrap_resamples": N_BOOT,
        "environment": {"python": platform.python_version(), "platform": platform.platform(), "processor": platform.processor(),
                        "cpu_count": os.cpu_count(), "node": node_v,
                        "libraries": {"scikit-learn": sklearn.__version__, "pandas": pd.__version__, "numpy": np.__version__,
                                      "scipy": scipy.__version__, "statsmodels": statsmodels.__version__,
                                      "matplotlib": matplotlib.__version__, "seaborn": sns.__version__}},
        "component1_findex_classifier": c1,
        "component2_recommender": comp["recommender"],
        "component3_money_checkup_whatif": c3,
        "component5_paper_trading_and_simulation": {"xirr": comp["xirr"], "paper_trading_ledger": comp["paper_trading"], "historical_sip": comp["sip"]},
        "not_computed": [
            {"item": "Precision@k, Recall@k, NDCG@k, MAP, hit rate for the recommender",
             "reason": "no ground-truth relevance labels or user-fund interactions exist in the repository",
             "needed": "expert relevance ratings (e.g. 2-3 raters grading the top-6 funds for 20-30 profiles) or logged user interactions"},
            {"item": "Answer quality / faithfulness of Gemini lesson generation and narrator",
             "reason": "no reference answers exist and Gemini calls were out of scope (no paid APIs)",
             "needed": "a reference set of curated lessons with expected key facts, plus generated outputs to compare against"},
            {"item": "Retrieval metrics (Recall@k, MRR)", "reason": "the system has no retrieval / RAG component", "needed": "n/a"},
            {"item": "Backtest (Sharpe, drawdown, win rate)", "reason": "the system makes no buy/sell or allocation decisions; users place practice trades themselves", "needed": "n/a"},
            {"item": "Real-world accuracy of the Money Check-up / What-if Planner", "reason": "rule-based formulas evaluated only on synthetic profiles; no outcome labels",
             "needed": "longitudinal user outcome data"},
        ],
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2, default=float), encoding="utf-8")
    print("metrics.json written")

    sys.path.insert(0, str(EVAL))
    import build_report
    build_report.build(metrics)
    build_report.print_summary(metrics)


if __name__ == "__main__":
    main()
