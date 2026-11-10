# Research Gap Analysis — Phase 5

**Status:** Evidence-supported gap analysis for WealthGenie. This document does
not report new empirical results. It identifies questions that the reviewed
literature does not answer, states how confident we are that each gap exists,
and records counter-evidence. It is not a claim that no prior work exists. **No
external expert review and no user study were performed for this phase.**

> **Terminology.** A **feature gap** is something the product does not yet do. A
> **research gap** is a question that the reviewed literature does not answer, or
> answers only partially, and that matters for the project's claims. This
> document is about research gaps. It does not recommend adding product features.

---

## 1. Purpose

Phase 4 produced implementation-consistency evidence for the deterministic
assessment and Digital Twin. Those results are not independent external
validation and do not establish real-world effectiveness. Phase 5 asks:

- What does the literature already establish?
- What remains unknown?
- Which unknowns matter for WealthGenie's claims?
- Which unknowns can be reduced by software tests, expert review, user studies,
  or field evidence?

The answers determine what the project can defensibly claim now, and what it
must not claim until further evidence exists.

---

## 2. Method and criteria

### 2.1 How gaps were identified

A candidate gap was accepted only if:

1. it is supported by at least two sources, or by one authoritative review plus
   a direct source;
2. it is a question about evidence, measurement, or evaluation, not merely a
   missing feature;
3. it can be investigated with a defined study or audit;
4. it is relevant to WealthGenie's actual scope;
5. a counter-evidence search did not show that the question is already settled.

### 2.2 Confidence levels

| Level | Meaning |
| --- | --- |
| High | Multiple reviews or consistent direct evidence; the gap is unlikely to be an artefact of the search. |
| Moderate | Some direct evidence, but heterogeneous, indirect, or context-specific. |
| Low | Plausible but thin; the gap may close with a small amount of new evidence. |

Confidence is about **whether the gap exists**, not about whether closing it
would produce a positive result. A high-confidence gap can coexist with low
confidence that WealthGenie's current design is beneficial.

### 2.3 Counter-evidence rule

For every gap, this document asks: what would weaken the gap claim? Examples
include commercial tools that already do this, published benchmarks outside the
searched databases, or studies showing that the proposed benefit does not
materialise. Counter-evidence is reported even when it does not change the
conclusion.

---

## 3. Gap 1 — Auditing deterministic household recommendation rules

### 3.1 What is known

- XAI research in finance is concentrated on explaining black-box models for
  credit, fraud, and trading (Černevičienė & Kabašinskas, 2024).
- Robo-advisor audits evaluate risk profiling, portfolios, fees, and advice
  quality, and find meaningful variation (Tertilt & Scholz, 2018; Beketov,
  Lehmann, & Wittke, 2018).
- Human-advice audits show that advisers can reinforce biases and recommend
  higher-fee products (Mullainathan, Nöth, & Schoar, 2012).
- Phase 4 evaluates exact rule agreement, severity agreement, comparison
  correctness, and explanation-field coverage.

### 3.2 What is missing

This review did not identify a peer-reviewed, reproducible benchmark for a
deterministic household recommendation engine that combines:

- exact agreement with documented rules;
- boundary behaviour at thresholds;
- explanation traceability;
- threshold sensitivity;
- expert-judged appropriateness;
- harm analysis;
- user comprehension.

Phase 4's metrics are necessary but not sufficient. A recommendation can fire
exactly as specified and still be unhelpful, inappropriate, or harmful.

### 3.3 Why it matters

"Recommendation correctness" is ambiguous. It can mean:

- the code implements the rule as written;
- the rule is financially sound;
- the rule is appropriate for this user;
- the user understands and can act on it.

Phase 4 answers the first question. It does not answer the other three.

### 3.4 Confidence

**High** that the evaluation gap exists. **Moderate** that it is a research
contribution rather than routine engineering quality assurance. The distinction
matters for how the project describes its contribution.

### 3.5 Counter-evidence

- Software testing and audit are standard engineering practices; a reviewer may
  argue that a reference suite is not a research contribution.
- Commercial robo-advisors and financial-planning tools may have internal audit
  processes that are not published.
- Some regulatory or industry benchmarks may exist outside the searched
  literature.

