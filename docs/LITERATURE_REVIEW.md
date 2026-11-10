# Literature Review — Phase 5

**Status:** Research synthesis for WealthGenie. This document reviews published
work; it does not report new empirical results. Phase 4 results are
implementation-consistency evidence, not independent external validation. **No
external expert review and no user study were performed for this phase.**

> **Reading-depth convention.** "Full text" means the substantive text was read.
> "Executive summary" means the report's executive summary was read, not the
> full report. "Abstract" means the abstract and bibliographic metadata were
> read. "Metadata only" means the bibliographic record (and, where noted, the
> reference list) was read, without the abstract or full text. Claims in this
> review are limited to the depth actually read. Every DOI was checked against
> Crossref and/or OpenAlex on 27 October 2026. No citation is fabricated.

---

## 1. Purpose and scope

WealthGenie combines three things:

1. a deterministic financial assessment that computes household indicators from
   income, expenses, savings, EMI, shocks, and goal inputs;
2. a Financial Digital Twin that recalculates a baseline and a user-modified
   scenario, compares them, and explains every metric and recommendation;
3. an AI tutor for financial-literacy content, separate from the deterministic
   assessment engine.

Phase 4 evaluated the deterministic engine against a separately implemented
reference on synthetic profiles. Phase 5 asks a different question: how should
the project be positioned relative to existing research, and what evidence would
be required before making stronger claims?

This review covers five literatures:

- explainable financial decision support;
- personal financial resilience assessment;
- goal-based planning and what-if simulation;
- evaluation of rule-based financial recommendations;
- financial literacy and digital financial well-being.

The review has four outputs:

- a synthesis of what is established, contested, and missing;
- a literature matrix with methods, data, metrics, limitations, and relevance;
- a reading-depth and verification record;
- implications for WealthGenie's claims and for the validation protocol in
  `docs/VALIDATION_PROTOCOL.md`.

**What this review is not.** It is not a PRISMA systematic review, not a
meta-analysis, and not a substitute for expert review or user research. It is a
purposive review designed to support a defensible research position.

---

## 2. Review method

### 2.1 Search strategy

The review started from four seed references supplied for the project:

- Černevičienė and Kabašinskas (2024) on explainable AI in finance;
- OECD/INFE (2026) on measuring financial literacy, inclusion, and well-being;
- the World Bank Global Findex 2025 report;
- Tahir and Richards (2025) on financial resilience.

Discovery used OpenAlex and Crossref, with publisher or author pages consulted
through `r.jina.ai` when direct access was blocked. Search terms were grouped by
theme:

| Theme | Representative queries |
| --- | --- |
| Explainable decision support | explainable artificial intelligence finance; XAI finance systematic review; robo-advisor advice quality; financial advice audit |
| Resilience assessment | financial resilience measurement; financial resilience framework; financial literacy financial resilience; digital financial literacy resilience |
| Goal-based planning | goals-based wealth management; dynamic portfolio allocation goals; personal financial planning simulation; probabilistic financial planning |
| Rule-based recommendations | rule-based financial advice; financial advice quality; robo-advisor risk profiling; financial education meta-analysis |
| Literacy and well-being | financial literacy financial well-being; digital financial literacy; financial capability; financial well-being scale |

Snowballing was used in both directions: reference lists of included papers and
citing works. The search was purposive rather than exhaustive.

### 2.2 Inclusion and exclusion

**Included:**

- peer-reviewed journal articles, scholarly books or chapters, and major
  institutional reports;
- English-language work;
- work published mainly between 2011 and 2026, with older foundational work
  where needed;
- direct relevance to at least one of the five themes.

**Excluded:**

- vendor white papers, blogs, marketing material, and unverifiable preprints;
- studies with no accessible bibliographic metadata;
- pure investment-performance studies with no relevance to household decision
  support;
- duplicate records and conference abstracts without sufficient detail.

### 2.3 Verification and reading depth

Every DOI was resolved through Crossref and/or OpenAlex. Publication years were
resolved to the print/issue year where the online-first and issue years differ.
For example, Klapper and Lusardi is cited as 2020 (Financial Management 49(3)),
Lusardi, Hasler, and Yakoboski as 2021 (Mind & Society 20(2)), Kumar et al. as
2023 (Borsa Istanbul Review 23(1); online 2022), and Bhat et al. as 2025
(International Journal of Bank Marketing 43(3); online 2024).

Reading depth is recorded in Table 2. Several publisher pages were unavailable
or rate-limited. Where only metadata or an abstract was available, the review
does not attribute detailed findings to that paper.

### 2.4 Limitations of this review

1. **Single reviewer.** There was no dual screening or independent coding.
2. **Not exhaustive.** OpenAlex and Crossref coverage is broad but incomplete;
   some relevant work in books, Indian journals, or non-English sources may be
   missing.
3. **English-language bias.** Non-English evidence, especially India-specific
   work, is under-represented.
4. **Paywalls and rate limits.** Some full texts and abstracts could not be
   retrieved.
5. **No formal risk-of-bias assessment.** Study quality is discussed
   qualitatively.
6. **No meta-analysis.** Effect sizes are reported only where a source reports
   them.
7. **Purposive selection.** The review is designed to support positioning and
   validation design, not to estimate a literature-wide effect.

These limitations are carried forward into the research-gap analysis.

---

## 3. Conceptual framing

### 3.1 Definitions used in this review

| Construct | Working definition | Key sources |
| --- | --- | --- |
| Financial literacy | Knowledge and skills needed to make informed financial decisions | Lusardi and Mitchell (2014); OECD (2026) |
| Financial capability | Ability to apply financial knowledge, perform desirable behaviours, and take available opportunities to achieve financial well-being | Xiao et al. (2022) |
| Financial well-being | A multidimensional state encompassing current money-management stress and expected future financial security, and the ability to pursue goals and manage emergencies | Brüggen et al. (2017); Netemeyer et al. (2018); OECD (2026); World Bank (2025) |
| Financial resilience | Capacity to absorb shocks and recover, or to adapt and transform; multidimensional and context-dependent | Salignac et al. (2019); Tahir and Richards (2025) |
| Assessment | A snapshot of income, expenses, savings, debt, and goal progress | WealthGenie implementation |
| Digital Twin | A deterministic what-if calculator that recomputes the snapshot under user-specified changes | WealthGenie implementation |
| Recommendation | A rule-triggered message with severity, trigger, formula, inputs, assumptions, and suggested action | WealthGenie implementation |
| Explanation | The formula, inputs, reason, and assumptions attached to a metric or recommendation | WealthGenie implementation |
| Heuristic threshold | A configurable rule of thumb, not a universal financial standard | WealthGenie implementation |

