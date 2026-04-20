export function formatResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function createError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export function formatError(error, fallbackCode = 'INTERNAL_ERROR') {
  return formatResult({
    ok: false,
    error: {
      code: error?.code ?? fallbackCode,
      message: error?.message ?? 'Unknown error',
      details: error?.details,
    },
  });
}

export async function handleTool(callback, fallbackCode) {
  try {
    return formatResult(await callback());
  } catch (error) {
    return formatError(error, fallbackCode);
  }
}

export async function withSessionOrThrow(browserManager, sessionId, callback) {
  const session = browserManager.beginSessionActivity(sessionId);
  if (!session) {
    throw createError('SESSION_NOT_FOUND', `Unknown session: ${sessionId}`, { sessionId });
  }

  try {
    return await callback(session);
  } finally {
    browserManager.endSessionActivity(sessionId);
  }
}
