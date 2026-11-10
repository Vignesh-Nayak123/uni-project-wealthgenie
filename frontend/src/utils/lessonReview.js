/**
 * Presentation helpers for lesson review status.
 *
 * The backend is the source of truth for the label; these helpers only decide
 * how it is presented, and they never upgrade a status to "approved".
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const REVIEW_VIEWS = {
  draft: {
    label: 'Draft — not source checked',
    tone: 'slate',
    isApproved: false,
    detail: 'This lesson is still being written and has not been checked against sources.',
  },
  'source-checked': {
    label: 'Source checked — awaiting human review',
    tone: 'amber',
    isApproved: false,
    detail:
      'Every claim has been checked against the cited official sources, but no human reviewer has signed off yet.',
  },
  reviewed: {
    label: 'Human reviewed',
    tone: 'green',
    isApproved: true,
    detail: 'A named human reviewer has signed off this lesson.',
  },
  retired: {
    label: 'Retired',
    tone: 'slate',
    isApproved: false,
    detail: 'This lesson has been withdrawn and should not be used.',
  },
};

export function getReviewStatusView(review) {
  const status = typeof review?.status === 'string' ? review.status : 'draft';
  const view = REVIEW_VIEWS[status] || REVIEW_VIEWS.draft;

  return {
    status,
    label: typeof review?.label === 'string' && review.label ? review.label : view.label,
    tone: view.tone,
    isApproved: view.isApproved,
    isHumanReviewed: Boolean(review?.isHumanReviewed),
    detail: view.detail,
    sourceCheckedAt: review?.sourceCheckedAt || null,
    nextReviewAt: review?.nextReviewAt || null,
    reviewedBy: review?.reviewedBy || null,
    reviewedAt: review?.reviewedAt || null,
  };
}

/**
 * Formats an ISO calendar date (YYYY-MM-DD) without timezone shifts.
 */
export function formatContentDate(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '';

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const month = MONTHS[monthIndex];

  if (!month || day < 1 || day > 31) return '';
  return `${day} ${month} ${year}`;
}