**Positioning response:** describe the contribution as an **evaluation
protocol and evidence artifact**, not as the invention of testing. Do not claim
that no one has ever audited a rule-based financial tool.

### 3.6 What would reduce the gap

- A published, hand-derived reference suite with expected outcomes.
- An expert-reviewed rubric for recommendation appropriateness.
- A threshold-sensitivity analysis showing which recommendations change under
  plausible alternative thresholds.
- A user study showing that users can understand and act on the explanations.

---

## 4. Gap 2 — Individual-level, actionable resilience assessment

### 4.1 What is known

- Financial resilience is multidimensional and context-dependent; there is no
  single accepted definition or measure (Salignac, Marjolin, Reeve, & Muir,
  2019; Tahir & Richards, 2025).
- Population surveys measure resilience with items such as the ability to raise
  emergency money or cover expenses after income loss (World Bank, 2025; OECD,
  2026).
- Klapper and Lusardi (2020) examine the relationship between financial literacy
  and financial resilience across countries; the evidence is largely
  cross-sectional.

### 4.2 What is missing

This review did not identify peer-reviewed evidence on a transparent,
individual-level calculator that:

- maps specific levers (income, expenses, savings, EMI, shocks, goal
  contributions) to a bounded set of indicators;
- discloses its formulas, assumptions, and thresholds;
- has been checked against independently derived expected outcomes;
- has been assessed for usefulness by ordinary users.

Commercial budgeting apps and calculators exist. The gap is peer-reviewed
evaluation, not the existence of the feature.

### 4.3 Why it matters

Population estimates tell a policymaker about a population. They do not tell an
individual what to change. A calculator can bridge that gap, but it can also
create false precision or imply that a single ratio measures resilience.

### 4.4 Confidence

**High** that the measurement gap exists. **Moderate** that the tool-evaluation
gap is unresolved, because commercial tools and grey literature may cover part
of it.

### 4.5 Counter-evidence

- Budgeting apps, emergency-fund calculators, and credit-counselling tools are
  widespread.
- Some may have been evaluated internally or in unpublished reports.
- Findex and OECD instruments already provide established population measures;
  one could argue that individual calculators are an engineering convenience,
  not a research problem.

**Positioning response:** do not claim to measure resilience. Describe the
indicators as construct-specific operationalizations. The research question is
whether they are correct, transparent, and useful, not whether they replace
established resilience instruments.

### 4.6 What would reduce the gap

- A mapping between each indicator and the construct it is intended to inform.
- Expert review of construct validity.
- A user study showing that the indicators are understood as intended.
- Evidence that changes in the indicators correspond to changes in validated
  resilience or well-being measures.

---

## 5. Gap 3 — Incremental value of interactive scenario simulation

### 5.1 What is known

- Goals-based optimization can improve goal attainment under explicit models
  (Das, Ostrov, Radhakrishnan, & Srivastav, 2020).
- Probabilistic planning can model family financial decisions and is argued to
  be more explainable than some linear-programming approaches (Rao & Yang,
  2022).
- Robo-advisors provide automated planning and investment management, with
  variable quality and access effects (Beketov et al., 2018; Tertilt & Scholz,
  2018; Reher & Sokolinski, 2024).

### 5.2 What is missing

This review did not identify direct evidence that **interactive what-if
simulation**, by itself, adds decision-support value over a **static
assessment** for non-expert users. The missing evidence includes:

- whether users make better decisions with scenario controls;
- whether they understand trade-offs better;
- whether interactivity increases confidence, overconfidence, or cognitive load;
- whether it changes behaviour after the session;
- which user segments benefit or are harmed.

### 5.3 Why it matters

Interactivity is the Digital Twin's main differentiator. Without evidence, it is
a capability claim, not a benefit claim. The effect could be positive, neutral,
or negative.

### 5.4 Confidence

**High** that the direct evidence is missing. **Low** that interactivity is
beneficial. The literature supports the value of optimization under models, not
the value of a simple interactive calculator for beginners.

### 5.5 Counter-evidence

- Simulation and optimization can improve goal attainment in model-based
  settings (Das et al., 2020).
- Some educational tools use interactive examples effectively, but this review
  did not identify a study of a comparable household-finance tool.
- Interactivity could increase engagement, but engagement is not the same as
  better decisions.

