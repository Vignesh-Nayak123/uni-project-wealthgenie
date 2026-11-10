import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';

const UserDataContext = createContext(null);

export function UserDataProvider({ children }) {
  const { session, handleUnauthorized } = useAuth();
  const [goals, setGoals] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scenariosError, setScenariosError] = useState('');

  const request = useCallback(
    async (path, options = {}) => {
      if (!session?.access_token) {
        throw new Error('You must be signed in to access this data.');
      }

      try {
        return await apiRequest(path, {
          ...options,
          token: session.access_token,
        });
      } catch (requestError) {
        await handleUnauthorized(requestError);
        throw requestError;
      }
    },
    [session, handleUnauthorized]
  );

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setGoals([]);
      setAssessments([]);
      setScenarios([]);
      setError('');
      setScenariosError('');
      return;
    }

    setLoading(true);
    setError('');
    setScenariosError('');

    const [goalsResult, assessmentsResult, scenariosResult] =
      await Promise.allSettled([
        request('/api/goals'),
        request('/api/assessments?limit=50'),
        request('/api/scenarios'),
      ]);

    if (goalsResult.status === 'fulfilled') {
      setGoals(goalsResult.value.goals || []);
    } else {
      setError(goalsResult.reason?.message || 'Unable to load your goals.');
    }

    if (assessmentsResult.status === 'fulfilled') {
      setAssessments(assessmentsResult.value.assessments || []);
    } else if (goalsResult.status === 'fulfilled') {
      setError(
        assessmentsResult.reason?.message ||
          'Unable to load your assessment history.'
      );
    }

    if (scenariosResult.status === 'fulfilled') {
      setScenarios(scenariosResult.value.scenarios || []);
    } else {
      setScenariosError(
        scenariosResult.reason?.message || 'Unable to load your scenarios.'
      );
    }

    setLoading(false);
  }, [session, request]);

  useEffect(() => {
    if (session?.user?.id) {
      refresh();
    } else {
      setGoals([]);
      setAssessments([]);
      setScenarios([]);
      setError('');
      setScenariosError('');
      setLoading(false);
    }
  }, [session?.user?.id, refresh]);

  const createGoal = async (payload) => {
    const data = await request('/api/goals', {
      method: 'POST',
      body: payload,
    });
    setGoals((current) => [data.goal, ...current]);
    return data.goal;
  };

  const updateGoal = async (goalId, payload) => {
    const data = await request(`/api/goals/${goalId}`, {
      method: 'PATCH',
      body: payload,
    });
    setGoals((current) =>
      current.map((goal) => (goal.id === goalId ? data.goal : goal))
    );
    return data.goal;
  };

  const deleteGoal = async (goalId) => {
    await request(`/api/goals/${goalId}`, { method: 'DELETE' });
    setGoals((current) => current.filter((goal) => goal.id !== goalId));
  };

  const createAssessment = async (payload) => {
    const data = await request('/api/assessments', {
      method: 'POST',
      body: payload,
    });
    setAssessments((current) => [data.assessment, ...current]);
    return data.assessment;
  };

  const deleteAssessment = async (assessmentId) => {
    await request(`/api/assessments/${assessmentId}`, { method: 'DELETE' });
    setAssessments((current) =>
      current.filter((assessment) => assessment.id !== assessmentId)
    );
  };

  const createScenario = async (payload) => {
    const data = await request('/api/scenarios', {
      method: 'POST',
      body: payload,
    });
    setScenarios((current) => [data.scenario, ...current]);
    return data.scenario;
  };

  const updateScenario = async (scenarioId, payload) => {
    const data = await request(`/api/scenarios/${scenarioId}`, {
      method: 'PATCH',
      body: payload,
    });
    setScenarios((current) =>
      current.map((scenario) =>
        scenario.id === scenarioId ? data.scenario : scenario
      )
    );
    return data.scenario;
  };

  const deleteScenario = async (scenarioId) => {
    await request(`/api/scenarios/${scenarioId}`, { method: 'DELETE' });
    setScenarios((current) =>
      current.filter((scenario) => scenario.id !== scenarioId)
    );
  };

  const compareScenarios = async (baselineId, scenarioId) =>
    request('/api/scenarios/compare', {
      method: 'POST',
      body: { baselineId, scenarioId },
    });

  const value = {
    goals,
    assessments,
    scenarios,
    latestAssessment: assessments[0] || null,
    loading,
    error,
    scenariosError,
    request,
    refresh,
    createGoal,
    updateGoal,
    deleteGoal,
    createAssessment,
    deleteAssessment,
    createScenario,
    updateScenario,
    deleteScenario,
    compareScenarios,
    clearError: () => setError(''),
  };

  return (
    <UserDataContext.Provider value={value}>
      {children}
    </UserDataContext.Provider>
  );
}

export function useUserData() {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used inside a UserDataProvider.');
  }
  return context;
}
