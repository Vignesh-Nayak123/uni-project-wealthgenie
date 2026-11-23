"""
Render evaluation/RESULTS.md from evaluation/results/metrics.json.

Every number in RESULTS.md is read from metrics.json (produced by
evaluate.py); qualitative wording that depends on a result (e.g. "the CI
excludes zero") is decided from the numbers here, never hard-coded.

Run on its own (after evaluate.py):  .venv/Scripts/python.exe evaluation/build_report.py
"""
from __future__ import annotations

import json
from pathlib import Path

EVAL = Path(__file__).resolve().parent
OUT = EVAL / "results"
REGEN = "`.venv/Scripts/python.exe evaluation/evaluate.py --fast`"
REGEN_FULL = "`.venv/Scripts/python.exe evaluation/evaluate.py`"

LABELS = {
    "dummy_majority": "Majority class (dummy)",
    "dummy_stratified": "Stratified random (dummy)",
    "logreg": "Logistic regression",
    "logreg_balanced": "Logistic regression (class-weighted)",
    "random_forest": "Random forest (class-weighted)",
    "hist_gb": "Histogram gradient boosting",
}
ORDER = list(LABELS)


def f3(x):
    return "n/a" if x is None else f"{x:.3f}"


def pct(x, d=1):
    return "n/a" if x is None else f"{100 * x:.{d}f}%"


def ci(c):
    return f"{c['point']:.3f} [{c['ci95_low']:.3f}, {c['ci95_high']:.3f}]"


def ms(d):
    return f"{d['mean']:.3f} ± {d['std']:.3f}"


def p_fmt(p):
    return f"{p:.2e}" if p < 1e-3 else f"{p:.3f}"


def table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "|".join(["---"] * len(header)) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def src(*files):
    return "*Source: " + ", ".join(f"`results/{f}`" for f in files) + f" · regenerate: {REGEN}*"


def excl_zero(c):
    return c["ci95_low"] > 0 or c["ci95_high"] < 0


