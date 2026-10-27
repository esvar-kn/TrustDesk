// Thin fetch wrapper: attaches the JWT, parses JSON, and turns the server's
// coded errors into friendly messages. In dev, /api is proxied to :4000; in a
// build, VITE_API_BASE_URL can point elsewhere.
const BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'trustdesk_token';
const USER_KEY = 'trustdesk_user';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function setAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore storage errors (private mode) */
  }
}

export function logout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

const ERROR_MESSAGES = {
  UNAUTHENTICATED: 'Your session expired — please sign in again.',
  FORBIDDEN: 'You don’t have permission for that.',
  NOT_FOUND: 'Not found.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  INVALID_STATE: 'That action isn’t allowed in the current state.',
  IDEMPOTENCY_KEY_REUSED: 'This request was already submitted with different details.',
  APPROVAL_REQUIRED: 'This action needs manager approval first.',
  GUARDRAIL_BLOCKED: 'Blocked by a safety guardrail.',
  POLICY_BLOCKED: 'Blocked by policy.',
  AI_PROVIDER_ERROR: 'The AI provider is currently unavailable.',
  AI_TIMEOUT: 'The AI request timed out — please retry.',
  TOOL_EXECUTION_FAILED: 'The action failed to execute.',
  INTERNAL: 'Something went wrong.',
};

export function messageFor(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || 'Something went wrong.';
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const err = (data && data.error) || {};
    const e = new Error(messageFor(err.code, err.message));
    e.code = err.code || 'INTERNAL';
    e.status = res.status;
    e.details = err.details;
    throw e;
  }
  return data;
}

export async function login(username, password) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password }, auth: false });
  setAuth(r.token, { username: r.username, role: r.role });
  return { username: r.username, role: r.role };
}
