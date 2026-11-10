# WealthGenie IEEE Research Paper — Screenshot Guide

This README explains where to insert the four application screenshots required by
the paper.

## Directory layout

```
paper/
├── wealthgenie-paper.tex      # Main LaTeX source
├── IEEEtran.cls               # IEEEtran conference class (placeholder)
├── references.bib             # Bibliography (placeholder — curate before submission)
├── README.md                  # This file
├── sections/                  # Paper body split by section
│   ├── abstract.tex
│   ├── introduction.tex
│   ├── sdg-alignment.tex
│   ├── platform.tex
│   ├── learn.tex
│   ├── assessment.tex
│   ├── recommendation-engine.tex
│   ├── explore-investments.tex
│   ├── paper-trading.tex
│   ├── digital-twin.tex
│   ├── implementation-evaluation.tex
│   ├── limitations.tex
│   └── conclusion.tex
├── figures/                   # Figure environments with captions and placeholders
│   ├── fig-learn.tex          # Figure 1 — Learn — Financial Literacy
│   ├── fig-assessment.tex     # Figure 2 — Assessment — Financial Profiling
│   ├── fig-explore.tex        # Figure 3 — Explore Investments — Personalized Mutual Fund Recommendations
│   └── fig-twin.tex           # Figure 4 — Digital Twin — Financial Scenario Comparison
└── screenshots/               # Actual screenshot image files go here
    ├── fig-learn.png
    ├── fig-assessment.png
    ├── fig-explore.png
    └── fig-twin.png
```

## Where each screenshot is referenced

| Figure | Placeholder file | Section | Page of the app to screenshot |
|--------|------------------|---------|-------------------------------|
| 1 | `figures/fig-learn.tex` | IV. Financial Literacy Through the Learn Module | `frontend/src/pages/LearnPage.jsx` — the Learn page showing the curriculum roadmap, a lesson panel, quiz and citations |
| 2 | `figures/fig-assessment.tex` | V. Financial Assessment and Investor Profiling | `frontend/src/pages/AssessmentPage.jsx` — the Assessment page showing the financial profile form and computed metric cards |
| 3 | `figures/fig-explore.tex` | VII. Personalized Investment Exploration | `frontend/src/pages/ExploreInvestmentsPage.jsx` — the Explore Investments page showing readiness statistics, category cards and verified fund cards |
| 4 | `figures/fig-twin.tex` | IX. Digital Twin and Financial Scenario Comparison | `frontend/src/pages/DigitalTwinPage.jsx` — the Digital Twin page showing baseline and scenario forms with metric-by-metric comparison |

The Paper Trading module is explained in Section VIII and does not require an
additional screenshot.

## How to insert the screenshots

1. Run the WealthGenie application:
   ```bash
   npm run dev:backend
   npm run dev:frontend
   ```
2. Navigate to each of the four pages listed above and take a screenshot of the
   rendered application. Use a consistent window size and resolution.
3. Save the screenshots into `paper/screenshots/` using the exact filenames
   shown in the table.
4. Edit each `paper/figures/fig-*.tex` file to replace the placeholder box with
   the actual image:

   ```latex
   \begin{figure}[H]
   \centering
   \includegraphics[width=0.85\linewidth]{screenshots/fig-learn}
   \caption{The Learn module delivers structured financial literacy content organized into five branches with versioned lessons, worked examples, quizzes and verified citations.}
   \label{fig:learn}
   \end{figure}
   ```

   The `\includegraphics` path is relative to the location of
   `wealthgenie-paper.tex`, so `screenshots/fig-learn` resolves to
   `paper/screenshots/fig-learn.png`.

5. Compile the paper:
   ```bash
   cd paper
   pdflatex wealthgenie-paper
   bibtex wealthgenie-paper
   pdflatex wealthgenie-paper
   pdflatex wealthgenie-paper
   ```

## Notes

- Only actual application screenshots are permitted as figures. Do not create
  architecture diagrams, block diagrams, workflow diagrams, recommendation
  flowcharts, dataset pipeline diagrams or decorative illustrations.
- The `IEEEtran.cls` file in this folder is a minimal placeholder. Replace it
  with the official IEEEtran conference class from the IEEE website, or ensure
  the class is installed in your TeX distribution before compiling.
- The `references.bib` file is a placeholder with the keys cited in the paper
  body. Replace it entirely with your curated bibliography before submission.