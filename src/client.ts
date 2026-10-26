// Minimal client for the CommentKeyword public REST API.
// Spec: https://commentkeyword.com/openapi.json

export const DEFAULT_BASE_URL = 'https://commentkeyword.com/api';

export class CommentKeywordApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(describeError(status, body));
    this.name = 'CommentKeywordApiError';
  }

  get code(): string | undefined {
    return isRecord(this.body) && typeof this.body.code === 'string' ? this.body.code : undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describeError(status: number, body: unknown): string {
  const message = isRecord(body) && typeof body.message === 'string' ? body.message : undefined;
  const code = isRecord(body) && typeof body.code === 'string' ? ` (${body.code})` : '';
  const hint =
    status === 401
      ? ' Check COMMENTKEYWORD_API_TOKEN: create a token in CommentKeyword under Settings → API.'
      : status === 403
        ? ' The token is missing a permission for this action. Create a token with keywords:read, keywords:write and agents:read.'
        : '';
  return `CommentKeyword API returned ${status}${code}: ${message ?? 'request failed'}.${hint}`;
}

export interface ClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  userAgent?: string;
}

export class CommentKeywordClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: ClientOptions) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? fetch;
    this.userAgent = options.userAgent ?? 'commentkeyword-mcp';
  }

  async request(method: string, path: string, options: { query?: Record<string, unknown>; body?: unknown } = {}): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'User-Agent': this.userAgent,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Keep the raw text for the error message.
    }

    if (!response.ok) throw new CommentKeywordApiError(response.status, parsed);
    return parsed;
  }

  listAgents() {
    return this.request('GET', '/agents');
  }

  listKeywords(query: { search?: string; status?: 'active' | 'inactive'; limit?: number; offset?: number }) {
    return this.request('GET', '/keywords', { query });
  }

  getKeyword(id: string) {
    return this.request('GET', `/keywords/${encodeURIComponent(id)}`);
  }

  createKeyword(body: Record<string, unknown>) {
    return this.request('POST', '/keywords', { body });
  }

  updateKeyword(id: string, body: Record<string, unknown>) {
    return this.request('PATCH', `/keywords/${encodeURIComponent(id)}`, { body });
  }

  deleteKeyword(id: string, confirm: boolean) {
    return this.request('DELETE', `/keywords/${encodeURIComponent(id)}`, { query: confirm ? { confirm: 'true' } : {} });
  }
}
