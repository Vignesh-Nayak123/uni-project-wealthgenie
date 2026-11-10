import { apiRequest } from '../lib/api';

function progressBody(progress) {
  return {
    completedConceptIds: Array.isArray(progress?.completedConceptIds)
      ? progress.completedConceptIds
      : [],
    quizProgress:
      progress?.quizProgress && typeof progress.quizProgress === 'object'
        ? progress.quizProgress
        : {},
  };
}

export async function fetchAccountLearningProgress(token, options = {}) {
  const body = await apiRequest('/api/learn/progress', {
    token,
    signal: options.signal,
  });
  return body?.progress || null;
}

export async function mergeAccountLearningProgress(token, progress, options = {}) {
  const body = await apiRequest('/api/learn/progress/merge', {
    method: 'POST',
    token,
    body: progressBody(progress),
    signal: options.signal,
  });
  return body?.progress || null;
}

export async function replaceAccountLearningProgress(token, progress, options = {}) {
  const body = await apiRequest('/api/learn/progress', {
    method: 'PUT',
    token,
    body: progressBody(progress),
    signal: options.signal,
  });
  return body?.progress || null;
}

export async function deleteAccountLearningProgress(token, options = {}) {
  return apiRequest('/api/learn/progress', {
    method: 'DELETE',
    token,
    signal: options.signal,
  });
}
