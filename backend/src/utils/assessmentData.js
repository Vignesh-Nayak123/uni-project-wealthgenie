function normalizeCurrentGoalSavings(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string' && value.trim() === '') return 0;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function assessmentInsertRow(input, assessment, userId) {
  return {
    user_id: userId,
    assessment_version: assessment.assessmentVersion,
    goal: assessment.goal,
    monthly_income: assessment.metrics.monthlyIncome,
    monthly_expenses: assessment.metrics.monthlyExpenses,
    accessible_savings: assessment.metrics.accessibleSavings,
    emi_payments: assessment.metrics.emiPayments,
    emi_included_in_expenses: assessment.metrics.emiIncludedInExpenses,
    monthly_savings_capacity: assessment.metrics.monthlySavingsCapacity,
    target_amount: assessment.goalProjection?.targetAmount ?? null,
    current_goal_savings:
      assessment.goalProjection?.currentGoalSavings ??
      normalizeCurrentGoalSavings(input.currentGoalSavings),
    goal_timeline_months: assessment.goalProjection?.requestedTimelineMonths ?? null,
    result: assessment,
  };
}

export function mapAssessmentRow(row) {
  return {
    id: row.id,
    goal: row.goal,
    assessmentVersion: row.assessment_version,
    inputs: {
      monthlyIncome: Number(row.monthly_income),
      monthlyExpenses: Number(row.monthly_expenses),
      accessibleSavings: Number(row.accessible_savings),
      emiPayments: Number(row.emi_payments),
      emiIncludedInExpenses: row.emi_included_in_expenses,
      monthlySavingsCapacity:
        row.monthly_savings_capacity === null ? null : Number(row.monthly_savings_capacity),
      targetAmount: row.target_amount === null ? null : Number(row.target_amount),
      currentGoalSavings: Number(row.current_goal_savings),
      goalTimelineMonths: row.goal_timeline_months,
    },
    result: row.result,
    createdAt: row.created_at,
  };
}