### 3.2 Three distinctions that matter for claims

1. **Population measurement is not individual assessment.** Findex and the
   OECD/INFE toolkit measure resilience and well-being across populations. They
   do not tell one person what will happen if they change their expenses.
2. **A deterministic calculator is not an AI model.** Its transparency comes
   from explicit rules and arithmetic, not from post-hoc explainability of a
   black box. XAI research is therefore relevant by analogy, not by direct
   transfer.
3. **A capability is not a benefit.** A system can provide scenario comparison
   without evidence that scenario comparison improves decisions, trust, or
   outcomes.

These distinctions structure the rest of the review.

---

## 4. Theme 1 — Explainable financial decision support

### 4.1 XAI in finance is concentrated in a few tasks

Černevičienė and Kabašinskas (2024) systematically review 138 articles published
between 2005 and 2022. They classify the literature by financial task, by the
black-box model being explained, and by the explanation method. The most common
tasks are credit management, stock-price prediction, and fraud detection. The
most common black-box models are artificial neural networks, XGBoost, and random
forests. The most common explanation approaches are feature importance, SHAP,
and rule-based explanations.

This is a mature literature about explaining complex models. It is not a
literature about explaining a deterministic household budget calculation. The
review's relevance to WealthGenie is therefore indirect: it shows that
explainability is task-specific and that technical explanation methods do not
by themselves establish user comprehension.

### 4.2 Robo-advisors: automation, cost, and variable quality

Fisch, Labouré, and Turner (2019) describe robo-advisors as online services that
use algorithms to provide advice and manage portfolios. They emerged in response
to demand for advice and the high cost of human advisers. Pure robo-advisors are
generally much cheaper than human advisers, and algorithms allow greater
personalization, but they do not provide all human-adviser services, especially
direct human contact. Hybrid models combine automation with human input.

Beketov, Lehmann, and Wittke (2018) examine the quantitative methods inside 219
robo-advisors. They report that mean-variance optimization dominates, with a gap
between the methods used in practice and newer developments in portfolio theory.
Tertilt and Scholz (2018) audit robo-advisor risk profiling and report
significant differences in advice quality; some questionnaires use few
questions, include irrelevant items, and produce conservative equity exposure.

Reher and Sokolinski (2024) study a quasi-experiment in which a major U.S.
robo-advisor lowered its account minimum. Participation increased among
middle-class investors but not among the poor. A benchmark model calibrated to
portfolio-level data rationalizes the participation pattern: middle-class
investors want sophisticated investing but cannot achieve it themselves, and
their welfare rises moderately, driven by features such as multi-dimensional
glide paths and additional priced risk factors. Middle-aged investors gain about
three times more than millennials.

**Implication for WealthGenie.** Algorithmic advice is not automatically better,
more transparent in practice, or more inclusive. Advice quality varies, and
access does not guarantee use by the least advantaged. WealthGenie should not
claim that automation improves advice quality or inclusion.

### 4.3 Human advice can be conflicted

Mullainathan, Nöth, and Schoar (2012) use an audit study of financial advisers.
They find that advisers often reinforce client biases and recommend actively
managed, higher-fee funds. This is a counterpoint to the assumption that advice
is neutral. It also motivates transparent, rule-based tools that do not depend on
commissions.

The implication is not that rules are unbiased. A rule-based system can encode
its own simplifications and value judgments. The relevant question is whether
the rules are correct, disclosed, and appropriate for the user.

### 4.4 Synthesis for Theme 1

**Established:**

- XAI in finance is concentrated in credit, fraud, and trading.
- Robo-advisor quality varies; risk profiling can be thin.
- Human advice can be conflicted.
- Cost and access are important adoption margins.

**Contested:**

- Whether explanations improve trust or comprehension.
- Whether algorithmic advice outperforms human advice for ordinary households.
- Whether transparency alone changes behaviour.

**Missing:**

- User-facing evaluation of explanations for deterministic household financial
  tools.
- Audit protocols for rule-based recommendations.
- Evidence on how beginners interpret formulas, thresholds, and assumptions.

---

## 5. Theme 2 — Personal financial resilience assessment

### 5.1 Population evidence: the Global Findex 2025

The Global Findex 2025 (World Bank, 2025) surveys approximately 148,000 adults in
141 economies, with fieldwork in 2024. It defines financial health as the
ability to pursue financial goals, manage financial emergencies, and feel
confident about one's finances.

Key findings relevant to WealthGenie:

- 56% of adults could reliably get hold of extra money to deal with an emergency;
  this share is unchanged since 2021.
- Only about half of adults in low- and middle-income economies could cover
  expenses for two months or longer if they lost their primary income source;
  the other half could cover no more than a month.
- About one-third of adults in low- and middle-income economies could cover more
  than two months of expenses if they lost their main income source.
- One in four adults experienced a natural disaster in the past three years;
  two-thirds of those affected lost income or an asset.
- Family and friends are the most common source of extra money in every region
  except East Asia and the Pacific, although savings are described as more
  reliable. Women and poorer adults are more likely to rely on family or friends.

These are population estimates. They establish the scale of resilience gaps, not
the accuracy of any individual calculator.

### 5.2 Measurement: the OECD/INFE toolkit

The OECD/INFE Toolkit for Measuring Financial Literacy, Inclusion and Well-Being
2026 (OECD, 2026) provides a survey instrument and methodological guidance. It
measures financial literacy across knowledge, behaviour, and attitudes; digital
financial literacy; financial inclusion; financial resilience; and financial
well-being. It supports the International Survey of Adult Financial Literacy,
Inclusion and Well-Being every three to four years.

