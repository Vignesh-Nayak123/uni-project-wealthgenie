import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../middleware/auth.js';
import {
  goalInsertRow,
  goalUpdateRow,
  mapGoalRow,
  validateGoalCreate,
  validateGoalUpdate,
} from '../utils/goals.js';
import { sendDatabaseError } from '../utils/databaseErrors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createGoalsRouter({ requireAuth = defaultRequireAuth } = {}) {
  const router = Router();

  router.use(requireAuth);

  router.get('/', async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('financial_goals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.json({ goals: (data || []).map(mapGoalRow) });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to load your goals.');
    }
  });

  router.post('/', async (req, res) => {
    let goal;

    try {
      goal = validateGoalCreate(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const { data, error } = await req.supabase
        .from('financial_goals')
        .insert(goalInsertRow(goal, req.user.id))
        .select('*')
        .single();

      if (error) throw error;
      return res.status(201).json({ goal: mapGoalRow(data) });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to create the goal.');
    }
  });

  router.patch('/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid goal id.' });
    }

    let updates;

    try {
      updates = validateGoalUpdate(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const { data, error } = await req.supabase
        .from('financial_goals')
        .update(goalUpdateRow(updates))
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Goal not found.' });
      }

      return res.json({ goal: mapGoalRow(data) });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to update the goal.');
    }
  });

  router.delete('/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid goal id.' });
    }

    try {
      const { data, error } = await req.supabase
        .from('financial_goals')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Goal not found.' });
      }

      return res.json({ deleted: true });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to delete the goal.');
    }
  });

  return router;
}

export default createGoalsRouter();
