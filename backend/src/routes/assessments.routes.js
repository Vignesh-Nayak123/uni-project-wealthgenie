import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../middleware/auth.js';
import { assessFinances } from '../utils/financialAssessment.js';
import {
  assessmentInsertRow,
  mapAssessmentRow,
} from '../utils/assessmentData.js';
import { sendDatabaseError } from '../utils/databaseErrors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePagination(query) {
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawOffset = Number.parseInt(query.offset, 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
  return { limit, offset };
}

export function createAssessmentsRouter({ requireAuth = defaultRequireAuth } = {}) {
  const router = Router();

  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const { limit, offset } = parsePagination(req.query);

    try {
      const { data, error, count } = await req.supabase
        .from('financial_assessments')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return res.json({
        assessments: (data || []).map(mapAssessmentRow),
        count: count ?? 0,
        limit,
        offset,
      });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to load assessment history.');
    }
  });

  router.post('/', async (req, res) => {
    let assessment;

    try {
      assessment = assessFinances(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const { data, error } = await req.supabase
        .from('financial_assessments')
        .insert(assessmentInsertRow(req.body || {}, assessment, req.user.id))
        .select('*')
        .single();

      if (error) throw error;
      return res.status(201).json({ assessment: mapAssessmentRow(data) });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to save your assessment.');
    }
  });

  router.delete('/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid assessment id.' });
    }

    try {
      const { data, error } = await req.supabase
        .from('financial_assessments')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Assessment not found.' });
      }

      return res.json({ deleted: true });
    } catch (error) {
      return sendDatabaseError(res, error, 'Unable to delete the assessment.');
    }
  });

  return router;
}

export default createAssessmentsRouter();