The toolkit is a measurement instrument, not a planning calculator. It is useful
for defining constructs and for designing user-study outcomes. It does not
validate a deterministic projection or a rule-based recommendation.

### 5.3 Conceptual debates: no single measure

Salignac, Marjolin, Reeve, and Muir (2019) propose a multidimensional framework
for conceptualizing and measuring financial resilience. The title and framework
imply that resilience should not be reduced to a single indicator. (Reading note:
metadata and reference list only; the full text was not retrieved.) The
implication is that a single coverage ratio is a partial operationalization, not
a validated measure of resilience.

Tahir and Richards (2025) systematically review 155 Scopus articles up to
December 2023. They identify individual, organisational, and governmental
domains, and report that there is no accepted definition or measure of financial
resilience. They distinguish "bounce back" from "bounce forward." This is a
strong basis for caution: any single metric is a construct-specific
operationalization, not "financial resilience" itself.

Klapper and Lusardi (2020) examine financial literacy and financial resilience
across countries. (The publisher-deposited abstract is inconsistent with the
title, so this review cites the paper at title level.) Lusardi, Hasler, and
Yakoboski (2021) argue for building financial literacy and financial resilience
together. (Metadata only.) Liu, Fan, Li, and Yue (2024) study
financial literacy and household financial resilience. (Metadata only.)
Kass-Hanna, Lyons, and Liu (2022) examine financial and digital literacy and
resilience in South Asia and Sub-Saharan Africa. (Metadata only.)

### 5.4 Individual-level assessment

The population literature measures resilience with survey items such as the
ability to raise emergency money or cover expenses for a period after income
loss. It does not provide a deterministic, individual-level calculator that shows
how changes in income, expenses, savings, EMI, or shocks affect coverage.

Commercial budgeting apps and calculators do provide such calculations. What is
sparse is peer-reviewed evaluation of their correctness, transparency, and
decision value. This is an evidence gap, not proof that no such tools exist.

**Implication for WealthGenie.** The assessment is a set of construct-specific
indicators: living-expense coverage, mandatory-outflow coverage, EMI burden,
post-shock savings, and goal timeline. It should be presented as a set of
indicators, not as a validated measure of financial resilience. The Findex and
OECD constructs can inform user-study outcomes, but they do not validate the
calculator.

---

## 6. Theme 3 — Goal-based planning and what-if simulation

### 6.1 Goals-based wealth management

Brunel (2011) describes goal-based wealth management in practice. Das, Ostrov,
Radhakrishnan, and Srivastav (2020) formulate a dynamic programming algorithm
that maximizes the probability of attaining a target wealth at a horizon, allows
periodic contributions or withdrawals, and outperforms target-date funds on goal
attainment in their setting. This is a sophisticated, return-and-risk-aware
approach.

WealthGenie's Digital Twin is deliberately simpler. It assumes a constant
monthly contribution and no investment returns, inflation, taxes, interest, or
income changes. It computes months-to-goal as the ceiling of remaining amount
divided by contribution and clamps completion dates to the last valid day of the
target month. It is not a portfolio optimizer. Its value proposition is
transparency and controllability for beginners, not optimality.

### 6.2 Probabilistic planning

Rao and Yang (2022) propose F2P3, a simulation-based approach to family financial
planning using probabilistic planners. They argue that previous tools rely
excessively on linear programming, are hard to explain and interpret, and are
incompatible with the probabilistic and parallel nature of financial actions.
Their approach models family financial planning as a probabilistic planning
problem and uses the Relational Dynamic Influence Diagram Language (RDDL). They
report that it can model probabilistic and parallel features and is more
comprehensive than existing academic methods and more cost-effective than
business approaches.

This is directly relevant to the transparency rationale for WealthGenie: formal
planning models can be powerful but hard to explain. A deterministic model
trades realism for legibility. The trade-off should be explicit.

### 6.3 Robo-advisors and access

As in Theme 1, robo-advisors provide automated planning and investment
management. Beketov et al. (2018) and Tertilt and Scholz (2018) show
methodological simplicity and variable advice quality. Reher and Sokolinski
(2024) show that lowering account minimums can increase participation among
middle-class investors but not the poor. This is relevant to WealthGenie's
low-cost, no-minimum positioning, but it is not evidence that WealthGenie will be
adopted or effective.

### 6.4 What-if simulation

The literature establishes that simulation and optimization can improve goal
attainment under explicit models (Das et al., 2020; Rao & Yang, 2022). It does
not establish that interactive what-if simulation, by itself, improves decisions
for non-expert users. The incremental value of interactivity over a static
assessment is an open empirical question. It could help users understand
trade-offs; it could also increase complexity, overconfidence, or false
precision.

**Implication for WealthGenie.** Phase 5 should treat the Digital Twin as a
capability, not a proven benefit. The A/B comparison in the validation protocol
is a capability comparison, not an outcome claim.

---

## 7. Theme 4 — Evaluation of rule-based financial recommendations

### 7.1 What prior work evaluates

Prior work evaluates different objects:

| Literature | Object of evaluation | Typical metrics |
| --- | --- | --- |
| XAI in finance | Explanations of black-box models | Fidelity, stability, feature importance, sometimes user trust |
| Robo-advisor audits | Risk profiling and portfolios | Number and relevance of questions, equity exposure, fees, advice quality |
| Human-advice audits | Adviser behaviour | Bias reinforcement, product choice, fees |
| Financial-education reviews | Education programmes | Literacy and behaviour change, heterogeneity, decay |
| Goals-based planning | Portfolio strategies | Probability of goal attainment, comparison with target-date funds |

None of these directly evaluates a deterministic, rule-based household
recommendation engine on exact rule agreement, boundary behaviour, explanation
traceability, threshold sensitivity, expert-judged appropriateness, and user
comprehension together.

### 7.2 What is missing

There is little peer-reviewed work that evaluates a rule-based household
recommendation engine on all of the following:

- exact agreement with documented rules;
- boundary behaviour at thresholds;
- explanation traceability (formula, inputs, assumptions);
- sensitivity to threshold choices;
- expert-judged appropriateness;
- user comprehension and actionability.