**Positioning response:** compare A and B on capabilities, not outcomes. State
that the incremental decision-support value is an open empirical question.

### 5.6 What would reduce the gap

- A randomized within-subject or between-subject study with A (static) and B
  (static + Twin) conditions.
- Pre-specified decision-quality, comprehension, and trust-calibration outcomes.
- Process data on scenario use.
- A follow-up measuring whether decisions are implemented.

---

## 6. Gap 4 — User-validated transparency for low-literacy beginners

### 6.1 What is known

- XAI methods can explain complex models, but technical explanation is not the
  same as user comprehension (Černevičienė & Kabašinskas, 2024).
- Robo-advisor risk questionnaires vary in length and relevance (Tertilt &
  Scholz, 2018).
- Financial well-being is partly subjective and multidimensional (Netemeyer,
  Warmath, Fernandes, & Lynch, 2018; Brüggen, Hogreve, Holmlund, Kabadayi, &
  Löfgren, 2017).

### 6.2 What is missing

This review did not identify evidence on which explanation formats work for
Indian beginners with low financial literacy. Specific unknowns:

- formula versus plain-language versus worked-example versus visual formats;
- how much detail is useful before it becomes noise;
- whether showing assumptions increases trust or confusion;
- whether explanations reduce or increase overconfidence;
- how users interpret heuristic thresholds;
- how language and numeracy affect comprehension.

### 6.3 Why it matters

WealthGenie exposes formulas, inputs, assumptions, and thresholds. Presence is
not comprehension. If users do not understand the explanations, transparency is
a technical property rather than a user benefit.

### 6.4 Confidence

**High** that user validation is missing. **Moderate** about which formats are
likely to work; the general XAI and risk-communication literatures provide
hypotheses but not a definitive answer for this context.

### 6.5 Counter-evidence

- General XAI user studies and risk-communication research exist, but they are
  not specific to household financial calculators in India.
- Some users may prefer formulas; others may prefer examples. A single format
  may not fit all.
- More explanation can increase cognitive load.

**Positioning response:** describe explanations as **designed for
traceability**, not as proven to improve comprehension or trust. Test formats in
a user study.

### 6.6 What would reduce the gap

- A comprehension study with matched explanation formats.
- Measures of objective understanding, confidence calibration, and preference.
- Stratification by literacy, numeracy, income, and language.
- A follow-up testing whether comprehension predicts action.

---

## 7. Gap 5 — India-specific evidence

### 7.1 What is known

- Findex 2025 includes India in its global sample and reports financial-health
  and resilience indicators.
- Kumar, Pillai, Kumar, and Tabash (2023) study digital financial literacy,
  capability, autonomy, and well-being in Delhi/NCR (N = 512).
- Bhat, Lone, Sivakumar, and Krishna (2025) study digital financial literacy and
  well-being among Indian students (N = 475).
- The project's own `docs/INDIAN_FINANCIAL_CONTEXT.md` documents India-specific
  instruments and conventions.

### 7.2 What is missing

This review did not identify peer-reviewed evidence on:

- how Indian beginners use a deterministic assessment and Digital Twin;
- comprehension across Hindi, English, and other languages;
- regional, income, gender, and education differences in tool use;
- whether the 3-month and 40% thresholds fit Indian household contexts;
- whether the tool changes decisions or outcomes in India.

### 7.3 Why it matters

The product is India-specific. Evidence from the United States, Korea, or global
surveys may not transfer. Digital access, household structure, informal
borrowing, gold, chit funds, and family transfers are context-specific.

### 7.4 Confidence

**Moderate.** There is growing India-specific digital-financial-literacy
evidence, but it is not tool-specific and often uses student or urban samples.

### 7.5 Counter-evidence

- Findex provides India data on account ownership, digital payments, and
  resilience.
- Kumar et al. and Bhat et al. provide India-specific samples.
- The absence of tool-specific evidence does not mean the tool is inappropriate;
  it means the claim is untested.

**Positioning response:** state that the design is India-first, but do not claim
representativeness or cultural validation without a stratified study.

### 7.6 What would reduce the gap

- A stratified user study across income, education, gender, and region.
- Language-localized materials and comprehension testing.
- Expert review by Indian practitioners.
- A field pilot with Indian households.

