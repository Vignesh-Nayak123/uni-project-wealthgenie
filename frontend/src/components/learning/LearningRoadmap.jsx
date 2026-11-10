import React from 'react';
import {
  Wallet,
  PiggyBank,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  Check,
  Lock,
  Play,
  ArrowRight,
} from 'lucide-react';
import {
  getConceptState,
  getMissingPrerequisites,
} from '../../utils/learningProgress';

const BRANCH_STYLES = {
  'money-basics': {
    icon: Wallet,
    iconClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    lineClass: 'bg-emerald-200/80',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
    progressClass: 'bg-emerald-500',
    availableClass: 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-400',
  },
  saving: {
    icon: PiggyBank,
    iconClass: 'bg-blue-50 text-blue-700 border-blue-200',
    lineClass: 'bg-blue-200/80',
    dotClass: 'bg-blue-500',
    textClass: 'text-blue-700',
    progressClass: 'bg-blue-500',
    availableClass: 'border-blue-300 bg-blue-50/30 hover:border-blue-400',
  },
  'growing-money': {
    icon: TrendingUp,
    iconClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    lineClass: 'bg-indigo-200/80',
    dotClass: 'bg-indigo-500',
    textClass: 'text-indigo-700',
    progressClass: 'bg-indigo-500',
    availableClass: 'border-indigo-300 bg-indigo-50/30 hover:border-indigo-400',
  },
  investing: {
    icon: BarChart3,
    iconClass: 'bg-amber-50 text-amber-700 border-amber-200',
    lineClass: 'bg-amber-200/80',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700',
    progressClass: 'bg-amber-500',
    availableClass: 'border-amber-300 bg-amber-50/30 hover:border-amber-400',
  },
  'financial-safety': {
    icon: ShieldCheck,
    iconClass: 'bg-rose-50 text-rose-700 border-rose-200',
    lineClass: 'bg-rose-200/80',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-700',
    progressClass: 'bg-rose-500',
    availableClass: 'border-rose-300 bg-rose-50/30 hover:border-rose-400',
  },
};

const FALLBACK_STYLE = BRANCH_STYLES['money-basics'];

function getBranchStyle(branchId) {
  return BRANCH_STYLES[branchId] || FALLBACK_STYLE;
}

function RoadmapNode({
  concept,
  state,
  missingPrerequisites,
  prerequisiteTitles,
  onSelect,
}) {
  const style = getBranchStyle(concept.branchId);
  const stateLabel =
    state === 'completed' ? 'Completed' : state === 'available' ? 'Ready' : 'Locked';
  const Icon = state === 'completed' ? Check : state === 'locked' ? Lock : Play;
  const missingTitles = missingPrerequisites.map((item) => item.title).join(', ');

  const stateClasses =
    state === 'completed'
      ? 'border-genie-300 bg-genie-50/50 hover:border-genie-400'
      : state === 'available'
        ? style.availableClass
        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300';

  const iconClasses =
    state === 'completed'
      ? 'bg-genie-600 text-white border-genie-600'
      : state === 'available'
        ? `${style.iconClass}`
        : 'bg-slate-100 text-slate-400 border-slate-200';

  return (
    <button
      type="button"
      onClick={() => onSelect(concept, state)}
      aria-label={`${concept.title}, ${stateLabel}${
        state === 'locked' && missingTitles ? `. Requires ${missingTitles}` : ''
      }`}
      className={`group relative w-full rounded-xl border bg-white p-3.5 text-left shadow-2xs transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-genie-500 focus-visible:ring-offset-2 ${stateClasses} ${
        state === 'locked' ? 'opacity-80' : 'hover:-translate-y-0.5 hover:shadow-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconClasses}`}
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                state === 'completed'
                  ? 'text-genie-700'
                  : state === 'available'
                    ? style.textClass
                    : 'text-slate-400'
              }`}
            >
              {stateLabel}
            </span>
            {state === 'locked' && missingPrerequisites.length > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                {missingPrerequisites.length} needed
              </span>
            )}
          </div>

          <h3
            className={`mt-0.5 text-sm font-bold leading-snug ${
              state === 'locked' ? 'text-slate-500' : 'text-navy-950'
            }`}
          >
            {concept.title}
          </h3>

          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">
            {state === 'completed'
              ? 'Completed. Open to review the AI lesson.'
              : state === 'available'
                ? 'Prerequisites met. Open the AI lesson.'
                : `Complete ${missingPrerequisites.length === 1 ? 'the prerequisite' : 'the prerequisites'} to unlock.`}
          </p>
        </div>
      </div>

      {concept.prerequisites.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
          <span className="shrink-0 font-semibold text-slate-500">Requires:</span>
          <span className="line-clamp-1">{prerequisiteTitles.join(' · ')}</span>
        </div>
      )}

      {state !== 'locked' && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-genie-600">
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

function BranchHeader({ branch, completedCount, totalCount, compact = false }) {
  const style = getBranchStyle(branch.id);
  const Icon = style.icon;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div
      className={`rounded-xl border border-slate-200/90 bg-white ${
        compact ? 'border-0 p-4 pb-1' : 'p-3.5'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${style.iconClass}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-navy-950">{branch.title}</h2>
          <p className="text-[10px] leading-snug text-slate-500">{branch.description}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${style.progressClass}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] font-semibold text-slate-500">
          {completedCount}/{totalCount}
        </span>
      </div>
    </div>
  );
}