Phase 4's metrics are a useful start: exact-set agreement, per-decision
agreement, severity agreement, comparison correctness, and explainability
coverage. But they measure implementation consistency, not advice quality. A
recommendation can fire exactly as specified and still be unhelpful or
inappropriate.

### 7.3 Threshold justification

The 3-month coverage and 40% EMI thresholds used by WealthGenie are heuristics.
The reviewed literature does not establish universal values for either. Findex
uses two months as a resilience benchmark in its survey; that is a measurement
choice, not a prescription. Lender and regulator practice is outside the scope of
this review. WealthGenie should disclose the heuristic status and allow
configuration; expert review and sensitivity analysis are needed before claiming
that the defaults are appropriate.

**Implication for WealthGenie.** The evaluation protocol should combine software
tests (correctness and traceability) with expert review (appropriateness) and
user studies (comprehension and actionability). No single method answers all
questions.

---

## 8. Theme 5 — Financial literacy and digital financial well-being

### 8.1 Financial literacy and education

Lusardi and Mitchell (2014) review the economic importance of financial
literacy. They describe financial knowledge as a form of human capital, document
low and heterogeneous levels of literacy, and examine effects on economic
decision-making in the United States and elsewhere.

Fernandes, Lynch, and Netemeyer (2014) meta-analyze 168 papers covering 201
studies. They find that interventions to improve financial literacy explain only
0.1% of the variance in downstream financial behaviours, with weaker effects in
low-income samples. Effects decay over time; even large interventions have
negligible effects on behaviour 20 months or more after the intervention.
Correlational associations are stronger but diminish when controlling for
psychological traits or using an instrument for financial literacy.

Kaiser and Menkhoff (2017) meta-analyze 126 impact evaluations. They find that
financial education significantly improves financial behaviour and, to an even
larger extent, financial literacy, including in randomized experiments. However,
impacts are highly heterogeneous: financial education is less effective for
low-income clients and in low- and lower-middle-income economies. Debt handling
is harder to influence, and mandatory financial education appears less effective.

Stolper and Walter (2017) review the measurement and determinants of financial
literacy, supplement with German household evidence, and assess financial
education. They describe the evidence on programme effectiveness as "rather
disappointing" and discuss whether professional advice can substitute for
financial literacy. This reinforces the need for modest claims about what a
digital tool can achieve.

**Implication for WealthGenie.** A digital tool alone is unlikely to produce
large, durable literacy or behaviour change. Claims should be modest and should
not imply that using WealthGenie will make users financially literate or
resilient.

### 8.2 Financial well-being

Brüggen, Hogreve, Holmlund, Kabadayi, and Löfgren (2017) conceptualize financial
well-being and propose a research agenda. (Abstract read.) Netemeyer, Warmath,
Fernandes, and Lynch (2018) conceptualize perceived financial well-being as two
related but separate constructs: stress related to managing money today and a
sense of security about one's financial future. Using narratives, large-scale
surveys, and experiments, they develop and validate measures and show that
perceived financial well-being predicts overall well-being, with effects
comparable in magnitude to other life domains. The relative importance of
current money-management stress varies by income group.

The OECD (2026) and Findex (2025) operationalize well-being and financial health
at population level. These instruments are multidimensional and partly
subjective. A calculator can inform some components, such as perceived
preparedness, but it cannot measure well-being or claim to improve it without a
validated instrument and a study.

### 8.3 Digital financial literacy

Choung, Chatterjee, and Pak (2023) use Korean data (N = 1,615) and the CFPB
financial well-being scale. They report that a one-standard-deviation increase in
digital financial literacy is associated with a 1.33-point (about 2.6%) higher
financial well-being score. Digital-scam self-protection is the strongest
component. They note generalizability and omitted-variable limitations.

Kumar, Pillai, Kumar, and Tabash (2023; online 2022) use data from Delhi/NCR
(N = 512) and partial least squares structural equation modelling to examine
digital financial literacy, financial autonomy, financial capability, and
impulsivity in financial decision-making and perceived financial well-being.
Bhat, Lone, Sivakumar, and Krishna (2025; online 2024) examine digital financial
literacy and financial well-being among Indian students (N = 475) using
confirmatory factor analysis and structural equation modelling. (Abstract read.)

**Implication for WealthGenie.** Digital financial literacy is associated with
well-being in several contexts, including India, but the evidence is mostly
cross-sectional and associational. It does not show that a specific tool improves
well-being.

### 8.4 India-specific evidence

Findex 2025 includes India in its global sample. Kumar et al. (2023) and Bhat et
al. (2025) provide India-specific samples. However, this review did not identify
peer-reviewed evidence on the correctness, usability, or effectiveness of a
WealthGenie-like deterministic assessment and Digital Twin in India. That is a
gap, not a claim of novelty.

---

## 9. Synthesis

### 9.1 What is established, contested, and missing

| Status | Findings | Sources |
| --- | --- | --- |
| Established | Financial resilience is multidimensional and context-dependent; there is no single accepted measure. | Salignac et al. (2019); Tahir and Richards (2025) |
| Established | Population surveys show substantial gaps in emergency savings and resilience. | World Bank (2025); OECD (2026) |
| Established | Financial literacy is linked to resilience and well-being in several studies, while education interventions have modest and heterogeneous effects. | Klapper and Lusardi (2020); Choung et al. (2023); Fernandes et al. (2014); Kaiser and Menkhoff (2017) |
| Established | XAI in finance is concentrated in credit, fraud, and trading; robo-advice quality varies; human advice can be conflicted. | Černevičienė and Kabašinskas (2024); Tertilt and Scholz (2018); Mullainathan et al. (2012) |
| Established | Goals-based optimization can improve goal attainment under explicit models. | Das et al. (2020) |
| Contested | Whether explanations improve trust or comprehension. | XAI and robo-advice literatures |
| Contested | Whether algorithmic advice outperforms human advice for ordinary households. | Mixed evidence; no direct household-budget comparison |
| Contested | Whether interactive simulation improves decisions. | No direct evidence identified |
| Contested | Whether digital tools improve financial well-being causally. | Mostly cross-sectional evidence |
| Contested | What thresholds are appropriate for household recommendations. | Heuristics and context-dependent practice |
| Missing | Peer-reviewed audits of deterministic household recommendation engines. | No direct study identified |
| Missing | Evidence on the incremental value of interactive scenario simulation over static assessment. | No direct study identified |
| Missing | User-validated explanation formats for low-literacy beginners. | No direct study identified |
| Missing | India-specific tool evaluations. | Limited India-specific literacy/well-being work |
| Missing | Longitudinal outcome evidence. | No outcome dataset linked to this tool |

