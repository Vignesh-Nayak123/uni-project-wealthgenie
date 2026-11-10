import React, { useState } from 'react';
import {
  Target,
  Plus,
  ShieldCheck,
  Home,
  TrendingUp,
  Compass,
  Calendar,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Pencil,
  Trash2,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import ProgressBar from '../components/common/ProgressBar';
import Modal from '../components/common/Modal';
import { formatINR } from '../utils/formatters';
import {
  GOAL_CATEGORY_OPTIONS,
  formatGoalDate,
  goalCategoryStyle,
  goalProgressPercent,
} from '../utils/goalDisplay';
import { useUserData } from '../context/UserDataContext';

const iconMap = {
  ShieldCheck,
  Home,
  TrendingUp,
  Compass,
  Target,
};

const EMPTY_FORM = {
  title: '',
  category: 'Security',
  targetAmount: '',
  currentAmount: '',
  targetDate: '',
  description: '',
};

function toFormState(goal) {
  return {
    title: goal.title || '',
    category: goal.category || 'Security',
    targetAmount: goal.targetAmount === null ? '' : String(goal.targetAmount),
    currentAmount:
      goal.currentAmount === null || goal.currentAmount === undefined
        ? ''
        : String(goal.currentAmount),
    targetDate: goal.targetDate || '',
    description: goal.description || '',
  };
}

export default function GoalsPage() {
  const {
    goals,
    loading,
    error,
    refresh,
    createGoal,
    updateGoal,
    deleteGoal,
  } = useUserData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [filterCategory, setFilterCategory] = useState('All');
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openCreateModal = () => {
    setEditingGoal(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (goal) => {
    setEditingGoal(goal);
    setForm(toFormState(goal));
    setFormError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
    setEditingGoal(null);
    setFormError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    if (!form.title.trim()) {
      setFormError('Goal title is required.');
      return;
    }

    const targetAmount = Number(form.targetAmount);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setFormError('Target amount must be greater than zero.');
      return;
    }

    const currentAmount = form.currentAmount === '' ? 0 : Number(form.currentAmount);
    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      setFormError('Already saved amount must be zero or greater.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      category: form.category,
      targetAmount,
      currentAmount,
      targetDate: form.targetDate || null,
      description: form.description.trim() || null,
    };

    setSubmitting(true);

    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, payload);
      } else {
        await createGoal(payload);
      }
      setIsModalOpen(false);
      setEditingGoal(null);
      setForm(EMPTY_FORM);
    } catch (submitError) {
      setFormError(submitError.message || 'Unable to save the goal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (goal) => {
    const confirmed = window.confirm(
      `Delete "${goal.title}"? This permanently removes it from your account.`
    );
    if (!confirmed) return;

    setActionError('');
    setDeletingId(goal.id);

    try {
      await deleteGoal(goal.id);
    } catch (deleteError) {
      setActionError(deleteError.message || 'Unable to delete the goal.');
    } finally {
      setDeletingId('');
    }
  };

  const filteredGoals = goals.filter((goal) =>
    filterCategory === 'All' ? true : goal.category === filterCategory
  );

  const totalTargeted = goals.reduce(
    (acc, goal) => acc + (Number(goal.targetAmount) || 0),
    0
  );
  const totalSaved = goals.reduce(
    (acc, goal) => acc + (Number(goal.currentAmount) || 0),
    0
  );
  const totalPercentage =
    totalTargeted > 0 ? Math.round((totalSaved / totalTargeted) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-genie-700 uppercase tracking-wider mb-1">
            <Target className="w-3.5 h-3.5" />
            <span>Target Tracker</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
            Financial Goals
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Break big financial ambitions into disciplined, measurable milestone checkpoints.
            Goals are saved to your account.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800 transition-colors flex items-center gap-1.5 self-start sm:self-auto shadow-2xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Goal</span>
        </button>
      </div>

      {(error || actionError) && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-start justify-between gap-3">
          <span className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{actionError || error}</span>
          </span>
          <button
            type="button"
            onClick={refresh}
            className="shrink-0 inline-flex items-center gap-1 font-semibold text-amber-900 hover:text-amber-950"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <Card className="p-10 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
          <span>Loading your saved goals...</span>
        </Card>
      ) : goals.length === 0 ? (
        <Card className="p-12 text-center text-slate-500 border-dashed border-2">
          <Target className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-navy-900 mb-1">No goals saved yet</p>
          <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
            Set up an Indian milestone target to begin tracking your financial
            checkpoints. Your goals will be stored against your signed-in account.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800"
          >
            Create Your First Goal
          </button>
        </Card>
      ) : (
        <>
          {/* Aggregate Overview Card */}
          <Card className="bg-white">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Aggregate Goal Progress</span>
                <div className="text-2xl sm:text-3xl font-extrabold text-navy-950">
                  {formatINR(totalSaved)}
                  <span className="text-sm font-normal text-slate-400"> of {formatINR(totalTargeted)} targeted</span>
                </div>
                <p className="text-xs text-slate-500">
                  Across {goals.length} saved milestone{goals.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="w-full md:w-64 space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-600">Funded</span>
                  <span className="font-bold text-genie-700">{totalPercentage}%</span>
                </div>
                <ProgressBar value={totalSaved} max={totalTargeted || 1} size="md" />
              </div>
            </div>
          </Card>

          {/* Category Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {['All', ...GOAL_CATEGORY_OPTIONS].map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setFilterCategory(category)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filterCategory === category
                    ? 'bg-navy-900 text-white border-navy-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Goals Grid */}
          {filteredGoals.length === 0 ? (
            <Card className="p-10 text-center text-slate-500 border-dashed border-2">
              <p className="text-sm font-semibold text-navy-900 mb-1">
                No goals in this category
              </p>
              <p className="text-xs text-slate-500">
                Choose another category or add a new goal.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredGoals.map((goal) => {
                const style = goalCategoryStyle(goal.category);
                const Icon = iconMap[style.iconName] || Target;
                const percentage = goalProgressPercent(goal);
                const remaining = Math.max(
                  0,
                  (Number(goal.targetAmount) || 0) - (Number(goal.currentAmount) || 0)
                );

                return (
                  <Card key={goal.id} className="flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-navy-800 shrink-0">
                            <Icon className="w-5 h-5 text-navy-700" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-bold text-navy-950 truncate">{goal.title}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <Badge variant={style.badgeVariant} size="xs">{goal.category}</Badge>
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>Target: {formatGoalDate(goal.targetDate)}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <span className="text-sm font-bold text-navy-900 shrink-0">
                          {percentage}%
                        </span>
                      </div>

                      {goal.description && (
                        <p className="text-xs text-slate-600 leading-relaxed mb-4">
                          {goal.description}
                        </p>
                      )}

                      <div className="space-y-2">
                        <ProgressBar
                          value={goal.currentAmount}
                          max={goal.targetAmount || 1}
                          color={style.color}
                          size="md"
                        />
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">
                            Saved: <strong className="text-navy-900">{formatINR(goal.currentAmount)}</strong>
                          </span>
                          <span className="text-slate-500">
                            Goal: <strong className="text-navy-900">{formatINR(goal.targetAmount)}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        Remaining: <strong className="text-navy-800">{formatINR(remaining)}</strong>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(goal)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium text-navy-800 hover:bg-slate-100 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(goal)}
                          disabled={deletingId === goal.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60 transition-colors"
                        >
                          {deletingId === goal.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Create / Edit Goal Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingGoal ? 'Edit Financial Goal' : 'Create a New Financial Goal'}
        subtitle="Define a measurable target and timeline in INR (₹)"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="goalTitle" className="block text-xs font-semibold text-navy-900 mb-1">
              Goal Title
            </label>
            <input
              id="goalTitle"
              type="text"
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="e.g. 6-Month Emergency Cushion"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goalCategory" className="block text-xs font-semibold text-navy-900 mb-1">
                Category
              </label>
              <select
                id="goalCategory"
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              >
                {GOAL_CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="goalTargetDate" className="block text-xs font-semibold text-navy-900 mb-1">
                Target Date
              </label>
              <input
                id="goalTargetDate"
                type="date"
                value={form.targetDate}
                onChange={(e) => updateField('targetDate', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goalTargetAmount" className="block text-xs font-semibold text-navy-900 mb-1">
                Target Amount (₹)
              </label>
              <input
                id="goalTargetAmount"
                type="number"
                required
                min="1"
                step="1"
                value={form.targetAmount}
                onChange={(e) => updateField('targetAmount', e.target.value)}
                placeholder="300000"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              />
            </div>

            <div>
              <label htmlFor="goalCurrentAmount" className="block text-xs font-semibold text-navy-900 mb-1">
                Already Saved (₹)
              </label>
              <input
                id="goalCurrentAmount"
                type="number"
                min="0"
                step="1"
                value={form.currentAmount}
                onChange={(e) => updateField('currentAmount', e.target.value)}
                placeholder="50000"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="goalDescription" className="block text-xs font-semibold text-navy-900 mb-1">
              Description (optional)
            </label>
            <textarea
              id="goalDescription"
              rows={3}
              maxLength={500}
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Why this goal matters and how you plan to fund it."
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500 resize-y"
            />
          </div>

          {formError && (
            <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-navy-900 rounded-lg disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-genie-600 hover:bg-genie-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {submitting
                  ? 'Saving...'
                  : editingGoal
                    ? 'Update Goal'
                    : 'Save Goal'}
              </span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
