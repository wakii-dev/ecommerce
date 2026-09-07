/**
 * helpers/api.ts (SF-10) — API helper qua GATEWAY (đúng đường production) +
 * Mailpit/Mongo/ES asserts. Auth: register/login thật (identity public API).
 */
import { GATEWAY, MAILPIT_API } from './env';

export interface Session {
  email: string;
  password: string;
  accessToken: string;
  userId: string;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1];
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as Record<string, unknown>;
}

/** Đăng ký user MỚI (email unique per-run) rồi login — trả session. */
export async function registerNewUser(prefix = 'e2e'): Promise<Session> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.demo.vn`;
  const password = 'E2e#2026demo';
  const reg = await fetch(`${GATEWAY}/api/identity/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName: 'E2E Tester' })
  });
  if (!reg.ok && reg.status !== 409) {
    throw new Error(`register ${email} → ${reg.status}: ${await reg.text()}`);
  }
  return login(email, password);
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${GATEWAY}/api/identity/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status}`);
  const body = (await res.json()) as { accessToken: string };
  const payload = decodeJwtPayload(body.accessToken);
  return { email, password, accessToken: body.accessToken, userId: String(payload.sub) };
}

/** GET với Bearer — trả status + json thô (không throw ở 4xx/5xx). */
export async function authedFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<{ status: number; body: unknown; blob?: Blob; headers: Headers }> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` }
  });
  const isPdf = (res.headers.get('content-type') ?? '').includes('pdf');
  if (isPdf) return { status: res.status, body: null, blob: await res.blob(), headers: res.headers };
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // giữ text
  }
  return { status: res.status, body, headers: res.headers };
}

// ── Mailpit (email sink dev) ────────────────────────────────────────────────

export interface MailpitMessage {
  ID: string;
  To: { Address: string }[];
  Subject: string;
  Attachments: { Filename: string }[];
}

export async function mailpitMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(`${MAILPIT_API}/api/v1/messages?limit=100`);
  if (!res.ok) throw new Error(`Mailpit API ${res.status}`);
  const body = (await res.json()) as { messages: MailpitMessage[] };
  return body.messages ?? [];
}

export function mailpitFindFor(
  messages: MailpitMessage[],
  email: string,
  subjectPart: string
): MailpitMessage | undefined {
  return messages.find(
    (m) => m.To.some((t) => t.Address === email) && m.Subject.includes(subjectPart)
  );
}

export async function mailpitAttachmentNames(id: string): Promise<string[]> {
  const res = await fetch(`${MAILPIT_API}/api/v1/message/${id}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { Attachments: { Filename: string }[] };
  return (body.Attachments ?? []).map((a) => a.Filename);
}

// ── Mongo event_log (§5.8) — qua mongosh trong container ───────────────────

export async function mongoEventLogCount(eventType?: string): Promise<number> {
  const { execSync } = await import('node:child_process');
  const filter = eventType ? `db.event_log.countDocuments({eventType:'${eventType}'})` : 'db.event_log.countDocuments({})';
  // repo root từ __dirname (frontend/e2e/helpers → ../../..) — process.cwd()
  // lệch khi chạy qua make e2e (code-review P1)
  const path = require('node:path') as typeof import('node:path');
  const repoRoot = path.resolve(__dirname, '../../..');
  const out = execSync(
    `docker compose exec -T mongo mongosh --quiet db_log --eval '${filter}'`,
    { encoding: 'utf8', cwd: repoRoot }
  );
  return Number(out.trim().split('\n').pop());
}
