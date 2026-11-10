import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FlaskConical,
  Info,
  Lightbulb,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { formatINR } from '../utils/formatters';
import { ASSESSMENT_GOAL_OPTIONS } from '../utils/assessmentDisplay';
import { useUserData } from '../context/UserDataContext';
import {
  buildChangedAssumptions,
  formatTwinDate,
  formatTwinDateTime,
  formatTwinDifference,
  formatTwinInputs,
  formatTwinMetric,
  formatTwinPercentageChange,
  twinSeverityStyles,
  twinToneForSurplus,
} from '../utils/twinDisplay';

const EMPTY_BASELINE = {
  monthlyIncome: '',
  monthlyExpenses: '',
  accessibleSavings: '',
  goal: 'emergency_fund',
  emiPayments: '',
  emiIncludedInExpenses: true,
  monthlySavingsCapacity: '',
  targetAmount: '',
  currentGoalSavings: '',
  goalTimelineMonths: '',
};

const EMPTY_SCENARIO = {
  monthlyIncome: '',
  monthlyExpenses: '',
  accessibleSavings: '',
  emiPayments: '',
  unexpectedExpense: '',
};

function toInput(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function baselineFromInputs(inputs = {}) {
  return {
    monthlyIncome: toInput(inputs.monthlyIncome),
    monthlyExpenses: toInput(inputs.monthlyExpenses),
    accessibleSavings: toInput(inputs.accessibleSavings),
    goal: inputs.goal || 'emergency_fund',
    emiPayments: toInput(inputs.emiPayments),
    emiIncludedInExpenses: inputs.emiIncludedInExpenses ?? true,
    monthlySavingsCapacity: toInput(inputs.monthlySavingsCapacity),
    targetAmount: toInput(inputs.targetAmount),
    currentGoalSavings: toInput(inputs.currentGoalSavings),
    goalTimelineMonths: toInput(inputs.goalTimelineMonths),
  };
}

function scenarioFromInputs(inputs = {}) {
  return {
    monthlyIncome: toInput(inputs.monthlyIncome),
    monthlyExpenses: toInput(inputs.monthlyExpenses),
    accessibleSavings: toInput(inputs.accessibleSavings),
    emiPayments: toInput(inputs.emiPayments),
    unexpectedExpense: toInput(inputs.unexpectedExpense ?? 0),
  };
}

function buildBaselinePayload(form) {
  if (
    form.monthlyIncome === '' ||
    form.monthlyExpenses === '' ||
    form.accessibleSavings === ''
  ) {
    return null;
  }

  const payload = {
    monthlyIncome: form.monthlyIncome,
    monthlyExpenses: form.monthlyExpenses,
    accessibleSavings: form.accessibleSavings,
    goal: form.goal,
    emiIncludedInExpenses: form.emiIncludedInExpenses,
  };

  const optional = [
    'emiPayments',
    'monthlySavingsCapacity',
    'targetAmount',
    'currentGoalSavings',
    'goalTimelineMonths',
  ];

  optional.forEach((field) => {
    if (form[field] !== '') payload[field] = form[field];
  });

  return payload;
}

function buildScenarioOverrides(form) {
  const overrides = {};

  if (form.monthlyIncome !== '') overrides.monthlyIncome = form.monthlyIncome;
  if (form.monthlyExpenses !== '') overrides.monthlyExpenses = form.monthlyExpenses;
  if (form.accessibleSavings !== '') {
    overrides.accessibleSavings = form.accessibleSavings;
  }
  if (form.emiPayments !== '') overrides.emiPayments = form.emiPayments;
  overrides.unexpectedExpense =
    form.unexpectedExpense === '' ? 0 : form.unexpectedExpense;

  return overrides;
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  min = '0',
  step = '1',
  hint,
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-navy-900 mb-1"
      >
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
      />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function MetricComparisonCard({ item, explanation }) {
  const percentageChange = formatTwinPercentageChange(item);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {item.label}
        </div>
        <Badge variant="slate" size="xs">
          {item.kind === 'currency' ? 'INR' : item.kind}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
          <div className="text-slate-500">Baseline</div>
          <div className="font-bold text-navy-950 mt-0.5">
            {formatTwinMetric(item.kind, item.baseline)}
          </div>
        </div>
        <div className="rounded-lg bg-genie-50 border border-genie-100 p-2">
          <div className="text-genie-800">Scenario</div>
          <div className="font-bold text-genie-950 mt-0.5">
            {formatTwinMetric(item.kind, item.scenario)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold text-navy-900">
          {formatTwinDifference(item)}
        </span>
        {percentageChange && (
          <span className="text-slate-500">({percentageChange})</span>
        )}
        {item.kind === 'percent' &&
          item.percentagePointDifference !== null && (
            <span className="text-slate-500">
              {item.percentagePointDifference > 0 ? '+' : ''}
              {item.percentagePointDifference.toFixed(1)} pp
            </span>
          )}
      </div>

      {explanation && (
        <details className="mt-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-genie-800 hover:text-genie-900">
            Why this metric
          </summary>
          <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 border border-slate-100 p-2.5">
            <p>
              <span className="font-semibold text-navy-900">Formula:</span>{' '}
              {explanation.formula}
            </p>
            <p>
              <span className="font-semibold text-navy-900">Inputs:</span>{' '}
              {formatTwinInputs(explanation.inputs)}
            </p>
            <p>
              <span className="font-semibold text-navy-900">Assumptions:</span>{' '}
              {explanation.assumptions.length > 0
                ? explanation.assumptions.join(' ')
                : 'None beyond the global assumptions.'}
            </p>
            <p>
              <span className="font-semibold text-navy-900">Reason:</span>{' '}
              {explanation.reason}
            </p>
          </div>
        </details>
      )}
    </Card>
  );
}

function RecommendationCard({ recommendation }) {
  const styles = twinSeverityStyles(recommendation.severity);

  return (
    <div className={`rounded-xl border p-3 ${styles.card}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {recommendation.severity === 'positive' ? (
            <CheckCircle2 className={`w-4 h-4 ${styles.icon}`} />
          ) : (
            <AlertTriangle className={`w-4 h-4 ${styles.icon}`} />
          )}
          <h4 className="text-sm font-bold">{recommendation.title}</h4>
        </div>
        <Badge variant={styles.badge} size="xs">
          {recommendation.severity}
        </Badge>
      </div>

      <p className="text-xs mt-1.5 leading-relaxed">{recommendation.reason}</p>

      <div className="mt-2 space-y-1 text-xs leading-relaxed">
        <p>
          <span className="font-semibold">Trigger:</span>{' '}
          {recommendation.trigger}
        </p>
        <p>
          <span className="font-semibold">Formula:</span>{' '}
          {recommendation.formula}
        </p>
        <p>
          <span className="font-semibold">Inputs:</span>{' '}
          {formatTwinInputs(recommendation.inputs)}
        </p>
        <p>
          <span className="font-semibold">Assumptions:</span>{' '}
          {recommendation.assumptions.join(' ')}
        </p>
        {recommendation.heuristic && recommendation.threshold && (
          <p>
            <span className="font-semibold">Heuristic threshold:</span>{' '}
            {recommendation.threshold.value} {recommendation.threshold.unit} —{' '}
            {recommendation.threshold.note}
          </p>
        )}
        {recommendation.suggestedAction && (
          <p>
            <span className="font-semibold">Suggested next step:</span>{' '}
            {recommendation.suggestedAction}
          </p>
        )}
      </div>
    </div>
  );
}

function ChangedAssumptionsNote({ changes }) {
  const list = Array.isArray(changes) ? changes : [];

  return (
    <p className="rounded-lg bg-white border border-slate-100 p-3 text-xs text-slate-600">
      <span className="font-semibold text-navy-900">Changed assumptions: </span>
      {list.length === 0
        ? 'No inputs were changed — the scenario matches the baseline as entered.'
        : list
            .map(
              ({ label, from, to }) =>
                `${label} ${from === null ? 'unset' : formatINR(from)} → ${formatINR(to)}`
            )
            .join('; ')}
      .
    </p>
  );
}

function GoalProjectionPanel({ preview }) {
  const baseline = preview.baseline.goalProjection;
  const scenario = preview.scenario.goalProjection;
  const comparison = preview.comparison.goalProjection;
  const explanation = preview.scenario.explanations.goalProjection;

  if (scenario.targetAmount === null) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-genie-700" />
          <h3 className="text-base font-bold text-navy-950">Goal projection</h3>
        </div>
        <p className="text-xs text-slate-600">
          Add a goal target amount in the baseline to estimate a timeline. The
          other scenario metrics still apply.
        </p>
      </Card>
    );
  }

  const completionComparison = comparison.completionDate;
  const timelineText = completionComparison.direction
    ? completionComparison.direction === 'same'
      ? 'The scenario timeline is unchanged.'
      : `The scenario timeline is ${Math.abs(
          completionComparison.differenceMonths
        )} month(s) ${completionComparison.direction}.`
    : 'The timelines cannot be compared because one side is unreachable.';

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-genie-700" />
          <h3 className="text-base font-bold text-navy-950">Goal projection</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {scenario.goalAchieved && (
            <Badge variant="green" size="xs">
              Goal achieved
            </Badge>
          )}
          {scenario.unreachable && (
            <Badge variant="amber" size="xs">
              Unreachable at current contribution
            </Badge>
          )}
          {scenario.onTrackForRequestedTimeline === true && (
            <Badge variant="green" size="xs">
              On track for requested timeline
            </Badge>
          )}
          {scenario.onTrackForRequestedTimeline === false && (
            <Badge variant="amber" size="xs">
              Timeline gap
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
          <div className="text-slate-500">Baseline months</div>
          <div className="font-bold text-navy-950 mt-0.5">
            {formatTwinMetric('months', baseline.estimatedMonths)}
          </div>
        </div>
        <div className="rounded-lg bg-genie-50 border border-genie-200 p-3">
          <div className="text-genie-800">Scenario months</div>
          <div className="font-bold text-genie-950 mt-0.5">
            {formatTwinMetric('months', scenario.estimatedMonths)}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
          <div className="text-slate-500">Baseline completion</div>
          <div className="font-bold text-navy-950 mt-0.5">
            {formatTwinDate(baseline.estimatedCompletionDate) || 'Not available'}
          </div>
        </div>
        <div className="rounded-lg bg-genie-50 border border-genie-200 p-3">
          <div className="text-genie-800">Scenario completion</div>
          <div className="font-bold text-genie-950 mt-0.5">
            {formatTwinDate(scenario.estimatedCompletionDate) || 'Not available'}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Remaining amount</div>
          <div className="font-semibold text-navy-900 mt-0.5">
            {formatINR(scenario.remainingAmount ?? 0)}
          </div>
        </div>
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Assumed monthly contribution</div>
          <div className="font-semibold text-navy-900 mt-0.5">
            {formatINR(scenario.assumedMonthlyContribution)}
          </div>
        </div>
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Timeline comparison</div>
          <div className="font-semibold text-navy-900 mt-0.5">
            {timelineText}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        <span className="font-semibold">Month-end rule:</span>{' '}
        {scenario.completionDateRule}
      </p>

      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-genie-800 hover:text-genie-900">
          Why this projection
        </summary>
        <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 border border-slate-100 p-2.5">
          <p>
            <span className="font-semibold text-navy-900">Formula:</span>{' '}
            {explanation.formula}
          </p>
          <p>
            <span className="font-semibold text-navy-900">Inputs:</span>{' '}
            {formatTwinInputs(explanation.inputs)}
          </p>
          <p>
            <span className="font-semibold text-navy-900">Assumptions:</span>{' '}
            {explanation.assumptions.join(' ')}
          </p>
          <p>
            <span className="font-semibold text-navy-900">Reason:</span>{' '}
            {explanation.reason}
          </p>

          {preview.scenario.explanations.goalMetrics && (
            <div className="mt-2 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Goal metric formulas
              </div>
              {Object.entries(preview.scenario.explanations.goalMetrics).map(
                ([key, item]) => (
                  <div
                    key={key}
                    className="rounded-lg bg-white border border-slate-100 p-2"
                  >
                    <div className="font-semibold text-navy-900">
                      {item.label}
                    </div>
                    <p>
                      <span className="font-semibold">Formula:</span>{' '}
                      {item.formula}
                    </p>
                    <p>
                      <span className="font-semibold">Inputs:</span>{' '}
                      {formatTwinInputs(item.inputs)}
                    </p>
                    <p>
                      <span className="font-semibold">Reason:</span>{' '}
                      {item.reason}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}

function SavedComparisonPanel({ data }) {
  const { comparison, baseline, scenario, baselineResult, scenarioResult } = data;
  const surplus = comparison.metrics.find(
    (item) => item.key === 'monthlySurplus'
  );
  const savingsRate = comparison.metrics.find(
    (item) => item.key === 'savingsRatePct'
  );
  const coverage = comparison.metrics.find(
    (item) => item.key === 'mandatoryOutflowCoverageMonths'
  );
  const emi = comparison.metrics.find((item) => item.key === 'emiBurdenPct');
  const goalMonths = comparison.goalProjection.estimatedMonths;

  return (
    <div className="mt-4 rounded-xl border border-genie-200 bg-genie-50/40 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-genie-700">
            Saved scenario comparison
          </div>
          <h4 className="text-sm font-bold text-navy-950 mt-0.5">
            {baseline.name} vs {scenario.name}
          </h4>
        </div>
        <Badge variant="green" size="xs">
          Recomputed from stored inputs
        </Badge>
      </div>

      <p className="mt-1.5 text-[11px] text-slate-500">
        Numbers read as Baseline → Scenario.
      </p>

      <div className="mt-2">
        <ChangedAssumptionsNote
          changes={buildChangedAssumptions(
            baseline.scenarioInputs,
            scenario.scenarioInputs
          )}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Monthly surplus</div>
          <div className="font-bold text-navy-950 mt-0.5">
            {formatTwinMetric('currency', surplus.baseline)} →{' '}
            {formatTwinMetric('currency', surplus.scenario)}
          </div>
          <div className="text-slate-500 mt-0.5">
            {formatTwinDifference(surplus)}
            {formatTwinPercentageChange(surplus)
              ? ` (${formatTwinPercentageChange(surplus)})`
              : ''}
          </div>
        </div>

        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Savings rate</div>
          <div className="font-bold text-navy-950 mt-0.5">
            {formatTwinMetric('percent', savingsRate.baseline)} →{' '}
            {formatTwinMetric('percent', savingsRate.scenario)}
          </div>
          <div className="text-slate-500 mt-0.5">
            {formatTwinDifference(savingsRate)}
          </div>
        </div>

        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Mandatory-outflow coverage</div>
          <div className="font-bold text-navy-950 mt-0.5">
            {formatTwinMetric('months', coverage.baseline)} →{' '}
            {formatTwinMetric('months', coverage.scenario)}
          </div>
          <div className="text-slate-500 mt-0.5">
            {formatTwinDifference(coverage)}
          </div>
        </div>

        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">EMI burden</div>
          <div className="font-bold text-navy-950 mt-0.5">
            {formatTwinMetric('percent', emi.baseline)} →{' '}
            {formatTwinMetric('percent', emi.scenario)}
          </div>
          <div className="text-slate-500 mt-0.5">
            {formatTwinDifference(emi)}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Months to goal</div>
          <div className="font-semibold text-navy-900 mt-0.5">
            {formatTwinMetric('months', goalMonths.baseline)} →{' '}
            {formatTwinMetric('months', goalMonths.scenario)}
          </div>
        </div>
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Recommendations added</div>
          <div className="font-semibold text-navy-900 mt-0.5">
            {comparison.recommendations.added.length}
          </div>
        </div>
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <div className="text-slate-500">Recommendations resolved</div>
          <div className="font-semibold text-navy-900 mt-0.5">
            {comparison.recommendations.resolved.length}
          </div>
        </div>
      </div>

      {baselineResult?.metrics && scenarioResult?.metrics && (
        <p className="mt-3 text-[11px] text-slate-500">
          Baseline surplus {formatINR(baselineResult.metrics.monthlySurplus)} ·
          Scenario surplus {formatINR(scenarioResult.metrics.monthlySurplus)}.
          Results are estimates, not predictions.
        </p>
      )}
    </div>
  );
}

export default function DigitalTwinPage() {
  const {
    latestAssessment,
    scenarios,
    loading: userDataLoading,
    error: userDataError,
    scenariosError,
    request,
    refresh,
    createScenario,
    updateScenario,
    deleteScenario,
    compareScenarios,
  } = useUserData();

  const [baselineForm, setBaselineForm] = useState(EMPTY_BASELINE);
  const [scenarioForm, setScenarioForm] = useState(EMPTY_SCENARIO);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [compareBaselineId, setCompareBaselineId] = useState('');
  const [compareScenarioId, setCompareScenarioId] = useState('');
  const [savedComparison, setSavedComparison] = useState(null);
  const [compareError, setCompareError] = useState('');
  const [comparing, setComparing] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);

  const userEditedRef = useRef(false);
  const prefilledRef = useRef(false);

  useEffect(() => {
    if (prefilledRef.current || userEditedRef.current) return;
    if (!latestAssessment?.inputs) return;

    setBaselineForm(baselineFromInputs(latestAssessment.inputs));
    setScenarioForm(EMPTY_SCENARIO);
    prefilledRef.current = true;
  }, [latestAssessment]);

  const baselinePayload = useMemo(
    () => buildBaselinePayload(baselineForm),
    [baselineForm]
  );
  const scenarioOverrides = useMemo(
    () => buildScenarioOverrides(scenarioForm),
    [scenarioForm]
  );
  const baselineReady = Boolean(baselinePayload);

  useEffect(() => {
    if (!baselineReady) {
      setPreview(null);
      setPreviewError('');
      setPreviewLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError('');

      try {
        const data = await request('/api/twin/preview', {
          method: 'POST',
          body: {
            baseline: baselinePayload,
            scenario: scenarioOverrides,
          },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setPreview(data);
      } catch (error) {
        if (error.name !== 'AbortError' && !controller.signal.aborted) {
          setPreviewError(
            error.message || 'Unable to calculate the scenario.'
          );
        }
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [baselinePayload, scenarioOverrides, baselineReady, request]);

  const updateBaseline = (field, value) => {
    userEditedRef.current = true;
    setBaselineForm((current) => ({ ...current, [field]: value }));
  };

  const updateScenarioField = (field, value) => {
    userEditedRef.current = true;
    setScenarioForm((current) => ({ ...current, [field]: value }));
  };

  const handleUseLatestAssessment = () => {
    if (!latestAssessment?.inputs) return;
    setBaselineForm(baselineFromInputs(latestAssessment.inputs));
    setScenarioForm(EMPTY_SCENARIO);
    setSaveMessage('Baseline loaded from your latest saved assessment.');
    setSaveError('');
    userEditedRef.current = false;
    prefilledRef.current = true;
  };

  const handleResetScenario = () => {
    setScenarioForm(EMPTY_SCENARIO);
    setSaveMessage('');
    setSaveError('');
  };

  const handleResetAll = () => {
    setBaselineForm(EMPTY_BASELINE);
    setScenarioForm(EMPTY_SCENARIO);
    setPreview(null);
    setPreviewError('');
    setScenarioName('');
    setSaveError('');
    setSaveMessage('');
    setCompareError('');
    setSavedComparison(null);
    userEditedRef.current = false;
    prefilledRef.current = true;
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!preview || !baselinePayload) return;

    const name = scenarioName.trim();
    if (!name) {
      setSaveError('Give this scenario a name before saving.');
      return;
    }

    setSaving(true);
    setSaveError('');
    setSaveMessage('');

    try {
      const saved = await createScenario({
        name,
        baseline: baselinePayload,
        scenario: scenarioOverrides,
        thresholds: {
          lowMandatoryCoverageMonths:
            preview.thresholds.lowMandatoryCoverageMonths,
          highEmiBurdenPct: preview.thresholds.highEmiBurdenPct,
        },
        asOfDate: preview.asOfDate,
      });
      setSaveMessage(`Saved "${saved.name}".`);
      setScenarioName('');
    } catch (error) {
      setSaveError(error.message || 'Unable to save the scenario.');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadScenario = (scenario) => {
    setBaselineForm(baselineFromInputs(scenario.baselineInputs));
    setScenarioForm(scenarioFromInputs(scenario.scenarioInputs));
    setScenarioName(scenario.name);
    setSaveMessage(`Loaded "${scenario.name}".`);
    setSaveError('');
    setCompareError('');
    userEditedRef.current = true;
    prefilledRef.current = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteScenario = async (scenario) => {
    const confirmed = window.confirm(
      `Delete "${scenario.name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setBusyId(scenario.id);
    setCompareError('');
    setSaveMessage('');

    try {
      await deleteScenario(scenario.id);
      if (compareBaselineId === scenario.id) setCompareBaselineId('');
      if (compareScenarioId === scenario.id) setCompareScenarioId('');
      if (
        savedComparison &&
        (savedComparison.baseline.id === scenario.id ||
          savedComparison.scenario.id === scenario.id)
      ) {
        setSavedComparison(null);
      }
      setSaveMessage(`Deleted "${scenario.name}".`);
    } catch (error) {
      setCompareError(error.message || 'Unable to delete the scenario.');
    } finally {
      setBusyId('');
    }
  };

  const handleCompareSaved = async (event) => {
    event.preventDefault();
    if (
      !compareBaselineId ||
      !compareScenarioId ||
      compareBaselineId === compareScenarioId
    ) {
      return;
    }

    setComparing(true);
    setCompareError('');
    setSavedComparison(null);

    try {
      const data = await compareScenarios(compareBaselineId, compareScenarioId);
      setSavedComparison(data);
    } catch (error) {
      setCompareError(error.message || 'Unable to compare the scenarios.');
    } finally {
      setComparing(false);
    }
  };

  const openRename = (scenario) => {
    setRenameTarget(scenario);
    setRenameValue(scenario.name);
    setRenameError('');
  };

  const closeRename = () => {
    if (renaming) return;
    setRenameTarget(null);
    setRenameValue('');
    setRenameError('');
  };

  const handleRename = async (event) => {
    event.preventDefault();
    if (!renameTarget) return;

    const name = renameValue.trim();
    if (!name) {
      setRenameError('Scenario name is required.');
      return;
    }

    setRenaming(true);
    setRenameError('');

    try {
      const updated = await updateScenario(renameTarget.id, { name });
      setSaveMessage(`Renamed scenario to "${updated.name}".`);
      setRenameTarget(null);
      setRenameValue('');
    } catch (error) {
      setRenameError(error.message || 'Unable to rename the scenario.');
    } finally {
      setRenaming(false);
    }
  };

  const metrics = preview?.scenario?.metrics;
  const comparisonMetrics = preview?.comparison?.metrics || [];
  const changedAssumptions = useMemo(
    () => buildChangedAssumptions(baselineForm, scenarioForm),
    [baselineForm, scenarioForm]
  );
  const recommendations = preview?.scenario?.recommendations || [];
  const comparisonRecommendations = preview?.comparison?.recommendations;
  const canCompareSaved =
    Boolean(compareBaselineId) &&
    Boolean(compareScenarioId) &&
    compareBaselineId !== compareScenarioId;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-genie-700 uppercase tracking-wider mb-1">
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Financial Digital Twin • What-if simulator</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
          Financial Digital Twin
        </h1>
        <p className="text-sm text-slate-600 mt-0.5 max-w-3xl">
          Adjust monthly income, expenses, EMI, accessible savings, and a
          one-time unexpected expense. The baseline stays unchanged while each
          scenario is recalculated independently. Every number includes its
          formula, inputs, assumptions, and reason.
        </p>
      </div>

      <Card className="border-genie-200 bg-genie-50/60">
        <div className="flex items-start gap-2 text-xs text-genie-900 leading-relaxed">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Estimate, not prediction.</strong>{' '}
            {preview?.estimateNotice ||
              'A scenario is an illustrative estimate calculated from the inputs supplied. It is not a prediction of future outcomes, a guarantee, or regulated financial advice.'}
          </span>
        </div>
      </Card>

      {(userDataError || scenariosError) && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{scenariosError || userDataError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-genie-700" />
                <div>
                  <h2 className="text-base font-bold text-navy-950">
                    Baseline (original)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Scenario adjustments never change these values.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleUseLatestAssessment}
                disabled={!latestAssessment?.inputs}
                className="shrink-0 text-xs font-semibold text-genie-700 hover:text-genie-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Use latest assessment
              </button>
            </div>

            <div className="space-y-4">
              <NumberField
                id="baselineIncome"
                label="Monthly income (₹)"
                value={baselineForm.monthlyIncome}
                onChange={(value) => updateBaseline('monthlyIncome', value)}
                placeholder="e.g. 75000"
                required
              />
              <NumberField
                id="baselineExpenses"
                label="Monthly expenses (₹)"
                value={baselineForm.monthlyExpenses}
                onChange={(value) => updateBaseline('monthlyExpenses', value)}
                placeholder="e.g. 40000"
                required
              />
              <NumberField
                id="baselineSavings"
                label="Accessible savings (₹)"
                value={baselineForm.accessibleSavings}
                onChange={(value) => updateBaseline('accessibleSavings', value)}
                placeholder="e.g. 150000"
                required
              />

              <div>
                <label
                  htmlFor="baselineGoal"
                  className="block text-xs font-semibold text-navy-900 mb-1"
                >
                  Financial goal <span className="text-rose-600">*</span>
                </label>
                <select
                  id="baselineGoal"
                  value={baselineForm.goal}
                  onChange={(event) => updateBaseline('goal', event.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                >
                  {ASSESSMENT_GOAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Optional personalisation
                </h3>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      id="baselineEmi"
                      label="EMI payments (₹)"
                      value={baselineForm.emiPayments}
                      onChange={(value) => updateBaseline('emiPayments', value)}
                      placeholder="e.g. 12000"
                    />
                    <NumberField
                      id="baselineCapacity"
                      label="Savings capacity (₹/mo)"
                      value={baselineForm.monthlySavingsCapacity}
                      onChange={(value) =>
                        updateBaseline('monthlySavingsCapacity', value)
                      }
                      placeholder="e.g. 15000"
                    />
                  </div>

                  <label className="flex items-start gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={baselineForm.emiIncludedInExpenses}
                      onChange={(event) =>
                        updateBaseline(
                          'emiIncludedInExpenses',
                          event.target.checked
                        )
                      }
                      className="mt-0.5 accent-genie-600"
                    />
                    <span>My monthly expenses already include EMI payments</span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      id="baselineTarget"
                      label="Goal target (₹)"
                      value={baselineForm.targetAmount}
                      onChange={(value) => updateBaseline('targetAmount', value)}
                      placeholder="e.g. 500000"
                      min="1"
                    />
                    <NumberField
                      id="baselineCurrentGoal"
                      label="Already saved (₹)"
                      value={baselineForm.currentGoalSavings}
                      onChange={(value) =>
                        updateBaseline('currentGoalSavings', value)
                      }
                      placeholder="e.g. 50000"
                    />
                  </div>

                  <NumberField
                    id="baselineTimeline"
                    label="Desired timeline (months)"
                    value={baselineForm.goalTimelineMonths}
                    onChange={(value) =>
                      updateBaseline('goalTimelineMonths', value)
                    }
                    placeholder="e.g. 24"
                    min="1"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-genie-700" />
                <div>
                  <h2 className="text-base font-bold text-navy-950">
                    What-if adjustments
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Only these inputs change in the scenario.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetScenario}
                className="shrink-0 text-xs font-semibold text-slate-600 hover:text-navy-900"
              >
                Reset to baseline
              </button>
            </div>

            <div className="space-y-4">
              <NumberField
                id="scenarioIncome"
                label="Monthly income (₹)"
                value={scenarioForm.monthlyIncome}
                onChange={(value) => updateScenarioField('monthlyIncome', value)}
                placeholder="Leave blank to inherit baseline"
                hint={
                  preview
                    ? `Baseline: ${formatINR(preview.baseline.metrics.monthlyIncome)}`
                    : undefined
                }
              />
              <NumberField
                id="scenarioExpenses"
                label="Monthly expenses (₹)"
                value={scenarioForm.monthlyExpenses}
                onChange={(value) => updateScenarioField('monthlyExpenses', value)}
                placeholder="Leave blank to inherit baseline"
                hint={
                  preview
                    ? `Baseline: ${formatINR(preview.baseline.metrics.monthlyExpenses)}`
                    : undefined
                }
              />
              <NumberField
                id="scenarioEmi"
                label="EMI payments (₹)"
                value={scenarioForm.emiPayments}
                onChange={(value) => updateScenarioField('emiPayments', value)}
                placeholder="Leave blank to inherit baseline"
                hint={
                  preview
                    ? `Baseline: ${formatINR(preview.baseline.metrics.emiPayments)}`
                    : undefined
                }
              />
              <NumberField
                id="scenarioSavings"
                label="Accessible savings (₹)"
                value={scenarioForm.accessibleSavings}
                onChange={(value) => updateScenarioField('accessibleSavings', value)}
                placeholder="Leave blank to inherit baseline"
                hint={
                  preview
                    ? `Baseline: ${formatINR(preview.baseline.metrics.accessibleSavings)}`
                    : undefined
                }
              />
              <NumberField
                id="scenarioShock"
                label="Unexpected one-time expense (₹)"
                value={scenarioForm.unexpectedExpense}
                onChange={(value) => updateScenarioField('unexpectedExpense', value)}
                placeholder="e.g. 50000"
                hint="Applied once to accessible savings; not deducted from monthly surplus."
              />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Save className="w-4 h-4 text-genie-700" />
              <h2 className="text-base font-bold text-navy-950">
                Save this scenario
              </h2>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label
                  htmlFor="scenarioName"
                  className="block text-xs font-semibold text-navy-900 mb-1"
                >
                  Scenario name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="scenarioName"
                  type="text"
                  maxLength={120}
                  value={scenarioName}
                  onChange={(event) => setScenarioName(event.target.value)}
                  placeholder="e.g. Job loss + medical bill"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                />
              </div>

              {saveError && (
                <div className="p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {saveMessage && (
                <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{saveMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!preview || saving}
                className="w-full px-4 py-2 bg-genie-600 hover:bg-genie-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saving ? 'Saving scenario...' : 'Save scenario'}</span>
              </button>

              <p className="text-[11px] text-slate-500">
                Saved scenarios store the baseline inputs, scenario inputs, and
                the calculated estimate. Loading a saved scenario recalculates
                from those inputs.
              </p>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-5">
          {!baselineReady ? (
            <Card className="p-10 text-center border-dashed border-2 border-slate-200 bg-slate-50/50">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
                <FlaskConical className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-navy-900 mb-1">
                Enter your baseline numbers
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Income, monthly expenses, and accessible savings are required.
                The Digital Twin will then recalculate the scenario as you type.
              </p>
            </Card>
          ) : (
            <>
              {previewError && (
                <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {previewLoading && !preview ? (
                <Card className="p-10 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
                  <span>Calculating baseline and scenario...</span>
                </Card>
              ) : preview ? (
                <>
                  <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-xs font-semibold uppercase tracking-wider text-genie-700">
                          Scenario result
                        </div>
                        <Badge variant="green" size="xs">
                          Estimate
                        </Badge>
                        {previewLoading && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-genie-600" />
                        )}
                      </div>
                      <h2 className="text-xl font-extrabold text-navy-950">
                        {formatINR(metrics.monthlySurplus)} monthly surplus
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        As of {formatTwinDate(preview.asOfDate)} • All amounts in
                        INR • Twin version {preview.twinVersion}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={twinToneForSurplus(metrics.monthlySurplus)}
                        size="sm"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>
                          Savings rate{' '}
                          {formatTwinMetric('percent', metrics.savingsRatePct)}
                        </span>
                      </Badge>
                      <Badge variant="amber" size="sm">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>
                          Coverage{' '}
                          {formatTwinMetric(
                            'months',
                            metrics.mandatoryOutflowCoverageMonths
                          )}
                        </span>
                      </Badge>
                    </div>
                  </Card>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ChangedAssumptionsNote changes={changedAssumptions} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {comparisonMetrics.map((item) => (
                      <MetricComparisonCard
                        key={item.key}
                        item={item}
                        explanation={
                          preview.scenario.explanations.metrics[item.key]
                        }
                      />
                    ))}
                  </div>

                  <GoalProjectionPanel preview={preview} />

                  <Card>
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-genie-700" />
                      <h3 className="text-base font-bold text-navy-950">
                        Explainable recommendations
                      </h3>
                      <Badge variant="slate" size="xs">
                        {recommendations.length}
                      </Badge>
                    </div>

                    {recommendations.length === 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          No configured heuristic flags were triggered. This does
                          not mean the scenario is risk-free; review the
                          assumptions and your own circumstances.
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {recommendations.map((recommendation) => (
                          <RecommendationCard
                            key={recommendation.id}
                            recommendation={recommendation}
                          />
                        ))}
                      </div>
                    )}

                    {comparisonRecommendations && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                          <div className="text-slate-500">
                            Added versus baseline
                          </div>
                          <div className="font-semibold text-navy-900 mt-0.5">
                            {comparisonRecommendations.added.length === 0
                              ? 'None'
                              : comparisonRecommendations.added
                                  .map((item) => item.title)
                                  .join(', ')}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                          <div className="text-slate-500">
                            Resolved versus baseline
                          </div>
                          <div className="font-semibold text-navy-900 mt-0.5">
                            {comparisonRecommendations.resolved.length === 0
                              ? 'None'
                              : comparisonRecommendations.resolved
                                  .map((item) => item.title)
                                  .join(', ')}
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>

                  <Card className="border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-slate-500" />
                      <h3 className="text-sm font-bold text-navy-950">
                        Assumptions and limits
                      </h3>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                      {preview.scenario.assumptions.map((assumption, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>{assumption}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                      {preview.scenario.disclaimer}
                    </p>
                  </Card>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      <section aria-labelledby="saved-scenarios-heading">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <h2
              id="saved-scenarios-heading"
              className="text-base font-bold text-navy-950"
            >
              Saved scenarios
            </h2>
            <Badge variant="slate" size="xs">
              {scenarios.length} saved
            </Badge>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="text-xs font-semibold text-slate-500 hover:text-navy-900 inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-genie-700" />
            <h3 className="text-sm font-bold text-navy-950">
              Compare two saved scenarios
            </h3>
          </div>

          <form
            onSubmit={handleCompareSaved}
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
          >
            <div>
              <label
                htmlFor="compareBaseline"
                className="block text-xs font-semibold text-navy-900 mb-1"
              >
                Baseline scenario
              </label>
              <select
                id="compareBaseline"
                value={compareBaselineId}
                onChange={(event) => setCompareBaselineId(event.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              >
                <option value="">Choose a scenario</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="compareScenario"
                className="block text-xs font-semibold text-navy-900 mb-1"
              >
                Scenario to compare
              </label>
              <select
                id="compareScenario"
                value={compareScenarioId}
                onChange={(event) => setCompareScenarioId(event.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              >
                <option value="">Choose a scenario</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!canCompareSaved || comparing}
              className="px-4 py-2 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
            >
              {comparing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Target className="w-4 h-4" />
              )}
              <span>{comparing ? 'Comparing...' : 'Compare'}</span>
            </button>
          </form>

          {compareError && (
            <div className="mt-3 p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{compareError}</span>
            </div>
          )}

          {savedComparison && <SavedComparisonPanel data={savedComparison} />}
        </Card>

        {userDataLoading ? (
          <Card className="p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
            <span>Loading your saved scenarios...</span>
          </Card>
        ) : scenarios.length === 0 ? (
          <Card className="p-8 text-center border-dashed border-2 border-slate-200 bg-slate-50/50">
            <FlaskConical className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-navy-900">
              No saved scenarios yet
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Adjust the what-if inputs above and save your first scenario to
              compare it later.
            </p>
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-slate-100">
              {scenarios.map((scenario) => {
                const baselineSurplus =
                  scenario.result?.baseline?.metrics?.monthlySurplus;
                const scenarioSurplus =
                  scenario.result?.scenario?.metrics?.monthlySurplus;
                const isBusy = busyId === scenario.id;

                return (
                  <div
                    key={scenario.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-genie-50 text-genie-700 flex items-center justify-center shrink-0">
                        <FlaskConical className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-navy-900 truncate">
                          {scenario.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          Updated {formatTwinDateTime(scenario.updatedAt)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <div className="text-right text-xs">
                        <div className="text-[11px] text-slate-400">
                          Monthly surplus
                        </div>
                        <div className="font-bold text-navy-900">
                          {formatINR(baselineSurplus ?? 0)} →{' '}
                          <span
                            className={
                              (scenarioSurplus ?? 0) >= 0
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }
                          >
                            {formatINR(scenarioSurplus ?? 0)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadScenario(scenario)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-navy-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Load</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openRename(scenario)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-navy-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Rename</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteScenario(scenario)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 transition-colors"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </section>

      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={closeRename}
        title="Rename scenario"
        subtitle={renameTarget?.name}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRename} className="space-y-3">
          <div>
            <label
              htmlFor="renameScenario"
              className="block text-xs font-semibold text-navy-900 mb-1"
            >
              Scenario name
            </label>
            <input
              id="renameScenario"
              type="text"
              maxLength={120}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
            />
          </div>

          {renameError && (
            <div className="p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{renameError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeRename}
              disabled={renaming}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-navy-900 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={renaming}
              className="px-4 py-2 bg-genie-600 hover:bg-genie-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              {renaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
              <span>{renaming ? 'Renaming...' : 'Rename'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
