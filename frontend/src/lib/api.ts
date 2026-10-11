import type { DemoLoginResponse } from '@agent-recall/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_KEY = 'agent-recall.token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: keep the token in memory only */
  }
  memToken = token;
}
let memToken: string | null = readToken();
let loginInflight: Promise<DemoLoginResponse> | null = null;

/** Demo auth: obtain a token for the seeded demo user. */
export function demoLogin(): Promise<DemoLoginResponse> {
  if (!loginInflight) {
    loginInflight = rawRequest<DemoLoginResponse>('POST', '/api/auth/demo-login', undefined, false)
      .then((res) => {
        writeToken(res.token);
        return res;
      })
      .finally(() => {
        loginInflight = null;
      });
  }
  return loginInflight;
}

async function rawRequest<T>(method: string, path: string, body: unknown, auth: boolean, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && memToken) headers.Authorization = `Bearer ${memToken}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Could not reach the API. Is the backend running (npm run dev)?');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? `Request failed with status ${res.status}`);
  }
  return json as T;
}

/** Authenticated request; signs in with demo auth once on 401 and retries. */
export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!memToken) await demoLogin();
  try {
    return await rawRequest<T>(method, path, body, true, signal);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      writeToken(null);
      await demoLogin();
      return rawRequest<T>(method, path, body, true, signal);
    }
    throw err;
  }
}

/** Binary request (e.g. audio). */
export async function requestBlob(path: string, body: unknown): Promise<Blob> {
  if (!memToken) await demoLogin();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memToken ?? ''}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let code = `HTTP_${res.status}`;
    try {
      const j = (await res.json()) as { error?: { code?: string; message?: string } };
      message = j.error?.message ?? message;
      code = j.error?.code ?? code;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code, message);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  /** Unauthenticated (health/ready). */
  public: <T>(path: string) => rawRequest<T>('GET', path, undefined, false),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