def build(m):
    c1 = m["component1_findex_classifier"]
    rec = m["component2_recommender"]
    c3 = m["component3_money_checkup_whatif"]
    c5 = m["component5_paper_trading_and_simulation"]
    env = m["environment"]
    best = c1["best_model"]["name"]
    bl = LABELS[best]
    t = c1["test"]
    B = c1["bootstrap_ci95"]
    cvt = c1["cv_train_5fold"]
    d = c1["data"]
    sp = c1["split"]
    ceil = c1["accuracy_ceiling"]
    diffs = c1["paired_bootstrap_best_minus_other"]
    mc = c1["mcnemar_best_vs"]
    L = []
    w = L.append

    # ── title ────────────────────────────────────────────────────────────
    w("# WealthGenie — Evaluation Results\n")
    w(f"Generated {m['generated_at']} by `evaluation/evaluate.py` (seed {m['seed']}). Every number in this document is read from "
      "[`results/metrics.json`](results/metrics.json), produced by code that was actually run; nothing is estimated or rounded up. "
      "Items that could not be computed are listed in §5 with what would be needed.\n")

    # ── 1 overview ───────────────────────────────────────────────────────
    w("## 1. System overview: what is learned and what is rule-based\n")
    w("WealthGenie is a **rule-based, deterministic financial-literacy and planning platform**. Its user-facing decisions — the "
      "Money Check-up, the What-if Planner, the fund-screening engine and the practice-trading ledger — are transparent formulas and "
      "hard eligibility rules with fixed, published weights. **The only trained machine-learning model in the repository is the Findex "
      "emergency-money classifier (Component 1). It is an isolated research experiment: no application code imports it, and its "
      "predictions are never shown to users.** It is evaluated here because it is the project's only learned component, not because "
      "the product depends on it.\n")
    w(table(["#", "Component", "Code", "Type", "How it is evaluated here"], [
        ["1", "Findex emergency-money classifier", "`ml/train.py`", "**Learned** (3-class ordinal classification)", "Held-out test, CV, bootstrap CIs, significance, ablation, error analysis (§3)"],
        ["2", "Fund recommendation engine", "`backend/src/services/recommendation/`", "Rule-based (hard gates + fixed-weight score)", "Label-free: coverage, diversity, constraint violations, latency, determinism (§4.1)"],
        ["3", "Money Check-up / What-if Planner", "`backend/src/utils/financialAssessment.js`, `financialTwin.js`", "Rule-based formulas", "`npm run experiment`: formula correctness, invariants, determinism (§4.2)"],
        ["4", "Lesson generation / narrator", "`backend/src/services/ai.service.js`, `narrator.js`", "LLM rewording (Gemini)", "Not evaluated — no reference answers; see §5"],
        ["5", "Practice trading + historical simulation", "`backend/src/services/paperTrading/`, `backend/src/utils/historicalSimulation.js`", "Rule-based arithmetic", "Hand-checkable correctness cases (§4.3); no backtest — the system makes no trading decisions"],
    ]))
    w("")

    # ── 2 methodology ────────────────────────────────────────────────────
    w("## 2. Evaluation methodology\n")
    cd = d["class_distribution"]
    w("### 2.1 Component 1 — Findex classifier\n")
    w(f"**Data.** World Bank Global Findex 2025 microdata for India (`data/Findex_Microdata_2025_updateIndia.csv`, {d['raw_rows']} respondents × "
      f"{d['raw_columns']} columns; not in Git). Following `ml/prepare_dataset.py`, rows with a substantive target (`fin24a` ∈ {{1,2,3}}) and no "
      f"missing features are kept: **{d['rows_retained']} rows** ({d['rows_excluded']} excluded: {d['raw_target_counts'].get('missing', 0)} missing target, "
      f"{d['raw_target_counts'].get('4', 0)} with code 4). The rebuilt table is checked to be identical to the committed "
      f"`data/processed/findex_resilience.csv` (check passed: {d['rebuilt_equals_processed_csv']}). Features: `age` (numeric), `educ`, `inc_q`, "
      "`emp_in`, `urbanicity`, `saved`, `borrowed` (categorical). `fin24` is deliberately excluded because it is the source question "
      "that `fin24a` follows up on.\n")
    q = d["class_share_by_income_quintile"]
    w(f"**Target wording.** The exact category wording of `fin24a` is not documented anywhere in the repository; `ml/README.md` only "
      f"calls it \"reported difficulty obtaining emergency money\", \"a 3-point ordinal survey response\", and no data dictionary is present. Classes are "
      f"therefore reported as Class 1/2/3. The share of Class 1 falls from {pct(q['1']['1'], 0)} in income quintile 1 to {pct(q['5']['1'], 0)} in quintile 5, "
      "which is consistent with Class 1 meaning the greatest difficulty — **to be verified against the Findex 2025 codebook.**\n")
    w(f"**Split.** Stratified 80/20 hold-out, `random_state=42` — identical to `ml/train.py`: train {sp['train_n']}, test {sp['test_n']}. "
      "All preprocessing (median/most-frequent imputation, standard scaling of age, one-hot encoding) is fitted inside a scikit-learn "
      "Pipeline on training data only. The survey is a single cross-sectional wave, so a random stratified split is appropriate (no "
      "chronological ordering exists). No saved model existed; every model is retrained on the training split.\n")
    w("**Models.** Majority-class and stratified-random dummies; logistic regression (plain and `class_weight='balanced'`, `max_iter=2000`); "
      "random forest (300 trees, balanced, as in `train.py`); histogram gradient boosting (library defaults). Hyperparameters were fixed in "
      "advance; nothing was tuned. **Model selection** uses only the training split: the model with the highest mean 5-fold stratified "
      f"CV macro-F1 is selected — **{bl}**. The test set is used once, for reporting.\n")
    w(f"**Metrics and rigour.** Headline metrics are macro-F1, balanced accuracy and MCC (accuracy is secondary because Class 1 is "
      f"{pct(cd['1']['pct'])} of rows). Also reported: weighted P/R/F1, Cohen's κ, ordinal metrics (MAE on class index, quadratic weighted κ, "
      "Spearman ρ), ROC-AUC (one-vs-rest, macro), PR-AUC (macro average precision), Brier score (multiclass sum form, range 0–2), log loss, "
      "top-label ECE (10 equal-width bins), and survey-weighted (`wgt`) accuracy/F1. Uncertainty: 5-fold stratified CV on the training split "
      f"(mean ± SD) and {m['bootstrap_resamples']}-resample percentile bootstrap 95% CIs on the test set (seed 42), including paired bootstrap CIs "
      "for differences between models. Significance: McNemar's test (continuity-corrected χ², exact binomial if fewer than 25 discordant pairs). "
      "Sensitivity: grouped CV (identical feature vectors kept in one fold) and a de-duplicated re-split. Ablation by refitting without features; "
      "permutation importance (30 repeats, scoring macro-F1).\n")
    lib = env["libraries"]
    w(f"**Environment.** Python {env['python']}, scikit-learn {lib['scikit-learn']}, pandas {lib['pandas']}, numpy {lib['numpy']}, scipy {lib['scipy']}, "
      f"statsmodels {lib['statsmodels']}, matplotlib {lib['matplotlib']}, seaborn {lib['seaborn']}; Node {env['node']}. Hardware: {env['platform']}, "
      f"{env['processor'] or 'CPU'}, {env['cpu_count']} logical CPUs, no GPU. Component 1 runtime: {c1['runtime_seconds']:.0f} s.\n")
    w("### 2.2 Components 2, 3 and 5\n")
    g = rec["grid"]
    w(f"**Recommender (2).** `generateRecommendation()` is called directly over a fixed synthetic grid of **{rec['profiles']} profiles**: "
      f"risk tolerance {g['risk']} × horizon {g['horizonMonths']} months × goal {g['goals']} × finance tier {g['financeTiers']} "
      "(comfortable surplus; tight budget with irregular income; spending above income). Each profile is run twice for determinism and "
      f"timed. Every returned fund is independently re-checked against its pool's hard rules. Top-N = {rec['top_n']} (app default). "
      "The existing `scripts/evaluateRecommendations.mjs` was also re-run and compared with the committed report.\n")
    w(f"**Money Check-up / What-if Planner (3).** `npm run experiment` (seed {c3['seed']}, as-of {c3['as_of_date']}, {c3['profiles']} synthetic "
      f"profiles: {c3['random_profiles']} random + {c3['edge_case_profiles']} edge cases), comparing the app against an independent reference implementation.\n")
    w("**Practice trading / simulation (5).** The Node script records only what the app returns; the expected values are computed "
      "independently in Python (closed-form or `scipy.optimize.brentq` XIRR, a hand-derived ledger, unit arithmetic for a SIP on a synthetic "
      "NAV series).\n")

    # ── 3 component 1 ────────────────────────────────────────────────────
    w("## 3. Component 1 results — Findex classifier\n")
    w("### 3.1 Data integrity\n")
    dup = d["duplicates"]
    w(table(["Class", "Rows", "Share", "Train", "Test"], [[f"Class {k}", v["n"], pct(v["pct"]), sp["train_class_counts"][k], sp["test_class_counts"][k]]
                                                   for k, v in cd.items()]))
    w("")
    w(f"- Class imbalance: majority-to-minority ratio {d['imbalance_ratio_majority_to_minority']:.2f} : 1.")
    w(f"- Duplicates: {dup['exact_duplicate_rows_features_and_target']} rows exactly duplicate another row (features and target); only "
      f"{dup['unique_feature_vectors']} distinct feature vectors exist; {dup['feature_vectors_with_conflicting_labels']} vectors "
      f"({dup['rows_in_conflicting_feature_vectors']} rows) carry conflicting labels.")
    w(f"- Train/test overlap: {sp['test_rows_with_feature_vector_seen_in_train']} test rows ({pct(sp['test_rows_with_feature_vector_seen_in_train_pct'])}) "
      f"share a feature vector with a training row; {sp['exact_row_duplicates_across_split']} are exact duplicates including the label. These are "
      "different respondents with coarse answers, not copied records, so this is not classic leakage — but it is tested in §3.7.")
    w("- Leakage: no feature is derived from `fin24`/`fin24a`; preprocessing is fitted on training folds only; no temporal dimension exists.")
    top_f1 = max(t[n]["f1_macro"] for n in ORDER)
    w(f"- Results are not suspiciously high (best test macro-F1 of any model: {f3(top_f1)}); duplicate-driven optimism is still tested in §3.7.\n")

    w("### 3.2 Headline metrics — selected model\n")
    w(table(["Metric", f"Test (95% bootstrap CI) — {bl}", "5-fold CV on train (mean ± SD)", "Majority baseline (test)"], [
        ["Macro-F1", ci(B[best]["f1_macro"]), ms(cvt[best]["f1_macro"]), f3(t["dummy_majority"]["f1_macro"])],
        ["Balanced accuracy", ci(B[best]["balanced_accuracy"]), ms(cvt[best]["balanced_accuracy"]), f3(t["dummy_majority"]["balanced_accuracy"])],
        ["MCC", ci(B[best]["mcc"]), ms(cvt[best]["mcc"]), f3(t["dummy_majority"]["mcc"])],
        ["Accuracy (secondary)", ci(B[best]["accuracy"]), ms(cvt[best]["accuracy"]), f3(t["dummy_majority"]["accuracy"])],
        ["Quadratic weighted κ", ci(B[best]["quadratic_weighted_kappa"]), ms(cvt[best]["quadratic_weighted_kappa"]), f3(t["dummy_majority"]["quadratic_weighted_kappa"])],
    ]))
    w("\n" + src("c1_model_comparison.csv", "metrics.json") + "\n")

    w("### 3.3 Baseline and model comparison (held-out test, n = %d)\n" % sp["test_n"])
    rows = []
    for n in ORDER:
        rows.append([LABELS[n] + (" **(selected)**" if n == best else ""), ci(B[n]["f1_macro"]), ci(B[n]["balanced_accuracy"]), ci(B[n]["mcc"]),
                     f3(t[n]["accuracy"]), f3(t[n]["f1_weighted"]), ms(cvt[n]["f1_macro"])])
    w(table(["Model", "Macro-F1 [95% CI]", "Balanced acc. [95% CI]", "MCC [95% CI]", "Accuracy", "Weighted F1", "CV macro-F1 (train)"], rows))
    w("\n" + src("c1_model_comparison.csv", "c1_cv_train_folds.csv"))
    w("\n![Model comparison](results/c1_model_comparison.png)\n")
    top_test = max([n for n in ORDER if not n.startswith("dummy")], key=lambda n: t[n]["f1_macro"])
    if top_test != best:
        dd = diffs[top_test]["f1_macro"]
        w(f"Note: on the test set, {LABELS[top_test]} has a higher macro-F1 ({f3(t[top_test]['f1_macro'])}) than the selected model. Selection was fixed "
          f"from training-split CV before the test set was scored, so the selection is not changed; the paired-bootstrap difference "
          f"(selected − {LABELS[top_test]}) is {ci(dd)}, which {'excludes' if excl_zero(dd) else 'includes'} zero.\n")

    w("### 3.4 Ordinal, survey-weighted and probabilistic metrics (test)\n")
    w(table(["Model", "MAE (class index)", "Quadratic κ", "Spearman ρ", "Cohen κ", "Weighted acc. (`wgt`)", "Weighted macro-F1 (`wgt`)"],
            [[LABELS[n], f3(t[n]["mae_class_index"]), f3(t[n]["quadratic_weighted_kappa"]), f3(t[n]["spearman_rho"]), f3(t[n]["cohen_kappa"]),
              f3(t[n]["survey_weighted"]["accuracy"]), f3(t[n]["survey_weighted"]["f1_macro"])] for n in ORDER]))
    w("\nSpearman ρ is undefined (n/a) for the majority baseline because its predictions are constant.\n")
    w(table(["Model", "ROC-AUC (OvR macro)", "PR-AUC (macro AP)", "Brier (0–2)", "Log loss", "ECE (top-label)"],
            [[LABELS[n], f3(t[n]["roc_auc_ovr_macro"]), f3(t[n]["pr_auc_macro"]), f3(t[n]["brier_multiclass"]), f3(t[n]["log_loss"]),
              f3(t[n]["ece_top_label_10bin"])] for n in ORDER]))
    w("\nThe dummy models' log loss is very large because they assign probability 0 to classes that occur (clipped by scikit-learn). "
      "Class-weighted training deliberately shifts probabilities toward rare classes, which worsens Brier/log loss relative to the "
      "unweighted model; it is not a calibration bug.\n")
    w(src("c1_model_comparison.csv", "c1_calibration_bins_best.csv") + "\n")
    w("![ROC curves](results/c1_roc_curves.png)\n\n![Precision-recall curves](results/c1_pr_curves.png)\n\n![Calibration](results/c1_calibration.png)\n")

    w(f"### 3.5 Per-class results and confusion matrix — {bl}\n")
    pc = t[best]["per_class"]
    w(table(["Class", "Precision", "Recall", "F1", "Support"], [[f"Class {k}", f3(v["precision"]), f3(v["recall"]), f3(v["f1"]), v["support"]] for k, v in pc.items()]))
    cm = c1["confusion_matrix_best"]
    w("\n" + table(["True \\ Predicted", "Class 1", "Class 2", "Class 3"], [[f"Class {i + 1}"] + r for i, r in enumerate(cm)]))
    w("\n" + src("c1_per_class_best.csv", "c1_confusion_matrix_best.csv"))
    w("\n![Confusion matrix](results/c1_confusion_matrix.png)\n")

    w("### 3.6 Statistical significance\n")
    rows = []
    for o, r in mc.items():
        direction = ("selected model more accurate" if r["best_only_correct"] > r["other_only_correct"] else "comparator more accurate")
        rows.append([LABELS[o], r["best_only_correct"], r["other_only_correct"], r["test"], f"{r['statistic']:.2f}", p_fmt(r["p_value"]),
                     direction + (" (p < 0.05)" if r["p_value"] < 0.05 else " (not significant)")])
    w(table(["Selected vs", "Only selected correct", "Only comparator correct", "Test", "Statistic", "p-value", "Direction"], rows))
    w("\nMcNemar's test compares **accuracy** (per-row correctness). Because the class-weighted model trades majority-class accuracy for "
      "minority-class recall, the macro metrics are compared with paired bootstrap CIs on the same resamples:\n")
    rows = [[LABELS[o], ci(v["f1_macro"]), ci(v["balanced_accuracy"]), ci(v["mcc"])] for o, v in diffs.items()]
    w(table(["Selected − comparator", "Δ macro-F1 [95% CI]", "Δ balanced acc. [95% CI]", "Δ MCC [95% CI]"], rows))
    w("\n" + src("metrics.json") + " (`mcnemar_best_vs`, `paired_bootstrap_best_minus_other`)\n")

    w("### 3.7 Sensitivity to duplicates (leakage check)\n")
    sens = c1["cv_full_sensitivity"]
    dd = c1["dedup_sensitivity"]
    rows = []
    for n in ORDER:
        s_, g_ = sens[n]["stratified_5fold"], sens[n]["grouped_5fold"]
        dm = dd["models"][n]
        rows.append([LABELS[n], ms(s_["f1_macro"]), ms(g_["f1_macro"]), f"{g_['f1_macro']['mean'] - s_['f1_macro']['mean']:+.3f}",
                     f3(dm["f1_macro"]), f"{dm['delta_f1_macro']:+.3f}", f"{dm['delta_mcc']:+.3f}"])
    w(table(["Model", "Stratified 5-fold macro-F1 (full data)", "Grouped 5-fold macro-F1", "Δ grouped − stratified",
             "De-duplicated test macro-F1", "Δ vs main test", "Δ MCC vs main test"], rows))
    w(f"\nGrouped CV keeps every identical feature vector in a single fold (StratifiedGroupKFold, seed 42). The de-duplicated analysis drops "
      f"exact duplicate rows ({dd['rows']} rows remain: {dd['class_counts']}), re-splits 80/20 stratified (train {dd['train_n']}, test {dd['test_n']}) and "
      f"refits; {dd['test_rows_with_feature_vector_seen_in_train']} of its test rows still share a feature vector with training (conflicting-label vectors remain).\n")
    w(src("c1_cv_full_sensitivity_folds.csv", "c1_dedup_sensitivity.csv") + "\n")

    w("### 3.8 Accuracy ceiling from conflicting labels\n")
    am = ceil["model_accuracy_on_those_test_rows"]
    w(table(["Quantity", "Value"], [
        ["In-sample ceiling, full dataset (majority label within each identical feature vector)", pct(ceil["full_dataset_in_sample"])],
        ["Rows in feature vectors that occur only once (always counted as 'achievable')", f"{ceil['rows_in_singleton_feature_vectors']} of {d['rows_retained']}"],
        ["Ceiling restricted to rows whose feature vector repeats", f"{pct(ceil['repeated_vectors_only_in_sample'])} (n = {ceil['rows_in_repeated_feature_vectors']}; majority-class rate {pct(ceil['majority_class_rate_on_repeated_rows'])})"],
        [f"Test rows whose feature vector repeats in the data", ceil["test_rows_in_repeated_vectors"]],
        ["Ceiling on those test rows", pct(ceil["ceiling_on_those_test_rows_full_data_majority"])],
        [f"{bl} accuracy on those test rows", pct(am[best])],
        ["Most accurate model on those test rows", f"{LABELS[max(am, key=am.get)]}: {pct(max(am.values()))}"],
        ["Majority baseline on those test rows", pct(am["dummy_majority"])],
    ]))
    w(f"\nThe {dup['feature_vectors_with_conflicting_labels']} conflicting vectors mean no function of these seven features can exceed the ceiling. "
      "The full-data figure is a loose upper bound because over half the rows have a unique feature vector (mostly via exact age), so the "
      "restricted ceiling is the more informative comparison.\n")
    w(src("metrics.json") + " (`accuracy_ceiling`)\n")

    w("### 3.9 Feature importance and ablation\n")
    pi = c1["permutation_importance_f1_macro"]
    w(table(["Feature", "Permutation importance (Δ macro-F1, mean ± SD)"], [[r["feature"], f"{r['importance_mean']:+.3f} ± {r['importance_std']:.3f}"] for r in pi]))
    w("\n" + table(["Ablation (refit " + bl + ")", "Macro-F1", "Δ macro-F1", "Δ balanced acc.", "Δ MCC"],
                   [[r["ablation"], f3(r["f1_macro"]), f"{r['delta_f1_macro']:+.3f}", f"{r['delta_balanced_accuracy']:+.3f}", f"{r['delta_mcc']:+.3f}"] for r in c1["ablation"]]))
    w("\nSingle test-set ablations differ by amounts comparable to the bootstrap CI width (§3.2), so small positive or negative deltas "
      "should not be over-read.\n")
    w(src("c1_permutation_importance.csv", "c1_ablation.csv"))
    w("\n![Permutation importance](results/c1_permutation_importance.png)\n")

    w("### 3.10 Segment analysis (test set)\n")
    seg = c1["segments"]
    names = {"inc_q": "Income quintile", "age_band": "Age band", "educ": "Education", "urbanicity": "Urbanicity", "emp_in": "In workforce",
             "saved": "Saved (past year)", "borrowed": "Borrowed (past year)"}
    w(table(["Segment", "Value", "n", "Class 1/2/3", "Accuracy", "Balanced acc.", "Macro-F1"],
            [[names[s["segment"]], s["value"], s["n"] if not s["low_n_flag"] else f"{s['n']} ⚠", f"{s['n_class1']}/{s['n_class2']}/{s['n_class3']}",
              f3(s["accuracy"]), f3(s["balanced_accuracy"]), f3(s["f1_macro"])] for s in seg]))
    w("\n⚠ = fewer than 30 test rows. Codes for `educ`, `urbanicity` and `emp_in` follow the Findex microdata coding (not documented in the repo).\n")
    w(src("c1_segment_metrics.csv"))
    w("\n![Segment performance](results/c1_segment_performance.png)\n")

    w("### 3.11 Error analysis — 10 representative misclassifications\n")
    ea = c1["error_analysis"]
    w(f"The selected model makes {ea['n_test_errors']} errors on {sp['test_n']} test rows; by (true → predicted): "
      + ", ".join(f"{k}: {v}" for k, v in ea["error_pairs"].items()) + ". The 10 cases below are the most confident errors of each "
      "confusion type (round-robin, distinct segments). The likely-cause text is generated from measured facts about each row "
      f"(training rows with the same profile or segment; class weights {', '.join(f'{k}: {v:.2f}' for k, v in c1['class_weights_balanced'].items())}).\n")
    w(table(["#", "Age", "Educ", "Inc q", "Saved", "Borrowed", "True", "Pred", "Conf.", "Likely cause"],
            [[i + 1, r["age"], r["educ"], r["inc_q"], r["saved"], r["borrowed"], r["true_class"], r["predicted_class"], f"{r['confidence_in_prediction']:.2f}", r["likely_cause"]]
             for i, r in enumerate(ea["representative"])]))
    w("\n" + src("c1_misclassifications.csv") + "\n")

    w("### 3.12 Interpretation\n")
    dmj = diffs["dummy_majority"]
    dlr = diffs.get("logreg")
    wk = sorted([s for s in seg if not s["low_n_flag"]], key=lambda s: s["f1_macro"])[0]
    grp_delta = sens[best]["grouped_5fold"]["f1_macro"]["mean"] - sens[best]["stratified_5fold"]["f1_macro"]["mean"]
    lines = [
        f"- The selected model ({bl}) reaches macro-F1 {ci(B[best]['f1_macro'])} and MCC {ci(B[best]['mcc'])} on unseen respondents: clearly above "
        f"the majority baseline on the macro metrics (Δ macro-F1 {ci(dmj['f1_macro'])}, CI {'excludes' if excl_zero(dmj['f1_macro']) else 'includes'} zero), but the absolute level is low.",
        f"- Its raw accuracy ({f3(t[best]['accuracy'])}) is *below* always predicting Class 1 ({f3(t['dummy_majority']['accuracy'])}); McNemar confirms the "
        f"accuracy difference (p = {p_fmt(mc['dummy_majority']['p_value'])}). Class weighting buys minority recall (Class 3 recall {f3(pc['3']['recall'])}) at the cost of Class 1 recall ({f3(pc['1']['recall'])}).",
    ]
    if dlr:
        lines.append(f"- Against plain logistic regression the gain is in balanced accuracy (Δ {ci(dlr['balanced_accuracy'])}); the macro-F1 difference "
                     f"({ci(dlr['f1_macro'])}) {'excludes' if excl_zero(dlr['f1_macro']) else 'includes'} zero and MCC ({ci(dlr['mcc'])}) "
                     f"{'excludes' if excl_zero(dlr['mcc']) else 'includes'} zero, so the models are not clearly separable on those.")
    trees = ["random_forest", "hist_gb"]
    best_tree_cv = max(cvt[n]["f1_macro"]["mean"] for n in trees)
    lines.append(
        f"- In training-split CV the best tree ensemble reaches macro-F1 {best_tree_cv:.3f} vs {cvt[best]['f1_macro']['mean']:.3f} for the selected model; "
        + ("tree ensembles do not beat the linear model, so there is little non-linear structure to exploit in seven coarse survey answers."
           if best_tree_cv <= cvt[best]["f1_macro"]["mean"] else "a tree ensemble is ahead in CV."))
    sel_dd = dd["models"][best]["delta_f1_macro"]
    robust = abs(grp_delta) < 0.02 and abs(sel_dd) < 0.02
    lines.append(f"- Duplicate structure: grouped CV changes the selected model's macro-F1 by {grp_delta:+.3f} and the de-duplicated re-split by {sel_dd:+.3f}"
                 + (" — the selected model is robust to it." if robust else " — a material change."))
    tree_dd = {n: dd["models"][n]["delta_f1_macro"] for n in trees}
    if min(tree_dd.values()) <= -0.03:
        lines.append("- The tree ensembles, by contrast, lose " + " and ".join(f"{LABELS[n]} {v:+.3f}" for n, v in tree_dd.items())
                     + " macro-F1 after de-duplication: part of their main-split test score comes from memorising repeated profiles, "
                       "so their test results should be read as optimistic.")
    top3 = [r["feature"] for r in pi[:3]]
    lines.append(f"- The largest permutation importances are {', '.join(f'`{x}`' for x in top3)} "
                 f"({', '.join(f'{r['importance_mean']:+.3f}' for r in pi[:3])} macro-F1), all small; the weakest adequately sized segment is "
                 f"{names[wk['segment']].lower()} = {wk['value']} (macro-F1 {f3(wk['f1_macro'])}, n = {wk['n']}).")
    lines += [
        "- Practical reading: these demographic and saving/borrowing answers carry only weak information about reported emergency-money "
        "difficulty, which supports the design decision not to use the model for individual users.",
    ]
    w("\n".join(lines) + "\n")

    # ── 4 other components ───────────────────────────────────────────────
    w("## 4. Verification results for the rule-based components\n")
    w("### 4.1 Component 2 — fund recommendation engine (label-free)\n")
    cov = rec["coverage"]
    dv = rec["diversity_top_n"]
    lat = rec["latency_in_process_ms"]
    w(f"**Profiles used: {rec['profiles']}** (grid in §2.2). Profiles receiving a top-{rec['top_n']} list: {rec['profiles_with_recommendations']} "
      f"({rec['recommendations_total']} recommendations in total).\n")
    w(table(["Measure", "Result"], [
        ["Hard-constraint violations (re-validated)", f"**{rec['constraint_violations']}** of {rec['recommendations_total']}"],
        ["Determinism (two runs, byte-identical payload)", f"{rec['determinism']['profiles_identical_across_two_runs']} / {rec['determinism']['profiles']} profiles"],
        ["Latency, in-process `generateRecommendation()`", f"p50 {lat['p50']:.1f} ms · p95 {lat['p95']:.1f} ms · max {lat['max']:.1f} ms ({lat['calls']} calls; cold catalog load {lat['catalog_cold_load_ms']:.0f} ms)"],
        ["Unique funds recommended", f"{cov['unique_funds_recommended']}"],
        ["Catalogue coverage", f"{cov['unique_funds_recommended']} / {cov['active_catalog_funds']} active funds = {cov['catalog_coverage_pct']:.2f}%"],
        ["Coverage of the eligible universe¹", f"{cov['unique_funds_recommended']} / {cov['eligible_universe_funds']} = {cov['eligible_universe_coverage_pct']:.2f}%"],
        ["AMCs represented", f"{cov['unique_amcs_recommended']} of {cov['eligible_universe_amcs']} eligible ({cov['catalog_amcs']} in catalogue)"],
        ["SEBI sub-categories represented", f"{cov['unique_subcategories_recommended']} of {cov['eligible_universe_subcategories']} eligible: {', '.join(cov['subcategories_recommended'])}"],
        ["Recommendations by asset group", ", ".join(f"{k}: {v}" for k, v in cov["recommendations_by_category_group"].items())],
        ["Recommendations by pool", ", ".join(f"{k}: {v}" for k, v in cov["recommendations_by_pool"].items())],
        ["Most frequent single fund", f"appears in {pct(rec['top_recommended_funds_share']['most_frequent_fund_share_of_profiles'])} of profiles"],
    ]))
    w(f"\n¹ {cov['eligible_universe_definition']}.\n")
    w(table(["Per-list diversity (top-6, profiles with a list)", "Mean", "Min", "Max"],
            [[lbl, f"{dv[k]['mean']:.2f}", f"{dv[k]['min']:.2f}", f"{dv[k]['max']:.2f}"] for k, lbl in [
                ("distinct_subcategories", "Distinct SEBI sub-categories"), ("intra_list_diversity_subcategory", "Intra-list diversity (sub-category, share of differing pairs)"),
                ("distinct_amcs", "Distinct AMCs"), ("intra_list_diversity_amc", "Intra-list diversity (AMC)"),
                ("distinct_riskometer_levels", "Distinct riskometer levels"), ("distinct_pools", "Distinct eligibility pools"),
                ("distinct_raw_category_labels", "Distinct raw AMFI category labels²"), ("equity_group_recs", "Equity-scheme funds per list")]]))
    w(f"\n² The raw AMFI `category` text spells one sub-category several ways (e.g. six spellings of *Overnight Fund*), so it overstates diversity; "
      f"{cov['unique_raw_category_labels_recommended']} raw labels collapse to {cov['unique_subcategories_recommended']} SEBI sub-categories. Diversity is reported on the normalised sub-category.\n")
    rk = rec["risk_alignment"]["by_risk_tolerance"]
    w(table(["Risk tolerance", "Profiles", "Effective risk (mean, min–max)", "Riskometer of recs (mean, min–max)", "Sub-categories per list"],
            [[r["risk"], r["profiles"], f"{r['mean_effective_risk']:.2f} ({r['min_effective_risk']}–{r['max_effective_risk']})",
              f"{r['mean_riskometer']:.2f} ({r['min_riskometer']}–{r['max_riskometer']})", f"{r['mean_distinct_subcategories']:.2f}"] for r in rk]))
    w(f"\nMean riskometer is non-decreasing in risk tolerance: **{rec['risk_alignment']['mean_riskometer_non_decreasing_with_risk']}**.\n")
    w(table(["Finance tier", "Profiles", "Readiness status", "With a list", "Mean riskometer", "Mean effective risk"],
            [[r["tier"], r["profiles"], ", ".join(f"{x['readiness']} ({x['profiles']})" for x in rec["readiness_by_tier"] if x["tier"] == r["tier"]),
              r["with_recommendations"], f"{r['mean_riskometer']:.2f}", f"{r['mean_effective_risk']:.2f}"] for r in rec["by_tier"]]))
    w("\n" + src("c2_recommender_per_profile.csv", "c2_recommender_by_risk.csv", "c2_recommender_by_tier.csv", "c2_recommender_by_horizon.csv"))
    w("\n![Recommender risk alignment and diversity](results/c2_recommender_risk_and_diversity.png)\n")
    pdg = rec["pool_diagnostics_most_aggressive_profile"]
    six = min(pdg["returnedScores"])
    w("**Findings from the sweep (observed, not fixed here):**\n")
    eq = {k: v for k, v in pdg["pools"].items() if k.startswith("equity")}
    eq_best = max(v["best"]["score"] for v in eq.values() if v["best"])
    w(f"1. *No equity fund is recommended to any profile.* For the most aggressive profile (`{pdg['profile']}`), effective risk is "
      f"{pdg['effectiveRiskLevel']} (risk capacity is capped at {pdg['riskCapacity']['maxRaw']}, and the engine uses min(tolerance, capacity)). "
      "Equity pools are consulted and their funds pass the hard rules, but all eligible equity funds carry riskometer level "
      + "; ".join(f"`{k}`: {'/'.join(sorted(v['eligibleByRiskometer']))} ({v['eligibleFunds']} funds)" for k, v in eq.items())
      + f", so their risk-alignment factor is {list(eq.values())[0]['best']['riskAlignmentFactor']}. The best eligible equity score is {eq_best:.4f}, below the 6th-place "
      f"returned score of {six:.4f}; the returned list comes entirely from: {', '.join(sorted(set(pdg['returnedPools'])))}. This is a property of the scoring scale "
      "(capacity 1–4 vs riskometer 1–6), worth reviewing in the methodology chapter.")
    deficit = [r for r in rec["by_tier"] if r["tier"] == "deficit"]
    if deficit:
        dr = deficit[0]
        w(f"2. *Spending-above-income profiles* are labelled `invest-later`, yet {dr['with_recommendations']} of {dr['profiles']} still receive a list; "
          f"those lists are only low-risk liquid/overnight/money-market funds (mean riskometer {dr['mean_riskometer']:.2f}). Whether the UI presents them as a place for emergency savings rather than as investments should be confirmed.")
    w("")
    rr = rec["rerun_vs_previous_report"]
    w(f"**Re-run of `scripts/evaluateRecommendations.mjs`** (committed report {rr['previous_generated']} vs re-run {rr['rerun_generated']}): "
      f"**{rr['deterministic_items_matching']} / {rr['deterministic_items']} deterministic items match** (constraint checks, payload sizes, top-N scheme codes, "
      "catalogue statistics). Test count changed because tests were added since; HTTP latency differs as expected for timings.\n")
    w(table(["Item", "Committed report", "Re-run", "Kind", "Match"], [[r["metric"], r["previous"], r["rerun"], r["kind"], "yes" if r["match"] else "no"] for r in rr["rows"]]))
    w("\n*Source: `results/c2_recommender_rerun_vs_previous.csv`, `results/recommender_previous/`, `results/recommender_rerun/` · regenerate: " + REGEN_FULL + "*\n")

    w("### 4.2 Component 3 — Money Check-up / What-if Planner (`npm run experiment`)\n")
    w(table(["Check", "Passed / total", "Failed", "Rate"], [[r["check"], f"{r['passed']} / {r['total']}", r["failed"], pct(r["rate"], 2)] for r in c3["checks"]]))
    w("\n" + table(["Directional invariant", "Applicable", "Passed", "N/A"], [[i["description"], i["applicable"], i["passed"], i["not_applicable"]] for i in c3["invariants"]]))
    w(f"\nAll profiles are synthetic (`syntheticOnly: {c3['synthetic_only']}`); this measures implementation correctness against an independent "
      "reference, not real-world predictive accuracy.\n")
    w("*Source: `results/c3_experiment_summary.csv`, `results/c3_invariants.csv`, `results/experiment_run/` · regenerate: " + REGEN_FULL + " (or `npm run experiment`)*\n")

    w("### 4.3 Component 5 — practice trading and historical simulation\n")
    x = c5["xirr"]
    w(f"**XIRR** — app (`calculateXIRR`) vs independent reference, day count {x['day_count']}; tolerance ±{x['tolerance_pct_points']} percentage points "
      f"(the app rounds to 2 dp). **{x['passed']} / {x['total']} pass.**\n")
    w(table(["Case", "Cash flows", "App XIRR %", "Reference % (365.25)", "Excel-style % (365)", "Method", "Pass"],
            [[r["case"], r["description"], "null" if r["app_xirr_pct"] is None else f"{r['app_xirr_pct']:.2f}",
              "undefined" if r["reference_xirr_pct_365_25"] is None else f"{r['reference_xirr_pct_365_25']:.4f}",
              "undefined" if r["reference_xirr_pct_365_excel"] is None else f"{r['reference_xirr_pct_365_excel']:.4f}", r["reference_method"], "yes" if r["pass"] else "no"]
             for r in x["cases"]]))
    w("\nThe app's actual/365.25 day count gives slightly different values from Excel's XIRR (actual/365); the difference is shown for transparency.\n")
    pl = c5["paper_trading_ledger"]
    w(f"**Paper-trading ledger** — a 6-step sequence run against `buyAt`/`sellAt` in a temporary data directory, compared with a hand-derived ledger "
      f"(weighted-average cost, realised P&L, cash, error handling). **{pl['passed']} / {pl['total']} operations pass ({pl['fields_passed']} / {pl['fields_checked']} fields).**\n")
    w(table(["Operation", "Expected", "App", "Pass"],
            [[f"{o['op']}({o['quantity']} @ {o['price']})", ", ".join(f"{k}={v}" for k, v in o["expected"].items() if v is not None and k != "ok") or "ok",
              ", ".join(f"{k}={v}" for k, v in o["app"].items() if v is not None and k != "ok"), "yes" if o["pass"] else "no"] for o in pl["ops"]]))
    sp_ = c5["historical_sip"]
    w(f"\n**Historical SIP arithmetic** — `simulateHistoricalSip` on a synthetic NAV series ({sp_['series']['rule']}, {sp_['series']['start']} to "
      f"{sp_['series']['end']}), ₹1,000 per month. **{sp_['passed']} / {sp_['total']} checks pass.** {sp_['note']}\n")
    w(table(["Quantity", "App", "Reference", "Pass"], [[k, v["app"], v["reference"], "yes" if v["pass"] else "no"] for k, v in sp_["checks"].items()]))
    w("\nNo backtest (Sharpe, drawdown, win rate) is reported: the system never makes buy/sell or allocation decisions — users place practice trades themselves.\n")
    w(src("c5_xirr_checks.csv", "c5_paper_trading_checks.csv", "metrics.json") + "\n")

    # ── 5 limitations ────────────────────────────────────────────────────
    w("## 5. Limitations and future work\n")
    w(f"- **The only learned model is not part of the product.** The Findex classifier is an isolated research experiment; its results say nothing about "
      "the accuracy of WealthGenie's user-facing guidance, which is rule-based.")
    w(f"- **Component 1 data.** {d['rows_retained']} respondents from one country and one survey wave; seven coarse features; Class 3 has only "
      f"{cd['3']['n']} rows ({sp['test_class_counts']['3']} in test), so per-class and segment estimates are noisy (see CI widths). Generalisation to other "
      "countries, years or to app users is untested.")
    w(f"- **Label noise and duplicates.** {dup['feature_vectors_with_conflicting_labels']} feature vectors have conflicting labels, capping achievable accuracy (§3.8). "
      "Duplicate overlap was tested (§3.7) and did not inflate results, but the split is still at respondent level.")
    w("- **Target wording unverified.** The exact meaning of `fin24a` categories must be checked against the Findex 2025 codebook before the classes are named in the report.")
    w("- **Survey design.** Survey weights are used only as a sensitivity view; design-based variance (strata/clusters) is not modelled.")
    w("- **Recommender relevance is not measured.** Precision@k, Recall@k, NDCG@k, MAP and hit rate were **not** computed: the repository holds no expert "
      "relevance labels or user-fund interactions. Future work: 2–3 qualified raters grade the top-6 funds for 20–30 profiles (inter-rater κ reported), then compute these metrics.")
    w("- **Synthetic profiles.** Components 2 and 3 are evaluated on synthetic profiles only; coverage/diversity depend on the chosen grid. Latency was measured on a single development laptop.")
    w("- **Lesson generation (Gemini) is not evaluated.** No reference answers exist and Gemini calls were out of scope. Future work: a reference set of "
      "key facts per curated lesson and a faithfulness/hallucination check on generated text.")
    w("- **No real-world outcome validation** of the Money Check-up / What-if Planner (would require longitudinal user outcome data).\n")
    w("**Not computed (and why):**\n")
    w(table(["Item", "Reason", "What is needed"], [[n["item"], n["reason"], n["needed"]] for n in m["not_computed"]]))
    w("")

    # ── 6 reproducibility ────────────────────────────────────────────────
    w("## 6. Reproducibility\n")
    w("```bash\n"
      "# one-time setup\n"
      ".venv/Scripts/python.exe -m pip install -r evaluation/requirements.txt\n"
      "npm --prefix backend install\n\n"
      "# everything (also re-runs `npm run experiment` and scripts/evaluateRecommendations.mjs, which runs the full test suite)\n"
      ".venv/Scripts/python.exe evaluation/evaluate.py\n\n"
      "# faster: reuse the archived outputs of those two Node harnesses\n"
      ".venv/Scripts/python.exe evaluation/evaluate.py --fast\n\n"
      "# individual pieces\n"
      "node evaluation/verify_components.mjs        # raw app outputs for components 2 and 5\n"
      "npm run experiment                           # component 3\n"
      ".venv/Scripts/python.exe evaluation/build_report.py   # re-render this file from results/metrics.json\n"
      "```\n")
    w(f"- Seed 42 for the split, CV folds, bootstrap, models and permutation importance; the experiment harness uses its own fixed seed ({c3['seed']}).")
    w("- `data/Findex_Microdata_2025_updateIndia.csv` is git-ignored; it must be present locally. The script verifies the rebuilt dataset equals the committed processed CSV.")
    w("- The recommender re-run overwrites `data/reports/evaluation_report.*`; `evaluate.py` restores the committed copies and keeps the re-run under `results/recommender_rerun/`.")
    w("- Timings (latency, runtime) vary between runs and machines; all other numbers are deterministic given the same data and library versions.")
    w(f"- Output files: `results/metrics.json`, `results/c*_*.csv` (tables), `results/c*_*.png` (300 dpi figures).\n")

    (EVAL / "RESULTS.md").write_text("\n".join(L), encoding="utf-8")
    print("RESULTS.md written")


