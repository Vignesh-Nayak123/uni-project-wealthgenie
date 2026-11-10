export function isMissingSchemaError(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export function sendDatabaseError(res, error, fallbackMessage) {
  const code = error?.code || 'unknown';
  const message = error?.message || 'Unknown database error';
  console.error(`[database] ${code}: ${message}`);

  if (isMissingSchemaError(error)) {
    return res.status(503).json({
      error:
        'The database schema is not initialized. Apply the Supabase migrations before using account data.',
      code: 'database_not_initialized',
    });
  }

  return res.status(500).json({
    error: fallbackMessage,
    code: 'database_error',
  });
}
