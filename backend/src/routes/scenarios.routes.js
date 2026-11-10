import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../middleware/auth.js';
import { buildTwinPreview, compareTwinResults } from '../utils/financialTwin.js';
import {
  mapScenarioRow,
  scenarioInsertRow,
  scenarioUpdateRow,
  validateScenarioCompare,
  validateScenarioCreate,
  validateScenarioUpdate,
  UUID_PATTERN,
} from '../utils/scenarioData.js';
import { sendDatabaseError } from '../utils/databaseErrors.js';

function recalculateSavedScenario(row) {
  return buildTwinPreview({
    baseline: row.baseline_inputs,
    scenario: row.scenario_inputs,
    thresholds: row.thresholds || {},
    asOfDate: row.as_of_date,
  });
}

export function createScenariosRouter({ requireAuth = defaultRequireAuth } = {}) {
  const router = Router();

  router.use(requireAuth);

  async function loadOwnedScenario(req, id) {
    const { data, error } = await req.supabase
      .from('financial_scenarios')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function ownsAssessment(req, assessmentId) {
    const { data, error } = await req.supabase
      .from('financial_assessments')
      .select('id')
      .eq('id', assessmentId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  router.get('/', async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('financial_scenarios')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return res.json({ scenarios: (data || []).map(mapScenarioRow) });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to load your scenarios.');
    }
  });

  router.post('/', async (req, res) => {
    let scenario;

    try {
      scenario = validateScenarioCreate(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      if (scenario.baselineAssessmentId) {
        const owned = await ownsAssessment(req, scenario.baselineAssessmentId);
        if (!owned) {
          return res.status(400).json({
            error: 'Baseline assessment not found for this user.',
          });
        }
      }

      const { data, error } = await req.supabase
        .from('financial_scenarios')
        .insert(scenarioInsertRow(scenario, req.user.id))
        .select('*')
        .single();

      if (error) throw error;
      return res.status(201).json({ scenario: mapScenarioRow(data) });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to save the scenario.');
    }
  });

  router.post('/compare', async (req, res) => {
    let ids;

    try {
      ids = validateScenarioCompare(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const baselineRow = await loadOwnedScenario(req, ids.baselineId);
      const scenarioRow = await loadOwnedScenario(req, ids.scenarioId);

      if (!baselineRow || !scenarioRow) {
        return res.status(404).json({
          error: 'One or both scenarios were not found.',
        });
      }

      let baselinePreview;
      let scenarioPreview;

      try {
        baselinePreview = recalculateSavedScenario(baselineRow);
        scenarioPreview = recalculateSavedScenario(scenarioRow);
      } catch (error) {
        return res.status(400).json({
          error: `A saved scenario could not be recalculated: ${error.message}`,
        });
      }

      return res.json({
        baseline: mapScenarioRow(baselineRow),
        scenario: mapScenarioRow(scenarioRow),
        baselineResult: baselinePreview.scenario,
        scenarioResult: scenarioPreview.scenario,
        comparison: compareTwinResults(
          baselinePreview.scenario,
          scenarioPreview.scenario
        ),
      });
    } catch (error) {
      return sendDatabaseError(
        res,
        error,
        'Unable to compare the saved scenarios.'
      );
    }
  });

  router.get('/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid scenario id.' });
    }

    try {
      const row = await loadOwnedScenario(req, req.params.id);
      if (!row) {
        return res.status(404).json({ error: 'Scenario not found.' });
      }

      return res.json({ scenario: mapScenarioRow(row) });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to load the scenario.');
    }
  });

  router.patch('/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid scenario id.' });
    }

    let updates;

    try {
      updates = validateScenarioUpdate(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const existing = await loadOwnedScenario(req, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Scenario not found.' });
      }

      if (updates.baselineAssessmentId) {
        const owned = await ownsAssessment(req, updates.baselineAssessmentId);
        if (!owned) {
          return res.status(400).json({
            error: 'Baseline assessment not found for this user.',
          });
        }
      }

      let preview;
      try {
        preview = buildTwinPreview({
          baseline: updates.baselineInputs ?? existing.baseline_inputs,
          scenario: updates.scenarioInputs ?? existing.scenario_inputs,
          thresholds: updates.thresholds ?? existing.thresholds ?? {},
          asOfDate: updates.asOfDate ?? existing.as_of_date,
        });
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }

      const { data, error } = await req.supabase
        .from('financial_scenarios')
        .update(
          scenarioUpdateRow({
            name: updates.name,
            baselineAssessmentId: updates.baselineAssessmentId,
            baselineInputs: updates.baselineInputs,
            scenarioInputs: updates.scenarioInputs,
            thresholds: updates.thresholds,
            asOfDate: updates.asOfDate,
            preview,
          })
        )
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Scenario not found.' });
      }

      return res.json({ scenario: mapScenarioRow(data) });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to update the scenario.');
    }
  });

  router.delete('/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid scenario id.' });
    }

    try {
      const { data, error } = await req.supabase
        .from('financial_scenarios')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Scenario not found.' });
      }

      return res.json({ deleted: true });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to delete the scenario.');
    }
  });

  return router;
}

export default createScenariosRouter();