### 9.2 Three defensible conclusions

1. **Financial resilience is multidimensional.** A single coverage ratio is a
   useful indicator but not a validated measure of resilience.
2. **Transparency is necessary but not sufficient.** Explicit formulas and
   assumptions are a design strength, but comprehension and calibrated trust
   require user research.
3. **Education and advice effects are modest and heterogeneous.** A tool should
   not promise large or uniform improvements in literacy, resilience, or
   well-being.

### 9.3 Three open questions

1. Does interactive scenario simulation add decision-support value over a static
   assessment for beginners?
2. Which explanation formats improve comprehension without encouraging
   overconfidence?
3. Do rule-based recommendations change behaviour or outcomes, and for whom?

### 9.4 Positioning

WealthGenie is best positioned as a **transparent, deterministic financial
literacy and scenario-exploration tool**. Its contribution is not a new
predictive model or a proven intervention. Its contribution is an explicit,
reproducible implementation of household financial calculations with traceable
explanations, plus an evaluation protocol that separates correctness from
effectiveness.

---

## 10. Literature matrix

**Legend:** "Reading depth" is full text, abstract, or metadata only. "N/A"
means not applicable to a conceptual or review paper. "WG" is not used; the
"Relevance to WealthGenie" column spells out WealthGenie. "Method" names the
design; "Data" names the sample, corpus, or material.

| Citation | Theme | Objective | Method | Data | Evaluation metrics | Limitations | Relevance to WealthGenie | Reading depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Černevičienė and Kabašinskas (2024) | Explainable decision support | Map XAI methods in finance | Systematic literature review | 138 articles, 2005–2022 | Task, model, and explanation frequencies; narrative synthesis | Concentrated in credit, fraud, and trading; little user-facing evaluation; database and language bias | Shows that post-hoc XAI is not the right frame for a deterministic rule engine; explanation comprehension remains open | Abstract |
| Fisch, Labouré, and Turner (2019) | Explainable decision support | Describe the emergence of robo-advisors | Book chapter; conceptual and industry evidence | N/A | N/A | Conceptual; pre-dates recent market changes | Context for automated advice, cost, personalization, and hybrid models | Abstract |
| Tertilt and Scholz (2018) | Explainable decision support | Assess robo-advisor risk profiling | Audit of robo-advisor questionnaires and portfolios | Robo-advisor risk profiles | Advice quality; number and relevance of questions; equity exposure | Snapshot; specific sample; risk profiling only | Evidence that automated advice quality varies; supports audit-oriented evaluation | Abstract |
| Beketov, Lehmann, and Wittke (2018) | Explainable decision support | Examine quantitative methods inside robo-advisors | Review and audit | 219 robo-advisors | Method use; gap between practice and newer portfolio theory | Public information; not a performance evaluation | Shows simple methods dominate; transparency and method disclosure matter | Abstract |
| Reher and Sokolinski (2024) | Explainable decision support | Estimate access effects of robo-advisors | Quasi-experiment plus benchmark model | U.S. robo-advisor account-minimum change; portfolio-level data | Participation; welfare | U.S. context; specific firm; model assumptions | Access is not inclusion; no adoption or benefit claim for WealthGenie | Abstract |
| Mullainathan, Nöth, and Schoar (2012) | Explainable decision support | Audit financial advice | Audit study | Financial advisers | Bias reinforcement; product and fee recommendations | U.S. context; audit design; snapshot | Conflicts of interest motivate transparent rules, but rules can also encode bias | Abstract |
| Stolper and Walter (2017) | Literacy and advice | Review financial literacy, advice, and behaviour | Literature review | German household evidence | Narrative synthesis; literacy determinants; education effectiveness | Heterogeneous measures; advice endogeneity | Education effects are disappointing; advice is not a simple substitute for literacy | Abstract |
| Salignac, Marjolin, Reeve, and Muir (2019) | Resilience assessment | Conceptualize and measure financial resilience | Conceptual framework | N/A | Multidimensional framework | Full text not retrieved; metadata and reference list only | Resilience is multidimensional; a single ratio is partial | Metadata only |
| Tahir and Richards (2025) | Resilience assessment | Synthesize financial resilience research | Systematic literature review | 155 Scopus articles to December 2023 | Antecedents, consequences, domains, definitions | Scopus-only; no accepted measure; language bias | No universal definition; caution with resilience claims | Abstract |
| Klapper and Lusardi (2020) | Resilience assessment | Examine the literacy–resilience relationship | Not read beyond metadata | Title indicates cross-country evidence | Not read | Not assessed; deposited abstract inconsistent with title | Title-level: relationship examined; no causal claim | Metadata only |
| Lusardi, Hasler, and Yakoboski (2021) | Resilience assessment | Argue for building literacy and resilience | Conceptual/policy piece | N/A | N/A | Metadata only; short piece | Framing only; no empirical validation | Metadata only |
| Liu, Fan, Li, and Yue (2024) | Resilience assessment | Examine literacy and household resilience | Empirical study; details not read | Not read | Resilience; literacy | Metadata only | Title-level support for the literacy–resilience link | Metadata only |
| Kass-Hanna, Lyons, and Liu (2022) | Resilience assessment | Examine financial and digital literacy and resilience in South Asia and Sub-Saharan Africa | Empirical study; details not read | Not read | Resilience; literacy | Metadata only | Regional relevance; no tool evaluation | Metadata only |
| World Bank (2025) | Resilience assessment | Measure global financial inclusion and health | Survey | About 148,000 adults in 141 economies; 2024 fieldwork | Account ownership, use, financial health, resilience | Self-report; cross-sectional; population-level | Defines financial health and benchmarks; not an individual predictor | Executive summary |
| OECD (2026) | Resilience assessment | Provide a survey toolkit | Measurement instrument and methodological guidance | 2025–26 adult survey | Literacy, digital literacy, inclusion, resilience, well-being | Measurement, not intervention; cross-country comparability | Construct definitions and user-study outcomes | Abstract |
| Das, Ostrov, Radhakrishnan, and Srivastav (2020) | Goal-based planning | Optimize goals-based portfolio allocation | Dynamic programming | Model-based experiments | Probability of goal attainment; comparison with target-date funds | Model assumptions; not a household budgeting tool | Shows value of goals-based optimization; contrasts with the simple deterministic Twin | Abstract |
| Brunel (2011) | Goal-based planning | Describe goal-based wealth management in practice | Practitioner article | N/A | N/A | Practitioner; not empirical | Goal-based framing | Abstract |
| Rao and Yang (2022) | Goal-based planning | Apply probabilistic planners to family financial planning | Simulation-based probabilistic planning | RDDL domains | Model comprehensiveness; cost-effectiveness | Abstract-only; planning assumptions | Formal planning can be powerful but hard to explain; supports the transparency trade-off | Abstract |
| Fernandes, Lynch, and Netemeyer (2014) | Literacy and well-being | Meta-analyze financial literacy and education effects | Meta-analysis | 168 papers, 201 studies | Variance explained in downstream behaviours; decay; omitted-variable sensitivity | Heterogeneous interventions; publication bias | Modest effects; no literacy or behaviour-change claim | Abstract |
| Kaiser and Menkhoff (2017) | Literacy and well-being | Meta-analyze financial education impacts | Meta-analysis | 126 impact evaluations | Literacy and behaviour; heterogeneity | Heterogeneous programmes; weaker low-income effects | Modest, heterogeneous effects; supports cautious claims | Abstract |
| Lusardi and Mitchell (2014) | Literacy and well-being | Review the economic importance of financial literacy | Literature review | International evidence | Knowledge, behaviour, planning | Measurement heterogeneity | Definition and importance; no tool validation | Abstract |
| Netemeyer, Warmath, Fernandes, and Lynch (2018) | Literacy and well-being | Develop and validate a financial well-being measure | Narratives, surveys, experiments; scale development | Survey and experiment samples | Current money-management stress; expected future financial security | U.S. samples; self-report | Multidimensional well-being outcome for future studies | Abstract |
| Brüggen, Hogreve, Holmlund, Kabadayi, and Löfgren (2017) | Literacy and well-being | Conceptualize financial well-being and set a research agenda | Conceptual | N/A | N/A | Conceptual | Definition; multidimensional framing | Abstract |
| Xiao, Huang, Goyal, and Kumar (2022) | Literacy and well-being | Review and synthesize financial capability | Systematic conceptual review | 215 Scopus articles, 2007–2022 | Bibliographic coupling; conceptual framework | Conceptual; measurement heterogeneity | Capability is broader than literacy; context and opportunity matter | Abstract |
| Choung, Chatterjee, and Pak (2023) | Literacy and well-being | Estimate the digital financial literacy–well-being association | OLS and instrumental variables | Korea; N = 1,615 | CFPB financial well-being scale; digital financial literacy | Cross-sectional; omitted variables; instruments; generalizability | Digital financial literacy is associated with well-being; scam self-protection matters | Full text |
| Kumar, Pillai, Kumar, and Tabash (2023; online 2022) | Literacy and well-being | Examine digital literacy, capability, autonomy, and well-being | PLS-SEM | Delhi/NCR; N = 512 | Perceived financial well-being; mediation | Cross-sectional; regional sample; self-report | India-specific evidence that digital financial literacy matters | Abstract |
| Bhat, Lone, Sivakumar, and Krishna (2025; online 2024) | Literacy and well-being | Examine digital financial literacy and well-being in India | CFA and SEM | Andhra Pradesh students; N = 475 | Financial well-being; digital financial literacy | Student sample; cross-sectional; regional | India-specific youth evidence; no tool evaluation | Abstract |