---

## 8. Gap 6 — Threshold justification and calibration

### 8.1 What is known

- WealthGenie uses two heuristic thresholds: 3 months of mandatory-outflow
  coverage and 40% EMI burden.
- Findex uses two months as a survey benchmark for resilience; this is a
  measurement choice, not a prescription (World Bank, 2025).
- The literature reviewed here does not establish universal values for
  debt-to-income or EMI-burden thresholds.
- Lender and regulator practice is outside the scope of this review.

### 8.2 What is missing

- Empirical or expert justification for the default thresholds.
- Sensitivity analysis showing which recommendations change under plausible
  alternatives.
- Calibration by income, household size, employment stability, and dependants.
- Harm analysis: false alarms, missed risks, and discouraged users.
- Evidence on how users interpret threshold-based messages.

### 8.3 Why it matters

Recommendations depend on thresholds. A default that is too strict can create
unnecessary alarm; a default that is too loose can miss real risk. Calling a
threshold a "heuristic" is honest but does not establish that it is appropriate.

### 8.4 Confidence

**High** that justification is missing. **Moderate** about what the right values
would be; they are likely context-dependent.

### 8.5 Counter-evidence

- Rules of thumb are widely used in personal finance and can be useful even
  without universal validity.
- Some regulators or lenders publish debt-service ratios that could inform
  defaults.
- Users can adjust thresholds if the interface allows it.

**Positioning response:** keep thresholds configurable, label them as
heuristics, and report sensitivity. Do not present them as universal standards.

### 8.6 What would reduce the gap

- Expert review with a structured threshold-appropriateness rubric.
- Sensitivity analysis across a plausible range.
- A user study on comprehension and reaction to threshold messages.
- Calibration against validated resilience or hardship outcomes, if data become
  available.

---

## 9. Gap 7 — Real-world outcome validation

### 9.1 What is known

- Financial education interventions explain only about 0.1% of the variance in
  downstream behaviours, with weaker effects in low-income samples (Fernandes,
  Lynch, & Netemeyer, 2014).
- Financial education effects are positive but heterogeneous, and weaker for
  low-income clients and low-income economies (Kaiser & Menkhoff, 2017).
- The evidence on programme effectiveness is described as "rather
  disappointing" in one review (Stolper & Walter, 2017).
- Klapper and Lusardi (2020) examine the literacy–resilience relationship across
  countries.
- Digital financial literacy is associated with well-being in Korea and India
  (Choung, Chatterjee, & Pak, 2023; Kumar et al., 2023; Bhat et al., 2025).

### 9.2 What is missing

- Longitudinal evidence that using WealthGenie improves financial behaviour,
  resilience, or well-being.
- Causal identification: selection, reverse causality, and omitted variables.
- Evidence on adverse effects: overconfidence, false precision, discouragement,
  or harmful recommendations.
- Evidence on who benefits and who does not.
- Evidence on persistence after the tool is no longer used.

### 9.3 Why it matters

The strongest claims—improved outcomes, trust, literacy, resilience, or
well-being—require this evidence. Without it, those claims are unsupported.

### 9.4 Confidence

**High** that the evidence is missing. **Low** that the effect of this specific
tool would be positive and large. The literature suggests modest, heterogeneous
effects for education and advice.

### 9.5 Counter-evidence

- Some financial-education interventions do improve behaviour, especially
  just-in-time interventions (Fernandes et al., 2014; Kaiser & Menkhoff, 2017).
- Digital tools can reduce transaction costs and improve access (Findex, 2025).
- A tool may have value even if it does not change long-term outcomes, for
  example by improving comprehension in the moment.

**Positioning response:** do not claim outcome improvements. Describe the tool as
educational and exploratory. If outcome claims are needed later, run a
longitudinal or randomized study.

### 9.6 What would reduce the gap

- A pre-post pilot with a comparison group.
- A randomized field trial with validated outcome measures.
- Follow-up at 3, 6, and 12 months.
- Adverse-event monitoring.
- Pre-registration and an analysis plan.

---

## 10. What is not a gap

It is important not to inflate the gaps. The following are **not** research
gaps in the sense used here:

