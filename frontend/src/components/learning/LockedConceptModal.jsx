import React from 'react';
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import Modal from '../common/Modal';
import {
  getConceptState,
  getMissingPrerequisites,
} from '../../utils/learningProgress';

export default function LockedConceptModal({
  concept,
  concepts,
  completedConceptIds,
  onClose,
  onSelectPrerequisite,
}) {
  const missingPrerequisites = getMissingPrerequisites(
    concept,
    concepts,
    completedConceptIds
  );

  return (
    <Modal
      isOpen={Boolean(concept)}
      onClose={onClose}
      title="Locked concept"
      subtitle={concept?.title}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-200">
            <Lock className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-navy-950">Complete these prerequisites first</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              <strong className="font-semibold text-navy-900">{concept?.title}</strong> unlocks only
              after every prerequisite below is completed.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {missingPrerequisites.map((prerequisite) => {
            const state = getConceptState(prerequisite, completedConceptIds);
            const prerequisiteMissing = getMissingPrerequisites(
              prerequisite,
              concepts,
              completedConceptIds
            );
            const isReady = state === 'available';

            return (
              <button
                key={prerequisite.id}
                type="button"
                disabled={!isReady}
                onClick={() => onSelectPrerequisite(prerequisite)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                  isReady
                    ? 'border-genie-200 bg-genie-50/60 hover:border-genie-300 hover:bg-genie-50'
                    : 'cursor-not-allowed border-slate-200 bg-white opacity-75'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-navy-950">{prerequisite.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {isReady
                      ? 'Ready to start now'
                      : prerequisiteMissing.length > 0
                        ? `Still needs: ${prerequisiteMissing.map((item) => item.title).join(', ')}`
                        : 'Complete the remaining prerequisites'}
                  </p>
                </div>
                {isReady ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-genie-700">
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-genie-200 bg-genie-50/60 p-3 text-[11px] leading-relaxed text-genie-900">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-genie-700" />
          <p>
            Your progress is stored in this browser only. Completed concepts stay completed until
            you explicitly reset the roadmap.
          </p>
        </div>
      </div>
    </Modal>
  );
}