---

## 11. Reading-depth and verification record

| Citation | DOI verified | Reading depth | What was used |
| --- | --- | --- | --- |
| Černevičienė and Kabašinskas (2024) | Yes | Abstract | Task/model/explanation classification; 138 articles |
| Fisch, Labouré, and Turner (2019) | Yes | Abstract | Robo-advisor definition, cost, personalization, hybrid models |
| Tertilt and Scholz (2018) | Yes | Abstract | Risk-profiling quality differences |
| Beketov, Lehmann, and Wittke (2018) | Yes | Abstract | 219 robo-advisors; mean-variance dominance |
| Reher and Sokolinski (2024) | Yes | Abstract | Access quasi-experiment; participation and welfare |
| Mullainathan, Nöth, and Schoar (2012) | Yes | Abstract | Audit findings on bias reinforcement and fees |
| Stolper and Walter (2017) | Yes | Abstract | Literacy measurement; disappointing education evidence |
| Salignac, Marjolin, Reeve, and Muir (2019) | Yes | Metadata only | Framework purpose; reference list |
| Tahir and Richards (2025) | Yes | Abstract | 155 articles; no accepted definition; domains |
| Klapper and Lusardi (2020) | Yes | Metadata only | Title-level relationship; deposited abstract inconsistent with title |
| Lusardi, Hasler, and Yakoboski (2021) | Yes | Metadata only | Title-level framing |
| Liu, Fan, Li, and Yue (2024) | Yes | Metadata only | Title-level literacy–resilience link |
| Kass-Hanna, Lyons, and Liu (2022) | Yes | Metadata only | Title-level regional relevance |
| World Bank (2025) | Yes | Executive summary | Financial-health definitions and headline figures |
| OECD (2026) | Yes | Abstract | Toolkit scope and constructs |
| Das, Ostrov, Radhakrishnan, and Srivastav (2020) | Yes | Abstract | Dynamic programming; goal attainment |
| Brunel (2011) | Yes | Abstract | Goal-based practice framing |
| Rao and Yang (2022) | Yes | Abstract | Probabilistic planning; explainability trade-off |
| Fernandes, Lynch, and Netemeyer (2014) | Yes | Abstract | 0.1% variance; decay; omitted-variable sensitivity |
| Kaiser and Menkhoff (2017) | Yes | Abstract | 126 evaluations; heterogeneous effects |
| Lusardi and Mitchell (2014) | Yes | Abstract | Financial literacy as human capital |
| Netemeyer, Warmath, Fernandes, and Lynch (2018) | Yes | Abstract | Two well-being constructs; scale validation |
| Brüggen, Hogreve, Holmlund, Kabadayi, and Löfgren (2017) | Yes | Abstract | Financial well-being conceptualization |
| Xiao, Huang, Goyal, and Kumar (2022) | Yes | Abstract | 215 articles; capability definition |
| Choung, Chatterjee, and Pak (2023) | Yes | Full text | Korea; N = 1,615; 1.33-point association |
| Kumar, Pillai, Kumar, and Tabash (2023; online 2022) | Yes | Abstract | Delhi/NCR; N = 512; PLS-SEM |
| Bhat, Lone, Sivakumar, and Krishna (2025; online 2024) | Yes | Abstract | Andhra Pradesh; N = 475; CFA/SEM |