| Statement | Why it is not a gap |
| --- | --- |
| "No deterministic financial calculator exists." | Budgeting apps and calculators are widespread. |
| "No robo-advisor exists." | Robo-advisors are a mature industry (Fisch et al., 2019; Reher & Sokolinski, 2024). |
| "No XAI methods exist." | XAI in finance is a substantial literature (Černevičienė & Kabašinskas, 2024). |
| "No financial-literacy content exists." | There is a large education literature (Lusardi & Mitchell, 2014; Fernandes et al., 2014). |
| "No goals-based optimization exists." | Goals-based wealth management is established (Brunel, 2011; Das et al., 2020). |
| "No one has ever tested a budget rule." | Software testing and audit are standard; the gap is a published, independent, multi-method evaluation for this class of tool. |

The gaps are about **evidence, evaluation, and positioning**, not about the mere
existence of features.

---

## 11. Positioning table

| Prior work | What it establishes | What it does not establish | WealthGenie position | Gap status |
| --- | --- | --- | --- | --- |
| XAI in finance (Černevičienė & Kabašinskas, 2024) | Methods for explaining black-box credit, fraud, and trading models | How to explain deterministic household rules to beginners | Rule-based transparency; no post-hoc XAI | Evaluation gap: explanation comprehension |
| Robo-advice (Fisch et al., 2019; Beketov et al., 2018; Tertilt & Scholz, 2018; Reher & Sokolinski, 2024) | Automation, lower cost, variable quality, access effects | That automation improves household outcomes or inclusion | Deterministic, no-minimum, educational | No quality or inclusion claim |
| Human-advice audit (Mullainathan et al., 2012) | Advisers can reinforce biases and recommend higher-fee products | That rules are unbiased or optimal | Transparent rules; no commissions | Rules can encode bias; expert review needed |
| Resilience measurement (Salignac et al., 2019; Tahir & Richards, 2025; World Bank, 2025; OECD, 2026) | Multidimensional constructs; population estimates; no single accepted measure | That a single ratio measures resilience or predicts individual outcomes | Multiple indicators; scenario comparison | Measurement gap: construct validity |
| Goals-based planning (Brunel, 2011; Das et al., 2020; Rao & Yang, 2022) | Optimization and probabilistic planning can improve goal attainment under models | That simple interactive what-if simulation improves beginner decisions | Deterministic projection; no returns | Decision-support gap: interactivity |
| Financial education (Lusardi & Mitchell, 2014; Fernandes et al., 2014; Kaiser & Menkhoff, 2017; Stolper & Walter, 2017) | Literacy matters; education effects are modest and heterogeneous | That using this tool improves literacy or behaviour | Literacy content plus calculator | No literacy or behaviour-change claim |
| Digital financial literacy (Choung et al., 2023; Kumar et al., 2023; Bhat et al., 2025) | DFL is associated with well-being, including in India | That a specific tool improves well-being; causality | India-first, transparent | No well-being claim; India study needed |

---

## 12. Confidence and counter-evidence summary

| Gap | Confidence that the gap exists | Key sources | Counter-evidence | What would change the assessment |
| --- | --- | --- | --- | --- |
| Auditing deterministic household rules | High | Černevičienė and Kabašinskas (2024); Tertilt and Scholz (2018); Mullainathan et al. (2012); Phase 4 | Testing is standard engineering; unpublished audits may exist | A published benchmark or regulatory standard would reduce the gap |
| Individual-level actionable resilience assessment | High (measurement); Moderate (tool) | Salignac et al. (2019); Tahir and Richards (2025); World Bank (2025); OECD (2026) | Commercial calculators exist | A validated individual measure or published tool evaluation would reduce the gap |
| Incremental value of interactive simulation | High (evidence missing); Low (benefit) | Das et al. (2020); Rao and Yang (2022); Reher and Sokolinski (2024) | Model-based optimization can improve goal attainment | A randomized A/B study showing benefit, no effect, or harm would close the gap |
| User-validated transparency | High | Černevičienė and Kabašinskas (2024); Tertilt and Scholz (2018) | General XAI user studies exist | A validated explanation format for this context would reduce the gap |
| India-specific evidence | Moderate | World Bank (2025); Kumar et al. (2023); Bhat et al. (2025) | Growing DFL literature; Findex India data | A representative India study would reduce the gap |
| Threshold justification | High (justification); Moderate (values) | World Bank (2025); OECD (2026); practice variation | Rules of thumb are widely used | Expert consensus or calibration evidence would reduce the gap |
| Real-world outcome validation | High (evidence missing); Low (positive effect) | Fernandes et al. (2014); Kaiser and Menkhoff (2017); Stolper and Walter (2017) | Some interventions work | A longitudinal or randomized field study would close the gap |