export default function LearningRoadmap({
  branches,
  concepts,
  completedConceptIds,
  onSelectConcept,
  onSelectLocked,
}) {
  const completedSet = new Set(completedConceptIds || []);
  const conceptMap = new Map(concepts.map((concept) => [concept.id, concept]));
  const conceptsByBranch = new Map();

  const getPrerequisiteTitles = (concept) =>
    concept.prerequisites
      .map((prerequisiteId) => conceptMap.get(prerequisiteId)?.title)
      .filter(Boolean);

  for (const branch of branches) {
    conceptsByBranch.set(
      branch.id,
      concepts.filter((concept) => concept.branchId === branch.id)
    );
  }

  const handleSelect = (concept, state) => {
    if (state === 'locked') {
      onSelectLocked(concept);
      return;
    }
    onSelectConcept(concept);
  };

  return (
    <>
      <div className="hidden lg:block">
        <div className="overflow-x-auto pb-3">
          <div className="min-w-[1100px]">
            <div className="grid grid-cols-5 items-start gap-4">
              {branches.map((branch) => {
                const branchConcepts = conceptsByBranch.get(branch.id) || [];
                const style = getBranchStyle(branch.id);
                const completedCount = branchConcepts.filter((concept) =>
                  completedSet.has(concept.id)
                ).length;

                return (
                  <section key={branch.id} aria-labelledby={`branch-${branch.id}`}>
                    <div id={`branch-${branch.id}`}>
                      <BranchHeader
                        branch={branch}
                        completedCount={completedCount}
                        totalCount={branchConcepts.length}
                      />
                    </div>

                    <div className="relative mt-4">
                      <div
                        className={`absolute bottom-5 left-1/2 top-0 w-px -translate-x-1/2 ${style.lineClass}`}
                        aria-hidden="true"
                      />
                      <div className="relative space-y-4">
                        {branchConcepts.map((concept) => {
                          const state = getConceptState(concept, completedSet);
                          const missingPrerequisites = getMissingPrerequisites(
                            concept,
                            concepts,
                            completedSet
                          );

                          return (
                            <div key={concept.id} className="relative z-10">
                              <RoadmapNode
                                concept={concept}
                                state={state}
                                missingPrerequisites={missingPrerequisites}
                                prerequisiteTitles={getPrerequisiteTitles(concept)}
                                onSelect={handleSelect}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-1 text-center text-[10px] text-slate-400">
          Scroll horizontally to explore every branch.
        </p>
      </div>

      <div className="space-y-4 lg:hidden">
        {branches.map((branch) => {
          const branchConcepts = conceptsByBranch.get(branch.id) || [];
          const style = getBranchStyle(branch.id);
          const completedCount = branchConcepts.filter((concept) =>
            completedSet.has(concept.id)
          ).length;

          return (
            <section
              key={branch.id}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-subtle"
              aria-labelledby={`branch-mobile-${branch.id}`}
            >
              <div id={`branch-mobile-${branch.id}`}>
                <BranchHeader
                  branch={branch}
                  completedCount={completedCount}
                  totalCount={branchConcepts.length}
                  compact
                />
              </div>

              <div className="relative px-4 pb-4">
                <div
                  className={`absolute bottom-7 left-[34px] top-1 w-px ${style.lineClass}`}
                  aria-hidden="true"
                />
                <div className="space-y-3 pt-2">
                  {branchConcepts.map((concept) => {
                    const state = getConceptState(concept, completedSet);
                    const missingPrerequisites = getMissingPrerequisites(
                      concept,
                      concepts,
                      completedSet
                    );

                    return (
                      <div key={concept.id} className="relative pl-9">
                        <span
                          className={`absolute left-[30px] top-5 z-10 h-2 w-2 rounded-full ring-2 ring-white ${
                            state === 'completed'
                              ? 'bg-genie-500'
                              : state === 'available'
                                ? style.dotClass
                                : 'bg-slate-300'
                          }`}
                          aria-hidden="true"
                        />
                        <RoadmapNode
                          concept={concept}
                          state={state}
                          missingPrerequisites={missingPrerequisites}
                          prerequisiteTitles={getPrerequisiteTitles(concept)}
                          onSelect={handleSelect}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
