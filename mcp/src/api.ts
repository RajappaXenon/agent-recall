import type { AgentWithStats, DemoLoginResponse } from '@agent-recall/shared';

/**
 * Thin client for the Agent Recall REST API. The MCP server never touches MongoDB
 * directly: org scoping, validation, rate limits and the activity log all stay in the API.
 */
export class AgentRecallApi {
  private token: string | null;
  private agents: AgentWithStats[] | null = null;

  constructor(
    readonly baseUrl: string,
    token: string | undefined,
  ) {
    this.token = token || null;
  }

  /** AUTH_MODE=demo only: sign in as the demo user when no token was configured. */
  private async login(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/auth/demo-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!res.ok) throw new Error(`Demo login failed (HTTP ${res.status}). Set AGENT_RECALL_TOKEN or check that the API runs with AUTH_MODE=demo.`);
    this.token = ((await res.json()) as DemoLoginResponse).token;
    return this.token;
  }

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, retried = false): Promise<T> {
    const token = this.token ?? (await this.login());
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new Error(`Agent Recall API unreachable at ${this.baseUrl} (${(err as Error).message}). Start it with npm run dev.`);
    }
    if (res.status === 401 && !retried) {
      this.token = null;
      return this.request(method, path, body, true);
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
    if (!res.ok) throw new Error(`${json.error?.code ?? `HTTP ${res.status}`}: ${json.error?.message ?? 'request failed'}`);
    return json;
  }

  /** Resolves an agent by id or (case-insensitive) name; defaults to the configured agent. */
  async agentId(nameOrId: string): Promise<{ id: string; name: string }> {
    this.agents ??= (await this.request<{ items: AgentWithStats[] }>('GET', '/api/agents')).items;
    const want = nameOrId.trim().toLowerCase();
    const a = this.agents.find((x) => x.id === nameOrId || x.name.toLowerCase() === want) ?? this.agents.find((x) => x.name.toLowerCase().includes(want));
    if (!a) throw new Error(`No agent named "${nameOrId}". Available: ${this.agents.map((x) => x.name).join(', ')}`);
    return { id: a.id, name: a.name };
  }
}