---

## 13. Implications for claims

### 13.1 Strongest defensible claim

> WealthGenie implements a deterministic financial assessment and Digital Twin
> that compute a bounded set of household indicators, compare a baseline with a
> user-specified scenario, and expose formulas, inputs, assumptions, and
> heuristic thresholds. An evaluation against a separately implemented reference
> on synthetic profiles found implementation consistency and explanation-field
> coverage. These results do not establish real-world effectiveness.

### 13.2 Claims that are not supported

| Claim | Why it is unsupported | What would support it |
| --- | --- | --- |
| "Improves financial outcomes" | No outcome data; education effects are modest | Longitudinal or randomized field study |
| "Increases financial resilience" | Resilience is multidimensional; no validated individual measure | Validated resilience measure plus longitudinal design |
| "Improves financial literacy" | No literacy test; education effects are modest and heterogeneous | Pre-post literacy assessment with comparison |
| "Increases trust" | Trust is not measured; explanation presence is not trust | Validated trust and comprehension study |
| "Reduces financial stress" | No well-being measure; stress is multidimensional | Validated well-being scale plus study |
| "Personalized advice" | Rule-based educational feedback, not regulated advice | Expert review and regulatory assessment |
| "Validated" | No external expert review or independent outcome study | Expert review plus independent replication |
| "Optimal" | The model is deterministic and does not optimize | Optimization study with explicit objective |
| "First" or "novel" | No systematic priority search | A systematic review and priority claim |

### 13.3 Wording guidance

**Use:**

- "computes", "shows", "compares", "explains", "provides";
- "designed to support", "intended to help";
- "implementation-consistency evidence";
- "heuristic threshold";
- "estimate, not prediction";
- "educational, not financial advice";
- "not externally validated";
- "no user study was conducted".

**Avoid:**

- "improves", "increases", "builds", "empowers", "ensures";
- "trusted", "validated", "proven", "optimal", "personalized advice";
- "first", "novel", "state-of-the-art";
- "financial resilience score" without qualification;
- "AI-powered advice" when describing the deterministic engine.

### 13.4 Contribution framing

The defensible contributions are:

1. **Implementation:** a deterministic Financial Digital Twin with explicit
   formulas, inputs, assumptions, thresholds, and null-propagation rules.
2. **Evaluation artifact:** a reproducible harness with a separately implemented
   reference, synthetic edge cases, scenario cases, and manifest-verified
   artifacts.
3. **Evidence:** implementation-consistency and explanation-field coverage
   results across 1,642 synthetic results.
4. **Protocol:** a validation design that separates software correctness, expert
   content validity, user comprehension, and longitudinal outcomes.

These are contributions to **transparency and evaluation**, not to predictive
modelling or proven intervention effectiveness.

---

## 14. Summary

- The literature establishes that financial resilience is multidimensional,
  that population resilience gaps are large, that financial education effects
  are modest and heterogeneous, and that advice quality varies.
- The literature does **not** establish that a deterministic household
  calculator improves outcomes, trust, literacy, resilience, or well-being.
- The most important gaps for WealthGenie are: independent rule audit,
  individual-level construct validity, incremental value of interactive
  simulation, user-validated transparency, India-specific evidence, threshold
  justification, and real-world outcome validation.
- The strongest defensible position is a transparent, deterministic,
  educational scenario-exploration tool with implementation-consistency
  evidence and a pre-specified validation agenda.
- The weakest defensible position is any claim of improved outcomes, trust,
  literacy, resilience, or well-being without new evidence.

The next document, `docs/VALIDATION_PROTOCOL.md`, turns these gaps into research
questions, an independent reference suite, expert-review and user-study
protocols, an A/B capability comparison, and a prioritized empirical plan.

Full bibliographic details for all works cited here are in
`docs/LITERATURE_REVIEW.md` §13.
