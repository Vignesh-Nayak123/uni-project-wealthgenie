import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ProgressBar from '../components/common/ProgressBar';
import LearningRoadmap from '../components/learning/LearningRoadmap';
import LessonPanel from '../components/learning/LessonPanel';
import LockedConceptModal from '../components/learning/LockedConceptModal';
import {
  clearLearningProgress,
  completeLearningConcept,
  createEmptyLearningProgress,
  getConceptState,
  getNewlyUnlockedConcepts,
  getProgressSummary,
  localProgressBelongsToUser,
  mergeLearningProgressSnapshots,
  readLearningProgress,
  recordQuizProgress,
  writeLearningProgress,
} from '../utils/learningProgress';
import {
  deleteAccountLearningProgress,
  fetchAccountLearningProgress,
  mergeAccountLearningProgress,
} from '../utils/learningProgressApi';
import { useAuth } from '../context/AuthContext';

function CurriculumSkeleton() {
  return (
    <Card className="p-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-genie-600" />
        Loading the verified learning roadmap...
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="animate-pulse rounded-xl border border-slate-100 p-4">
            <div className="h-8 w-8 rounded-lg bg-slate-100" />
            <div className="mt-3 h-3 w-1/2 rounded bg-slate-100" />
            <div className="mt-2 h-3 w-full rounded bg-slate-100" />
            <div className="mt-4 h-16 rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function ResetProgressModal({ isOpen, onClose, onReset }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reset learning progress?"
      subtitle="This clears your saved learning progress, including the account copy when you are signed in."
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Every completed concept will be cleared and dependent nodes will lock again. This action
            cannot be undone.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 hover:bg-slate-50"
          >
            Keep my progress
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Reset progress
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function LearnPage({ onAskGenieAboutLesson }) {
  const { session, handleUnauthorized } = useAuth();
  const [curriculum, setCurriculum] = useState(null);
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [curriculumError, setCurriculumError] = useState('');
  const [curriculumReloadKey, setCurriculumReloadKey] = useState(0);
  const [aiStatus, setAiStatus] = useState({
    checked: false,
    isConfigured: false,
    error: false,
  });
  const [progress, setProgress] = useState(createEmptyLearningProgress());
  const [curatedLessons, setCuratedLessons] = useState({});
  const [selectedConcept, setSelectedConcept] = useState(null);
  const [lessonReloadKey, setLessonReloadKey] = useState(0);
  const [lockedConcept, setLockedConcept] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const [progressSync, setProgressSync] = useState('local');

  useEffect(() => {
    const controller = new AbortController();

    async function loadCurriculum() {
      setCurriculumLoading(true);
      setCurriculumError('');

      try {
        const response = await fetch('/api/learn/curriculum', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`The curriculum service returned HTTP ${response.status}.`);
        }

        const body = await response.json();
        if (
          !Array.isArray(body.branches) ||
          !Array.isArray(body.concepts) ||
          body.concepts.length === 0
        ) {
          throw new Error('The curriculum response was invalid.');
        }

        setCurriculum(body);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setCurriculumError(
          error.message || 'Could not load the learning roadmap from the backend.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setCurriculumLoading(false);
        }
      }
    }

    loadCurriculum();
    return () => controller.abort();
  }, [curriculumReloadKey]);

  useEffect(() => {
    let active = true;

    fetch('/api/ai/status')
      .then((response) => response.json())
      .then((body) => {
        if (!active) return;
        setAiStatus({
          checked: true,
          isConfigured: Boolean(body.isConfigured),
          error: false,
        });
      })
      .catch(() => {
        if (!active) return;
        setAiStatus({ checked: true, isConfigured: false, error: true });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetch('/api/learn/lessons')
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!active || !body || !Array.isArray(body.lessons)) return;
        const byConceptId = {};
        for (const item of body.lessons) {
          byConceptId[item.conceptId] = item;
        }
        setCuratedLessons(byConceptId);
      })
      .catch(() => {
        // The roadmap still works without curated lesson metadata.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!curriculum) return undefined;

    let active = true;
    const controller = new AbortController();
    const userId = session?.user?.id || null;
    const localProgress = readLearningProgress(undefined, curriculum.concepts);
    const usableLocal = localProgressBelongsToUser(localProgress, userId)
      ? localProgress
      : createEmptyLearningProgress();
    setProgress(usableLocal);

    if (!session?.access_token) {
      setProgressSync('local');
      return () => {
        active = false;
      };
    }

    setProgressSync('syncing');

    (async () => {
      try {
        const remoteProgress = await fetchAccountLearningProgress(
          session.access_token,
          { signal: controller.signal }
        );
        if (!active) return;

        const merged = {
          ...mergeLearningProgressSnapshots(
            usableLocal,
            remoteProgress || {},
            curriculum.concepts
          ),
          ownerUserId: userId,
        };
        setProgress(merged);
        writeLearningProgress(merged);

        const saved = await mergeAccountLearningProgress(
          session.access_token,
          merged,
          { signal: controller.signal }
        );
        if (!active) return;

        if (saved) {
          const reconciled = {
            ...mergeLearningProgressSnapshots(
              merged,
              saved,
              curriculum.concepts
            ),
            ownerUserId: userId,
          };
          setProgress(reconciled);
          writeLearningProgress(reconciled);
        }

        setProgressSync('synced');
      } catch (error) {
        if (error.name === 'AbortError') return;
        await handleUnauthorized(error);
        if (!active) return;
        setProgressSync('error');
        setStorageWarning(
          'Your progress is saved in this browser, but it could not be synced to your account. It will sync next time the account is reachable.'
        );
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [curriculum, session?.access_token, session?.user?.id, handleUnauthorized]);

  const syncProgressToAccount = useCallback(
    async (nextProgress) => {
      if (!session?.access_token || !curriculum) {
        setProgressSync('local');
        return;
      }

      setProgressSync('syncing');

      try {
        const saved = await mergeAccountLearningProgress(
          session.access_token,
          nextProgress
        );
        if (saved) {
          const reconciled = {
            ...mergeLearningProgressSnapshots(
              nextProgress,
              saved,
              curriculum.concepts
            ),
            ownerUserId: session?.user?.id || null,
          };
          setProgress(reconciled);
          writeLearningProgress(reconciled);
        }
        setProgressSync('synced');
        setStorageWarning('');
      } catch (error) {
        await handleUnauthorized(error);
        setProgressSync('error');
        setStorageWarning(
          'Your progress is saved in this browser, but it could not be synced to your account. It will sync next time the account is reachable.'
        );
      }
    },
    [curriculum, session?.access_token, session?.user?.id, handleUnauthorized]
  );

  const summary = useMemo(() => {
    if (!curriculum) {
      return { total: 0, completedCount: 0, availableCount: 0, lockedCount: 0, percent: 0 };
    }
    return getProgressSummary(curriculum.concepts, progress.completedConceptIds);
  }, [curriculum, progress.completedConceptIds]);

  const curatedLessonCount = Object.keys(curatedLessons).length;

  const handleSelectConcept = (concept) => {
    const state = getConceptState(concept, progress.completedConceptIds);
    if (state === 'locked') {
      setLockedConcept(concept);
      return;
    }
    setSelectedConcept(concept);
  };

  const handleSelectPrerequisite = (concept) => {
    setLockedConcept(null);
    const state = getConceptState(concept, progress.completedConceptIds);
    if (state === 'locked') {
      setLockedConcept(concept);
      return;
    }
    setSelectedConcept(concept);
  };

  const handleCompleteConcept = (concept, quizScore) => {
    if (!curriculum) {
      return { ok: false, reason: 'curriculum-not-ready' };
    }

    const beforeCompletedIds = progress.completedConceptIds;
    const result = completeLearningConcept(progress, concept, curriculum.concepts);

    if (!result.changed) {
      return {
        ok: false,
        reason: result.reason,
        missingPrerequisites: result.missingPrerequisites,
      };
    }

    let nextProgress = result.progress;
    if (quizScore) {
      nextProgress = recordQuizProgress(
        nextProgress,
        concept.id,
        quizScore,
        curriculum.concepts
      ).progress;
    }

    const storageSaved = writeLearningProgress(nextProgress);
    setProgress(nextProgress);
    setStorageWarning(
      storageSaved
        ? ''
        : 'Progress could not be saved in this browser. It may reset when you refresh.'
    );
    void syncProgressToAccount(nextProgress);

    return {
      ok: true,
      storageSaved,
      newlyUnlocked: getNewlyUnlockedConcepts(
        curriculum.concepts,
        beforeCompletedIds,
        nextProgress.completedConceptIds
      ),
    };
  };

  const handleQuizProgress = (concept, quizScore) => {
    if (!curriculum || !concept || !quizScore) return;

    const result = recordQuizProgress(
      progress,
      concept.id,
      quizScore,
      curriculum.concepts
    );
    if (!result.changed) return;

    writeLearningProgress(result.progress);
    setProgress(result.progress);
    void syncProgressToAccount(result.progress);
  };

  const handleResetProgress = () => {
    const cleared = clearLearningProgress();
    setProgress(cleared);
    setStorageWarning('');
    setSelectedConcept(null);
    setLockedConcept(null);
    setResetOpen(false);

    if (session?.access_token) {
      setProgressSync('syncing');
      deleteAccountLearningProgress(session.access_token)
        .then(() => setProgressSync('synced'))
        .catch(async (error) => {
          await handleUnauthorized(error);
          setProgressSync('error');
          setStorageWarning(
            'Progress was cleared in this browser, but the account copy could not be cleared. Try resetting again when the server is reachable.'
          );
        });
    } else {
      setProgressSync('local');
    }
  };

  const handleAskGenie = (conceptTitle) => {
    setSelectedConcept(null);
    if (onAskGenieAboutLesson) {
      onAskGenieAboutLesson(`Can you explain more about: "${conceptTitle}"?`);
    }
  };

  const aiBadge = !aiStatus.checked
    ? { variant: 'slate', label: 'Checking AI tutor' }
    : aiStatus.error
      ? { variant: 'amber', label: 'AI status unavailable' }
      : aiStatus.isConfigured
        ? { variant: 'green', label: 'AI Tutor Ready' }
        : { variant: 'amber', label: 'AI Setup Required' };

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-genie-700 mb-1">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Prerequisite-Based Financial Curriculum</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-950">
            Learning Roadmap
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Follow connected branches from money basics to investing and financial safety. Complete
            a concept to unlock the nodes that depend on it.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={aiBadge.variant} size="xs">
              <Sparkles className="h-3 w-3" />
              {aiBadge.label}
            </Badge>
            <Badge variant="slate" size="xs">
              {summary.total} concepts
            </Badge>
            {curatedLessonCount > 0 && (
              <Badge variant="amber" size="xs">
                <ShieldCheck className="h-3 w-3" />
                {curatedLessonCount} source-checked
              </Badge>
            )}
            <Badge variant={progressSync === 'error' ? 'amber' : 'slate'} size="xs">
              {session
                ? progressSync === 'syncing'
                  ? 'Syncing progress'
                  : progressSync === 'synced'
                    ? 'Progress synced to account'
                    : progressSync === 'error'
                      ? 'Browser-only progress'
                      : 'Progress saved in this browser'
                : 'Progress saved in this browser'}
            </Badge>
          </div>
        </div>

        <Card padding="sm" className="w-full max-w-sm shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium text-slate-500">Completed concepts</div>
              <div className="mt-0.5 text-2xl font-extrabold leading-none text-navy-950">
                {summary.completedCount}
                <span className="ml-1 text-sm font-medium text-slate-400">/ {summary.total}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-genie-700">{summary.percent}%</div>
              <div className="text-[10px] font-medium text-slate-500">
                {summary.availableCount} ready
              </div>
            </div>
          </div>

          <ProgressBar
            value={summary.completedCount}
            max={Math.max(summary.total, 1)}
            size="sm"
            className="mt-3"
          />

          <button
            type="button"
            onClick={() => setResetOpen(true)}
            disabled={summary.completedCount === 0}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-navy-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reset progress
          </button>
        </Card>
      </div>

      {aiStatus.checked && !aiStatus.isConfigured && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>
            <strong className="font-semibold">AI tutor is optional.</strong>{' '}
            {curatedLessonCount > 0
              ? `All ${curatedLessonCount} roadmap lessons are published from source-checked content and open without AI. `
              : ''}
            {aiStatus.error
              ? 'The backend AI status could not be checked, so the optional AI tutor may be unavailable. Lesson reading, quizzes and progress are unaffected.'
              : 'Add GEMINI_API_KEY only if you want the optional AI tutor. The roadmap, curated lessons, quizzes and progress work without it.'}
          </p>
        </div>
      )}

      {storageWarning && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>{storageWarning}</p>
        </div>
      )}

      <Card padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold text-navy-900">Roadmap legend</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-genie-600 text-white">
              <CheckCircle2 className="h-3 w-3" />
            </span>
            Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-genie-300 bg-genie-50 text-genie-700">
              <Play className="h-3 w-3" />
            </span>
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-400">
              <Lock className="h-3 w-3" />
            </span>
            Locked
          </span>
        </div>
        <p className="text-[10px] text-slate-400">
          Locked nodes show exactly which prerequisite is still incomplete.
        </p>
      </Card>

      {curriculumLoading && <CurriculumSkeleton />}

      {!curriculumLoading && curriculumError && (
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <h2 className="mt-3 text-base font-bold text-navy-950">Could not load the roadmap</h2>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            {curriculumError} No fallback curriculum is being displayed.
          </p>
          <button
            type="button"
            onClick={() => setCurriculumReloadKey((key) => key + 1)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </Card>
      )}

      {!curriculumLoading && curriculum && (
        <Card padding="sm" className="bg-slate-50/50">
          <LearningRoadmap
            branches={curriculum.branches}
            concepts={curriculum.concepts}
            completedConceptIds={progress.completedConceptIds}
            onSelectConcept={handleSelectConcept}
            onSelectLocked={setLockedConcept}
          />
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3.5 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p>
          {session
            ? 'Learning progress is saved to your account and cached in this browser under '
            : 'Learning progress is stored locally in this browser under '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-navy-700">
            wealthgenie.learningProgress.v1
          </code>
          {session
            ? '. Browser progress is merged into your account when you sign in, and only you can read or change your account record. It is not shared with the AI provider.'
            : '. It is not synced to an account or shared with the AI provider.'}
        </p>
      </div>

      {selectedConcept && (
        <Modal
          isOpen={Boolean(selectedConcept)}
          onClose={() => setSelectedConcept(null)}
          title={selectedConcept.title}
          subtitle={
            curatedLessons[selectedConcept.id]
              ? `${selectedConcept.category} • ${curatedLessons[selectedConcept.id].reviewLabel}`
              : `${selectedConcept.category} • Live AI lesson`
          }
          maxWidth="max-w-3xl"
        >
          <ErrorBoundary
            key={selectedConcept.id}
            title="This lesson could not be displayed"
            message="The lesson panel hit an unexpected problem while rendering. Nothing partial is shown, so try loading the lesson again."
            retryLabel="Reload lesson"
            onRetry={() => setLessonReloadKey((key) => key + 1)}
          >
            <LessonPanel
              key={`${selectedConcept.id}-${lessonReloadKey}`}
              concept={selectedConcept}
              isCompleted={progress.completedConceptIds.includes(selectedConcept.id)}
              onComplete={handleCompleteConcept}
              onQuizProgress={handleQuizProgress}
              onAskGenie={onAskGenieAboutLesson ? handleAskGenie : null}
              onClose={() => setSelectedConcept(null)}
            />
          </ErrorBoundary>
        </Modal>
      )}

      {lockedConcept && (
        <LockedConceptModal
          concept={lockedConcept}
          concepts={curriculum?.concepts || []}
          completedConceptIds={progress.completedConceptIds}
          onClose={() => setLockedConcept(null)}
          onSelectPrerequisite={handleSelectPrerequisite}
        />
      )}

      <ResetProgressModal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onReset={handleResetProgress}
      />
    </div>
  );
}
