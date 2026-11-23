import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  getConceptState,
  getProgressSummary,
  localProgressBelongsToUser,
  mergeLearningProgressSnapshots,
  readLearningProgress,
} from '../utils/learningProgress';
import { fetchAccountLearningProgress } from '../utils/learningProgressApi';

// The roadmap and lesson list are static per server deploy, so one request per
// page load is shared by every component that needs them (Home, search, ...).
let curriculumRequest = null;
let lessonsRequest = null;

function fetchJson(path) {
  return fetch(apiUrl(path)).then((response) => {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  });
}

export function loadCurriculum() {
  if (!curriculumRequest) {
    curriculumRequest = fetchJson('/api/learn/curriculum').catch((error) => {
      curriculumRequest = null; // allow a retry on the next mount
      throw error;
    });
  }
  return curriculumRequest;
}

export function loadLessonCatalog() {
  if (!lessonsRequest) {
    lessonsRequest = fetchJson('/api/learn/lessons')
      .then((body) => {
        const byConceptId = {};
        for (const item of body?.lessons || []) byConceptId[item.conceptId] = item;
        return byConceptId;
      })
      .catch((error) => {
        lessonsRequest = null;
        throw error;
      });
  }
  return lessonsRequest;
}

/** Curriculum + lesson metadata only (no progress); used by the search box. */
export function useCurriculum() {
  const [state, setState] = useState({ concepts: [], lessons: {}, loading: true, error: '' });

  useEffect(() => {
    let active = true;
    Promise.all([loadCurriculum(), loadLessonCatalog().catch(() => ({}))])
      .then(([curriculum, lessons]) => {
        if (active) {
          setState({ concepts: curriculum.concepts || [], lessons, loading: false, error: '' });
        }
      })
      .catch((error) => {
        if (active) setState((prev) => ({ ...prev, loading: false, error: error.message }));
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

/**
 * Read-only learning snapshot for the dashboard: what the learner finished
 * and which unlocked lessons come next. It never writes progress; the Learn
 * page remains the single place that records and syncs completions.
 */
export function useLearningOverview() {
  const { session } = useAuth();
  const { concepts, lessons, loading: curriculumLoading, error } = useCurriculum();
  const [completedIds, setCompletedIds] = useState([]);
  const [progressLoading, setProgressLoading] = useState(true);

  const token = session?.access_token;
  const userId = session?.user?.id || null;

  useEffect(() => {
    if (curriculumLoading) return undefined;

    let active = true;
    const controller = new AbortController();
    const local = readLearningProgress(undefined, concepts);
    const usableLocal = localProgressBelongsToUser(local, userId)
      ? local
      : { completedConceptIds: [] };
    setCompletedIds(usableLocal.completedConceptIds || []);

    if (!token) {
      setProgressLoading(false);
      return undefined;
    }

    fetchAccountLearningProgress(token, { signal: controller.signal })
      .then((remote) => {
        if (!active) return;
        const merged = mergeLearningProgressSnapshots(usableLocal, remote || {}, concepts);
        setCompletedIds(merged.completedConceptIds || []);
      })
      .catch(() => {
        // Browser progress is still shown when the account copy is unreachable.
      })
      .finally(() => {
        if (active) setProgressLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [curriculumLoading, concepts, token, userId]);

  const derived = useMemo(() => {
    const summary = getProgressSummary(concepts, completedIds);
    const nextConcepts = concepts.filter(
      (concept) => getConceptState(concept, completedIds) === 'available'
    );
    return { summary, nextConcepts };
  }, [concepts, completedIds]);

  return {
    concepts,
    lessons,
    completedIds,
    ...derived,
    loading: curriculumLoading || progressLoading,
    error,
  };
}