**Verification notes.**

- Crossref and OpenAlex records were checked for title, authors, venue, volume,
  issue, pages or article number, and DOI.
- Print/issue years were used where online-first and issue years differ.
- No claim in this review attributes findings beyond the reading depth recorded.
  Metadata-only papers are cited only for title-level framing and are marked as
  such.
- The Global Findex figures were read from the official executive-summary PDF
  downloaded from the World Bank Open Knowledge Repository.
- The OECD/INFE abstract was read through the OECD publication page; the full
  toolkit PDF was not retrieved.

---

## 12. Implications for WealthGenie

### 12.1 Design implications

- Keep the deterministic engine deterministic. Its transparency is a design
  property, not an AI feature.
- Keep formulas, inputs, assumptions, and heuristic thresholds visible for every
  metric and recommendation.
- Keep the "estimate, not prediction" notice and the educational disclaimer.
- Do not add return, inflation, tax, or income-growth modelling without a
  separate design and validation phase.
- Treat the 3-month and 40% thresholds as configurable heuristics, not universal
  standards.
- Preserve null propagation: do not invent a percentage change when the baseline
  is zero, and do not invent a completion date when the goal is unreachable.

### 12.2 Research implications

- RQ1 (calculation correctness) and RQ5 (threshold boundaries) can be answered
  largely with software tests and hand-derived reference cases.
- RQ3 (transparency) requires both structural tests and expert/user assessment.
- RQ7 (incremental decision support) requires human participants; it cannot be
  answered by software tests.
- RQ8 (real-world outcomes) requires a longitudinal or field design and is
  outside the current evidence base.
- Phase 4 results should be described as implementation-consistency evidence,
  not as independent validation.

### 12.3 Claim implications

Use:

- "computes", "shows", "compares", "explains", "provides", "is designed to";
- "implementation-consistency evidence";
- "heuristic threshold";
- "estimate, not prediction";
- "educational, not financial advice".

Avoid:

- "improves outcomes", "increases resilience", "builds wealth", "empowers";
- "improves trust", "increases literacy", "reduces financial stress";
- "validated", "proven", "personalized advice", "optimal";
- "first", "novel", "state-of-the-art" without a systematic priority search.

### 12.4 What not to build in Phase 5

- No ML model or predictive scoring.
- No investment-return or inflation simulation.
- No personalized investment advice.
- No claims of causal impact.
- No changes to Phase 4 results, Findex data/models, or hosted database
  configuration.

---

## 13. References

Beketov, M., Lehmann, K., & Wittke, M. (2018). Robo advisors: Quantitative
methods inside the robots. *Journal of Asset Management, 19*(6), 363–370.
https://doi.org/10.1057/s41260-018-0092-9

Bhat, S. A., Lone, U. M., Sivakumar, A., & Krishna, U. M. G. (2025). Digital
financial literacy and financial well-being – evidence from India.
*International Journal of Bank Marketing, 43*(3), 522–548.
https://doi.org/10.1108/IJBM-05-2024-0320

Brunel, J. L. P. (2011). Goal-based wealth management in practice. *The Journal
of Wealth Management, 14*(3), 17–26.
https://doi.org/10.3905/jwm.2011.14.3.017

Brüggen, E. C., Hogreve, J., Holmlund, M., Kabadayi, S., & Löfgren, M. (2017).
Financial well-being: A conceptualization and research agenda. *Journal of
Business Research, 79*, 228–237.
https://doi.org/10.1016/j.jbusres.2017.03.013

Černevičienė, J., & Kabašinskas, A. (2024). Explainable artificial intelligence
(XAI) in finance: A systematic literature review. *Artificial Intelligence
Review, 57*(8), Article 216. https://doi.org/10.1007/s10462-024-10854-8

Choung, Y., Chatterjee, S., & Pak, T.-Y. (2023). Digital financial literacy and
financial well-being. *Finance Research Letters, 58*, Article 104438.
https://doi.org/10.1016/j.frl.2023.104438

Das, S. R., Ostrov, D., Radhakrishnan, A., & Srivastav, D. (2020). Dynamic
portfolio allocation in goals-based wealth management. *Computational Management
Science, 17*(4), 613–640. https://doi.org/10.1007/s10287-019-00351-7

Fernandes, D., Lynch, J. G., Jr., & Netemeyer, R. G. (2014). Financial literacy,
financial education, and downstream financial behaviors. *Management Science,
60*(8), 1861–1883. https://doi.org/10.1287/mnsc.2013.1849

Fisch, J. E., Labouré, M., & Turner, J. A. (2019). The emergence of the
robo-advisor. In J. Agnew & O. S. Mitchell (Eds.), *The disruptive impact of
FinTech on retirement systems* (pp. 13–37). Oxford University Press.
https://doi.org/10.1093/oso/9780198845553.003.0002