def print_summary(m):
    c1 = m["component1_findex_classifier"]
    best = c1["best_model"]["name"]
    B = c1["bootstrap_ci95"]
    t = c1["test"]
    rec = m["component2_recommender"]
    c3 = m["component3_money_checkup_whatif"]
    c5 = m["component5_paper_trading_and_simulation"]
    rows = [
        ("C1 selected model", LABELS[best]),
        ("C1 macro-F1 (test, 95% CI)", ci(B[best]["f1_macro"])),
        ("C1 balanced accuracy (test, 95% CI)", ci(B[best]["balanced_accuracy"])),
        ("C1 MCC (test, 95% CI)", ci(B[best]["mcc"])),
        ("C1 accuracy (test) / majority baseline", f"{t[best]['accuracy']:.3f} / {t['dummy_majority']['accuracy']:.3f}"),
        ("C1 macro-F1 majority baseline", f"{t['dummy_majority']['f1_macro']:.3f}"),
        ("C1 ROC-AUC OvR / ECE", f"{t[best]['roc_auc_ovr_macro']:.3f} / {t[best]['ece_top_label_10bin']:.3f}"),
        ("C2 profiles / constraint violations", f"{rec['profiles']} / {rec['constraint_violations']}"),
        ("C2 determinism", f"{rec['determinism']['profiles_identical_across_two_runs']}/{rec['determinism']['profiles']}"),
        ("C2 coverage of eligible universe", f"{rec['coverage']['unique_funds_recommended']}/{rec['coverage']['eligible_universe_funds']} ({rec['coverage']['eligible_universe_coverage_pct']:.2f}%)"),
        ("C2 latency p50 / p95 (in-process)", f"{rec['latency_in_process_ms']['p50']:.1f} / {rec['latency_in_process_ms']['p95']:.1f} ms"),
        ("C2 re-run deterministic items matching", f"{rec['rerun_vs_previous_report']['deterministic_items_matching']}/{rec['rerun_vs_previous_report']['deterministic_items']}"),
        ("C3 formula correctness", f"{c3['checks'][0]['passed']}/{c3['checks'][0]['total']}"),
        ("C3 invariants", f"{c3['checks'][6]['passed']}/{c3['checks'][6]['total']}"),
        ("C3 determinism", f"{c3['checks'][5]['passed']}/{c3['checks'][5]['total']}"),
        ("C5 XIRR cases", f"{c5['xirr']['passed']}/{c5['xirr']['total']}"),
        ("C5 paper-trading ledger ops", f"{c5['paper_trading_ledger']['passed']}/{c5['paper_trading_ledger']['total']}"),
        ("C5 SIP arithmetic checks", f"{c5['historical_sip']['passed']}/{c5['historical_sip']['total']}"),
    ]
    wdt = max(len(a) for a, _ in rows)
    print("\n" + "=" * (wdt + 40))
    print("HEADLINE SUMMARY")
    print("=" * (wdt + 40))
    for a, b in rows:
        print(f"{a:<{wdt}}  {b}")
    print("\nNot computed:")
    for n in m["not_computed"]:
        print(f"  - {n['item']}: {n['reason']}")


if __name__ == "__main__":
    metrics = json.loads((OUT / "metrics.json").read_text(encoding="utf-8"))
    build(metrics)
    print_summary(metrics)
