/**
 * Shared API fetch wrapper.
 * Automatically injects the X-Session-Token header on every request.
 * Session token is stored in localStorage under 'nodeling_session'.
 */

const SESSION_KEY = 'nodeling_session';

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string) {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    // localStorage unavailable
  }
}

/** Drop-in replacement for fetch() that injects X-Session-Token header. */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const existing = (options.headers || {}) as Record<string, string>;
  const headers: Record<string, string> = { ...existing };
  if (token) {
    headers['X-Session-Token'] = token;
  }
  // Don't force Content-Type for non-body requests (GET, HEAD)
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

/**
 * Called once at startup. Creates a session if none exists.
 * Silently does nothing if the server is unreachable.
 */
export async function initSession(): Promise<void> {
  if (getSessionToken()) return;
  try {
    const res = await fetch('/api/session', { method: 'POST' });
    if (res.ok) {
      const data = await res.json() as { token: string };
      if (data.token) setSessionToken(data.token);
    }
  } catch {
    // Server offline — will retry naturally on next API call
  }
}