Kaiser, T., & Menkhoff, L. (2017). Does financial education impact financial
literacy and financial behavior, and if so, when? *The World Bank Economic
Review, 31*(3), 611–630. https://doi.org/10.1093/wber/lhx018

Kass-Hanna, J., Lyons, A. C., & Liu, F. (2022). Building financial resilience
through financial and digital literacy in South Asia and Sub-Saharan Africa.
*Emerging Markets Review, 51*, Article 100846.
https://doi.org/10.1016/j.ememar.2021.100846

Klapper, L., & Lusardi, A. (2020). Financial literacy and financial resilience:
Evidence from around the world. *Financial Management, 49*(3), 589–614.
https://doi.org/10.1111/fima.12283

Kumar, P., Pillai, R., Kumar, N., & Tabash, M. I. (2023). The interplay of
skills, digital financial literacy, capability, and autonomy in financial
decision making and well-being. *Borsa Istanbul Review, 23*(1), 169–183.
https://doi.org/10.1016/j.bir.2022.09.012

Liu, T., Fan, M., Li, Y., & Yue, P. (2024). Financial literacy and household
financial resilience. *Finance Research Letters, 63*, Article 105378.
https://doi.org/10.1016/j.frl.2024.105378

Lusardi, A., Hasler, A., & Yakoboski, P. J. (2021). Building up financial
literacy and financial resilience. *Mind & Society, 20*(2), 181–187.
https://doi.org/10.1007/s11299-020-00246-0

Lusardi, A., & Mitchell, O. S. (2014). The economic importance of financial
literacy: Theory and evidence. *Journal of Economic Literature, 52*(1), 5–44.
https://doi.org/10.1257/jel.52.1.5

Mullainathan, S., Nöth, M., & Schoar, A. (2012). *The market for financial
advice: An audit study* (NBER Working Paper No. 17929). National Bureau of
Economic Research. https://doi.org/10.3386/w17929

Netemeyer, R. G., Warmath, D., Fernandes, D., & Lynch, J. G., Jr. (2018). How am
I doing? Perceived financial well-being, its potential antecedents, and its
relation to overall well-being. *Journal of Consumer Research, 45*(1), 68–89.
https://doi.org/10.1093/jcr/ucx109

OECD. (2026). *OECD/INFE toolkit for measuring financial literacy, inclusion and
well-being 2026*. OECD Publishing.
https://doi.org/10.1787/92f2d439-en

Rao, D., & Yang, Z. (2022). Family financial planning based on probabilistic
planners. In *Proceedings of the 2022 6th International Conference on Computer
Science and Artificial Intelligence* (pp. 265–271). ACM.
https://doi.org/10.1145/3577530.3577572

Reher, M., & Sokolinski, S. (2024). Robo advisors and access to wealth
management. *Journal of Financial Economics, 155*, Article 103829.
https://doi.org/10.1016/j.jfineco.2024.103829

Salignac, F., Marjolin, A., Reeve, R., & Muir, K. (2019). Conceptualizing and
measuring financial resilience: A multidimensional framework. *Social Indicators
Research, 145*(1), 17–38. https://doi.org/10.1007/s11205-019-02100-4

Stolper, O. A., & Walter, A. (2017). Financial literacy, financial advice, and
financial behavior. *Journal of Business Economics, 87*(5), 581–643.
https://doi.org/10.1007/s11573-017-0853-9

Tahir, M. S., & Richards, D. W. (2025). A systematic literature review of
financial resilience: Antecedents, consequences and future research agenda.
*Journal of Financial Regulation and Compliance, 33*(4), 592–615.
https://doi.org/10.1108/JFRC-10-2024-0204

Tertilt, M., & Scholz, P. (2018). To advise, or not to advise—How robo-advisors
evaluate the risk preferences of private investors. *The Journal of Wealth
Management, 21*(2), 70–84. https://doi.org/10.3905/jwm.2018.21.2.070

World Bank. (2025). *The Global Findex Database 2025: Connectivity and financial
inclusion in the digital economy* (L. Klapper, D. Singer, L. Starita, & A.
Norris). World Bank. https://doi.org/10.1596/978-1-4648-2204-9

Xiao, J. J., Huang, J. X., Goyal, K., & Kumar, S. (2022). Financial capability: A
systematic conceptual review, extension and synthesis. *International Journal of
Bank Marketing, 40*(7), 1680–1717. https://doi.org/10.1108/IJBM-05-2022-0185

---

## Appendix A — Seed-source verification notes

| Seed source | Verified record | What was read | Key usable claims |
| --- | --- | --- | --- |
| Černevičienė and Kabašinskas (2024) | *Artificial Intelligence Review* 57(8), Article 216; DOI 10.1007/s10462-024-10854-8 | Abstract | 138 articles, 2005–2022; credit, stock prediction, fraud; ANN/XGBoost/RF; feature importance/SHAP/rule-based |
| OECD/INFE (2026) | OECD Publishing; DOI 10.1787/92f2d439-en; published 13 January 2026 | Abstract | Survey toolkit; literacy (knowledge, behaviour, attitudes), digital literacy, inclusion, resilience, well-being; 2025–26 adult survey |
| World Bank (2025) | DOI 10.1596/978-1-4648-2204-9; ~148,000 adults, 141 economies, 2024 fieldwork | Executive summary | Financial-health definition; 56% emergency access; about half cover two months or longer; about one-third cover more than two months; one in four experienced a natural disaster; family/friends most common source, savings more reliable |
| Tahir and Richards (2025) | *Journal of Financial Regulation and Compliance* 33(4), 592–615; DOI 10.1108/JFRC-10-2024-0204 | Abstract | 155 Scopus articles to December 2023; individual/organisational/governmental domains; no accepted definition or measure; bounce back vs bounce forward |

## Appendix B — What this review did not establish

- It did not establish that WealthGenie's indicators are a validated measure of
  financial resilience.
- It did not establish that the 3-month or 40% thresholds are appropriate.
- It did not establish that the Digital Twin improves decisions, trust, literacy,
  resilience, or well-being.
- It did not establish that the recommendations are optimal or suitable for every
  user.
- It did not establish generalizability to the Indian population or to any
  subgroup.
- It did not substitute for expert review, user research, or field evidence.
