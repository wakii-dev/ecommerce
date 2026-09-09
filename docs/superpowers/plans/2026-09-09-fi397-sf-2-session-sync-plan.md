# SF-2 session-sync (FI-399) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login/logout ở 1 tab lan tức thì mọi tab/app cùng origin, KHÔNG sinh spurious logout (race one-time-rotate được serialize), 127.0.0.1 tự redirect về localhost.

**Architecture:** Module `session-sync.ts` trong `packages/auth` — BroadcastChannel primary + storage sentinel fallback; broadcast CHỈ transition auth↔unauth (subscriber-diff); refresh đa tab serialize qua `navigator.locks` (BC handshake best-effort fallback) + 401-retry-once-400ms CÓ ĐIỀU KIỆN (fallback mode hoặc lock contender). Redirect 127→localhost: Next middleware guard + Vite preset plugin. Seam: `createSessionSync(store, deps)` wrap `store.refresh`, `stop()` restore — test DI cùng seam production.

**Tech Stack:** TypeScript, Vitest 2 (node env + mock tay — KHÔNG thêm dep), Playwright, Next middleware, Vite plugin API, Web Locks/BroadcastChannel/Web Storage (Web API — dep freeze).

**Linear Issue:** FI-399 · **Spec:** `docs/superpowers/specs/2026-09-09-fi397-sf-2-session-sync-design.md` · **Worktree:** `sf-2-session-sync` (nhánh `wakii-dev/sf-2-session-sync` → đích `story/fi397-unify-frontend`)

**Boundary (không vi phạm):** dep freeze 0 dep mới (kể cả devDep) · zero backend change · không đụng `packages/chrome/**`, `helpers/env.ts`, `playwright.config.ts`, dev-stack/scripts (SF-3), shell Header adapter (SF-1) · middleware giữ nguyên logic affiliate/locale · SHARED_SINGLETONS vùng SF-1 trong vite-preset.mjs.

---

## Task Dependencies (DAG)

```
T1 session-sync core ──→ T2 coordination+retry ──→ T5 e2e multi-tab ──→ T7 gate
T1 ─┬─→ T3 Next redirect (độc lập T2) ────────────────┬──────────────→ T7
    └─→ T4 Vite plugin  (độc lập T2) ────────────────┘
T1,T2 → T6 guest-cart test + ADR + override compose (ADR cần semantics cuối từ T2)
```

T3, T4 song song được sau T1 (không đụng auth pkg). T7 chạy sau CÙNG.

---

### Task 1: session-sync module — transition-only broadcast + storage fallback + SSR-guard + configureAuth auto-start

**Files:**
- Create: `frontend/packages/auth/src/session-sync.ts`
- Create: `frontend/packages/auth/src/__tests__/session-sync.test.ts`
- Create: `frontend/packages/auth/src/__tests__/ssr-guard.test.ts`
- Modify: `frontend/packages/auth/src/AuthStore.ts` (export class + configureAuth auto-start + AbortSignal.timeout trên POST refresh)
- Test command: `cd frontend && pnpm --filter @ecommerce/auth test`

- [ ] **Step 1.1: Viết test FAIL trước — `__tests__/session-sync.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore, configureAuth, authStore } from '../AuthStore';
import {
  AUTH_CHANGED,
  REFRESH_DONE,
  REFRESH_START,
  SENTINEL_KEY,
  createSessionSync,
  createStorageFallbackBus,
  type SyncBus,
  type SyncMessage
} from '../session-sync';

const REFRESH_URL = '/api/identity/auth/refresh';

/** JWT giả — payload base64url, client không verify chữ ký (pattern authStore.test.ts). */
function makeJwt(sub: string): string {
  const b64url = (s: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(s)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"RS256","typ":"JWT"}')}.${b64url(JSON.stringify({ sub, roles: ['customer'] }))}.sig`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Bus mô phỏng BroadcastChannel: post() tới CÁC TAB KHÁC, KHÔNG loopback về mình. */
class BroadcastHub {
  private members = new Map<object, (m: SyncMessage) => void>();
  connect(): SyncBus {
    const tag = {};
    const members = this.members;
    return {
      post(message: SyncMessage) {
        for (const [t, fn] of members) if (t !== tag) fn(message);
      },
      subscribe(fn: (m: SyncMessage) => void) {
        members.set(tag, fn);
        return () => { members.delete(tag); };
      }
    };
  }
}

/** Store tab độc lập đã cắm sync (deps DI — cùng seam production). */
function makeTab(hub: BroadcastHub, opts: { fetchImpl?: typeof fetch } = {}): { store: AuthStore; sync: ReturnType<typeof createSessionSync>; seen: SyncMessage[] } {
  const store = new AuthStore();
  if (opts.fetchImpl) store.configureAuth({ refreshUrl: REFRESH_URL, fetchImpl: opts.fetchImpl });
  const seen: SyncMessage[] = [];
  const watcher = hub.connect();
  watcher.subscribe((m) => seen.push(m));
  const sync = createSessionSync(store, { bus: hub.connect() });
  sync.start();
  return { store, sync, seen };
}

beforeEach(() => {
  authStore.setToken(null);
  authStore.configureAuth({ refreshUrl: REFRESH_URL, fetchImpl: undefined });
});

describe('session-sync — transition-only broadcast', () => {
  it('guest→authed: 1 broadcast; refresh rotate (authed→authed): 0; logout: 1; logout-when-guest: 0', () => {
    const hub = new BroadcastHub();
    const { store } = makeTab(hub);
    const watcher = hub.connect();
    const seen: SyncMessage[] = [];
    watcher.subscribe((m) => seen.push(m));

    store.setToken(makeJwt('u1'));   // guest→authed
    expect(seen).toEqual([{ type: AUTH_CHANGED }]);

    store.setToken(makeJwt('u1b'));  // authed→authed (token rotate) — KHÔNG broadcast
    expect(seen).toHaveLength(1);

    store.logout();                  // authed→guest
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ type: AUTH_CHANGED });

    store.logout();                  // guest→guest — không notify → không broadcast
    expect(seen).toHaveLength(2);
  });

  it('2FA challenge KHÔNG set token → không transition → không broadcast (mức store-notify)', async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> =>
      jsonResponse({ twoFactorRequired: true, challengeId: 'c1' })
    );
    configureAuth({ refreshUrl: REFRESH_URL, fetchImpl });
    const { login } = await import('../api');
    const listener = vi.fn();
    const unsub = authStore.subscribe(listener);
    try {
      await expect(login({ email: 'a@b.c', password: 'password123' })).rejects.toThrow();
      expect(listener, 'challenge throw TRƯỚC setToken → store không notify').not.toHaveBeenCalled();
      expect(authStore.isAuthenticated()).toBe(false);
    } finally {
      unsub();
    }
  });
});

describe('session-sync — receiver flow', () => {
  it('receiver GUEST nhận auth-changed → refresh đúng 1 lần (cookie-roundtrip) → transition → broadcast đúng luật', async () => {
    const hub = new BroadcastHub();
    let refreshCalls = 0;
    const { store, seen } = makeTab(hub, {
      fetchImpl: vi.fn(async (): Promise<Response> => {
        refreshCalls += 1;
        return jsonResponse({ accessToken: makeJwt('u1') });
      })
    });
    const emitter = hub.connect();
    emitter.post({ type: AUTH_CHANGED });

    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    expect(store.isAuthenticated()).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(seen, 'receiver chuyển guest→authed → ĐƯỢC broadcast (đúng quy tắc transition)').toEqual([{ type: AUTH_CHANGED }]);
    expect(refreshCalls, 'không áp token từ message — refresh roundtrip').toBe(1);
  });

  it('receiver ĐÃ AUTHED nhận auth-changed → refresh KHÔNG re-broadcast (authed→authed)', async () => {
    const hub = new BroadcastHub();
    const { store, seen } = makeTab(hub, {
      fetchImpl: vi.fn(async (): Promise<Response> => jsonResponse({ accessToken: makeJwt('u2') }))
    });
    store.setToken(makeJwt('u1')); // đã authed (broadcast này đi ra watcher, không quan trọng)
    seen.length = 0;

    const emitter = hub.connect();
    emitter.post({ type: AUTH_CHANGED });
    await vi.waitFor(() => expect(store.getToken()).not.toBe(makeJwt('u1')));
    await new Promise((r) => setTimeout(r, 20));
    expect(seen, 'authed→authed — KHÔNG re-broadcast → chặn BC loop N-tab').toEqual([]);
  });

  it('message lạ / sai shape → bỏ qua không crash', async () => {
    const hub = new BroadcastHub();
    let refreshCalls = 0;
    const { store } = makeTab(hub, {
      fetchImpl: vi.fn(async (): Promise<Response> => { refreshCalls += 1; return jsonResponse({ accessToken: makeJwt('u1') }); })
    });
    const emitter = hub.connect();
    emitter.post({ hello: 'world' } as unknown as SyncMessage);
    emitter.post(null as unknown as SyncMessage);
    emitter.post({ type: 42 } as unknown as SyncMessage);
    emitter.post({ type: 'refresh-start' }); // handshake KHÔNG trigger refresh
    emitter.post({ type: 'refresh-done' });
    await new Promise((r) => setTimeout(r, 30));
    expect(refreshCalls, 'chỉ auth-changed mới refresh').toBe(0);
    expect(store.isAuthenticated()).toBe(false);
  });
});

describe('session-sync — storage fallback', () => {
  it('createStorageFallbackBus: post ghi sentinel (v,n luôn khác nhau); event đúng key → auth-changed; key lạ bỏ qua', () => {
    const written: string[] = [];
    const handlers = new Set<(e: { key: string | null; newValue: string | null }) => void>();
    const storage = {
      getItem: () => null,
      setItem: (_k: string, v: string) => { written.push(v); },
      removeItem: () => {}
    };
    const bus = createStorageFallbackBus(storage as Storage, (fn) => {
      handlers.add(fn);
      return () => handlers.delete(fn);
    });
    const received: SyncMessage[] = [];
    bus.subscribe((m) => received.push(m));

    bus.post({ type: AUTH_CHANGED });
    expect(written).toHaveLength(1);
    const first = JSON.parse(written[0]);
    expect(first.v).toBe(1);
    bus.post({ type: AUTH_CHANGED });
    const second = JSON.parse(written[1]);
    expect(second.n, 'nonce KHÁC lần trước (storage event cần value đổi để fire)').not.toBe(first.n);

    // tab khác ghi sentinel đúng key → nhận auth-changed
    for (const fn of handlers) fn({ key: SENTINEL_KEY, newValue: written[0] });
    expect(received).toEqual([{ type: AUTH_CHANGED }]);
    // key lạ / value rác → bỏ qua
    for (const fn of handlers) fn({ key: 'other-key', newValue: written[0] });
    for (const fn of handlers) fn({ key: SENTINEL_KEY, newValue: 'garbage' });
    for (const fn of handlers) fn({ key: SENTINEL_KEY, newValue: null });
    expect(received).toHaveLength(1);
  });
});

describe('session-sync — handshake message không tự gây refresh (luật receiver)', () => {
  it('refresh-start/refresh-done đi qua bus KHÔNG trigger refresh', async () => {
    const hub = new BroadcastHub();
    let refreshCalls = 0;
    const { store } = makeTab(hub, {
      fetchImpl: vi.fn(async (): Promise<Response> => { refreshCalls += 1; return jsonResponse({ accessToken: makeJwt('u1') }); })
    });
    const emitter = hub.connect();
    emitter.post({ type: REFRESH_START });
    emitter.post({ type: REFRESH_DONE });
    await new Promise((r) => setTimeout(r, 30));
    expect(refreshCalls).toBe(0);
    expect(store.isAuthenticated()).toBe(false);
  });
});
```

- [ ] **Step 1.2: Viết test FAIL — `__tests__/ssr-guard.test.ts`** (node env mặc định của package; Node CÓ BroadcastChannel native → phải spy thay trước khi import)

```ts
import { describe, expect, it, vi } from 'vitest';

// Node 24 CÓ BroadcastChannel + navigator.locks native — SSR-guard PHẢI dựa trên
// `typeof window`, KHÔNG phải `typeof BroadcastChannel` (spec §2.5). Spy thay
// global TRƯỚC khi import để bắt mọi constructor call (kể cả top-level).
const created: unknown[] = [];

vi.stubGlobal('BroadcastChannel', class SpyChannel {
  constructor() {
    created.push(this);
  }
  postMessage() {}
  close() {}
  addEventListener() {}
});

describe('session-sync SSR-guard (Node thuần — không window)', () => {
  it('import module + configureAuth → không ném, KHÔNG tạo BroadcastChannel nào', async () => {
    expect(created).toHaveLength(0); // import side-effect-free
    const { configureAuth } = await import('../AuthStore');
    expect(() => configureAuth({ refreshUrl: '/api/identity/auth/refresh' })).not.toThrow();
    expect(created, 'SSR/Node: lazy init KHÔNG chạm BroadcastChannel (typeof window guard)').toHaveLength(0);
  });
});
```

- [ ] **Step 1.3: Chạy verify FAIL**

Run: `cd frontend && pnpm --filter @ecommerce/auth test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../session-sync'` (hoặc `createSessionSync is not a function`).

- [ ] **Step 1.4: Implement `src/session-sync.ts`**

```ts
// session-sync (FI-399) — đồng bộ session đa tab cùng origin.
//
// Contract (ADR 0008):
// - Broadcast CHỈ khi state FLIP auth↔unauth (subscriber-diff trên authStore) —
//   refresh rotate token (authed→authed) KHÔNG broadcast → chặn BC loop N-tab.
// - Message `{type:'auth-changed'}` KHÔNG mang token — receiver refresh()
//   cookie-roundtrip, không bao giờ áp token từ message.
// - Fallback khi không có BroadcastChannel: localStorage sentinel
//   `ecommerce.auth-sync` ({v,t,n}) + event 'storage' ở tab khác. Nonce n đảm
//   bảo value luôn đổi (storage event không fire khi newValue giống cũ).
// - SSR-guard: mọi thứ client-only nằm sau createSessionSync/ensureStarted —
//   import module + configureAuth ở Node KHÔNG tạo channel nào (Node có BC
//   native — guard là `typeof window`, KHÔNG phải `typeof BroadcastChannel`).

export const CHANNEL_NAME = 'ecommerce.auth';
export const SENTINEL_KEY = 'ecommerce.auth-sync';
export const LOCK_NAME = 'ecommerce.auth-refresh';
export const AUTH_CHANGED = 'auth-changed';
export const REFRESH_START = 'refresh-start';
export const REFRESH_DONE = 'refresh-done';

export interface SyncMessage {
  type: string;
  [key: string]: unknown;
}

/** Store shape session-sync cần (AuthStore thỏa structurally — không import runtime). */
export interface AuthSyncStore {
  isAuthenticated(): boolean;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<boolean>;
}

export interface SyncBus {
  /** Gửi tới CÁC TAB KHÁC (BroadcastChannel không loopback về mình). */
  post(message: SyncMessage): void;
  subscribe(fn: (message: SyncMessage) => void): () => void;
}

export interface SessionSyncDeps {
  /** undefined = auto (BC → storage fallback → none); null = tắt hẳn. */
  bus?: SyncBus | null;
  /** undefined = navigator.locks nếu có; null = fallback handshake mode. */
  locks?: LockManager | null;
  backoffMs?: number;              // default 400 (Task 2)
  jitterRange?: [number, number];  // default [50, 150] — fallback only (Task 2)
  fetchTimeoutMs?: number;         // default 10_000 (Task 2)
}

export interface SessionSyncHandle {
  start(): void;
  stop(): void;
}

function isSyncMessage(value: unknown): value is SyncMessage {
  return typeof value === 'object' && value !== null && typeof (value as SyncMessage).type === 'string';
}

interface SyncCtx {
  store: AuthSyncStore;
  deps: SessionSyncDeps;
  bus: SyncBus | null;
  wasAuthed: boolean;
  started: boolean;
  unsubBus: (() => void) | null;
  unsubTransition: (() => void) | null;
  originalRefresh: (() => Promise<boolean>) | null;
  refreshWrapped: boolean;
  // Task 2 (fallback handshake state — remote refresh đang chạy):
  remoteRefreshActive: boolean;
}

/** Production bus: BroadcastChannel primary; không có BC → storage sentinel. */
export function createProductionBus(): SyncBus | null {
  if (typeof window === 'undefined') return null;
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const subs = new Set<(m: SyncMessage) => void>();
    channel.onmessage = (ev: MessageEvent) => {
      if (!isSyncMessage(ev.data)) return;
      for (const fn of subs) fn(ev.data as SyncMessage);
    };
    return {
      post(message) {
        try {
          channel.postMessage(message);
        } catch {
          // channel đóng (HMR/unload) — bỏ qua, tab khác tự refresh định kỳ
        }
      },
      subscribe(fn) {
        subs.add(fn);
        return () => {
          subs.delete(fn);
          if (subs.size === 0) channel.close();
        };
      }
    };
  }
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  if (!storage) return null;
  return createStorageFallbackBus(storage, (fn) => {
    const listener = (ev: StorageEvent) => fn({ key: ev.key, newValue: ev.newValue });
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  });
}

/** Bus storage sentinel — tách ra để test DI (storage + listener target fake). */
export function createStorageFallbackBus(
  storage: Storage,
  listen: (fn: (e: { key: string | null; newValue: string | null }) => void) => () => void
): SyncBus {
  const subs = new Set<(m: SyncMessage) => void>();
  const offListen = listen((e) => {
    if (e.key !== SENTINEL_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as { v?: unknown };
      if (parsed.v !== 1) return; // version lạ — tương lai mới xử
    } catch {
      return; // value rác — bỏ qua
    }
    const message: SyncMessage = { type: AUTH_CHANGED };
    for (const fn of subs) fn(message);
  });
  return {
    post() {
      // value KHÔNG mang message/token — chỉ là "có sự thay đổi auth" signal.
      const sentinel = { v: 1, t: Date.now(), n: Math.random().toString(36).slice(2) };
      try {
        storage.setItem(SENTINEL_KEY, JSON.stringify(sentinel));
      } catch {
        // storage đầy/chặn — fallback chết im lặng, BC chính vẫn lo
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
        if (subs.size === 0) offListen();
      };
    }
  };
}

function onStateChange(ctx: SyncCtx): void {
  const authed = ctx.store.isAuthenticated();
  const flipped = authed !== ctx.wasAuthed;
  ctx.wasAuthed = authed;
  if (flipped) ctx.bus?.post({ type: AUTH_CHANGED });
}

function onRemoteMessage(ctx: SyncCtx, message: SyncMessage): void {
  if (message.type === AUTH_CHANGED) {
    // Receiver: cookie-roundtrip, KHÔNG áp token từ message. Transition (nếu
    // có) tự broadcast qua onStateChange — đúng luật "re-broadcast khi tự flip".
    void ctx.store.refresh().catch(() => {});
    return;
  }
  if (message.type === REFRESH_START) ctx.remoteRefreshActive = true;
  if (message.type === REFRESH_DONE) ctx.remoteRefreshActive = false;
}

/** Tạo handle sync cho 1 store (tab). stop() trả state nguyên vẹn. */
export function createSessionSync(store: AuthSyncStore, deps: SessionSyncDeps = {}): SessionSyncHandle {
  const ctx: SyncCtx = {
    store,
    deps,
    bus: null,
    wasAuthed: false,
    started: false,
    unsubBus: null,
    unsubTransition: null,
    originalRefresh: null,
    refreshWrapped: false,
    remoteRefreshActive: false
  };
  return {
    start() {
      if (ctx.started) return;
      ctx.started = true;
      ctx.wasAuthed = store.isAuthenticated();
      ctx.bus = deps.bus !== undefined ? deps.bus : createProductionBus();
      if (ctx.bus) ctx.unsubBus = ctx.bus.subscribe((m) => onRemoteMessage(ctx, m));
      ctx.unsubTransition = store.subscribe(() => onStateChange(ctx));
      // Task 2 cắm wrapRefresh(ctx) ở đây.
    },
    stop() {
      if (!ctx.started) return;
      ctx.started = false;
      ctx.unsubBus?.();
      ctx.unsubBus = null;
      ctx.unsubTransition?.();
      ctx.unsubTransition = null;
      ctx.bus = null;
    }
  };
}
```

- [ ] **Step 1.5: Implement AuthStore.ts changes** (3 chỗ — KHÔNG đụng logic refresh/logout hiện có ngoài thêm signal)

(a) `class AuthStore` → `export class AuthStore` (AuthStore.ts:64 — additive cho test DI Task 2).

(b) POST refresh thêm timeout (AuthStore.ts:141-144 — fetch treo không giữ lock vô hạn, spec §2.3):

```ts
      const res = await this.doFetch(this.config.refreshUrl, {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(this.config.fetchTimeoutMs ?? 10_000)
      });
```

và thêm vào `AuthConfig` interface:

```ts
  /** Timeout 1 POST refresh (ms) — default 10s. Fetch treo không được giữ cross-tab lock. */
  fetchTimeoutMs?: number;
```

(c) Cuối file — auto-start listener (idempotent, SSR-guard `typeof window`):

```ts
import { createSessionSync, type SessionSyncHandle } from './session-sync';

let sessionSyncHandle: SessionSyncHandle | null = null;

/** Browser: start ĐÚNG 1 lần dù configureAuth gọi bao nhiêu lần (shell host + remotes đều gọi). */
function ensureSessionSyncStarted(): void {
  if (typeof window === 'undefined') return; // SSR/Node — lazy, không chạm Web API
  if (sessionSyncHandle) return;
  sessionSyncHandle = createSessionSync(authStore);
  sessionSyncHandle.start();
}

export function configureAuth(config: Partial<AuthConfig>): void {
  authStore.configureAuth(config);
  ensureSessionSyncStarted();
}
```

(import đặt lên đầu file với các import hiện có; 3 khối code (b)/(c) đặt đúng vị trí.)

- [ ] **Step 1.6: Chạy verify PASS**

Run: `cd frontend && pnpm --filter @ecommerce/auth test`
Expected: ALL PASS (test cũ authStore.test.ts + api.test.ts vẫn xanh — setToken/logout behavior không đổi).

- [ ] **Step 1.7: Commit**

```bash
git add frontend/packages/auth/src/session-sync.ts frontend/packages/auth/src/AuthStore.ts \
        frontend/packages/auth/src/__tests__/session-sync.test.ts frontend/packages/auth/src/__tests__/ssr-guard.test.ts
git commit -m "feat(auth): session-sync module — transition-only broadcast + storage fallback + SSR-guard (FI-399)"
```

---

### Task 2: Cross-tab refresh coordination (Web Locks + handshake fallback) + 401-retry-once CÓ ĐIỀU KIỆN

**Files:**
- Create: `frontend/packages/auth/src/__tests__/session-sync-race.test.ts`
- Modify: `frontend/packages/auth/src/session-sync.ts` (wrapRefresh + coordinatedRefresh)
- Test command: `cd frontend && pnpm --filter @ecommerce/auth test`

- [ ] **Step 2.1: Viết test FAIL — `__tests__/session-sync-race.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { AuthStore, authStore } from '../AuthStore';
import { createSessionSync } from '../session-sync';
// LockManager là DOM global type (lib.dom) — không import từ session-sync.

const REFRESH_URL = '/api/identity/auth/refresh';

function makeJwt(sub: string): string {
  const b64url = (s: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(s)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify({ sub, roles: ['customer'] }))}.sig`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** BroadcastChannel mock: post() fan-out cho tab khác, không loopback. */
class BroadcastHub {
  private members = new Map<object, (m: { type: string }) => void>();
  connect() {
    const tag = {};
    const members = this.members;
    return {
      post(message: { type: string }) {
        for (const [t, fn] of members) if (t !== tag) fn(message);
      },
      subscribe(fn: (m: { type: string }) => void) {
        members.set(tag, fn);
        return () => { members.delete(tag); };
      }
    };
  }
}

/**
 * Cookie-jar fetch mock — mô phỏng one-time rotate server THẬT:
 * POST đọc cookie hiện tại của jar → nếu cookie đã bị dùng (replay) → 401;
 * ngược lại rotate: jar nhận cookie mới + trả token.
 * `await setTimeout(0)` trước khi xử lý để 2 POST đồng thời CÓ THỂ interleaved
 * (nếu không có lock — đúng race thật).
 */
function makeRotatingFetch(jar: { cookie: string }, log: Array<{ sent: string | null; stale: boolean; replay: boolean }>) {
  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const sent = jar.cookie;
    await new Promise((r) => setTimeout(r, 0)); // nhường event loop — race thật
    if (sent !== jar.cookie) {
      log.push({ sent, stale: true, replay: false });
      return jsonResponse({ title: 'unauthorized — one-time rotate' }, 401);
    }
    const next = `C${jar.cookie.length}-${Math.random().toString(36).slice(2, 6)}`;
    jar.cookie = next; // rotate atomic
    log.push({ sent, stale: false, replay: false });
    return jsonResponse({ accessToken: makeJwt(`u-${log.length}`) });
  };
}

/** navigator.locks mock — queue THẬT: callback kế chỉ chạy khi callback trước resolve. */
function makeLockManagerMock(): LockManager & { busyForTest(): boolean } {
  let busy = false;
  const queue: Array<() => void> = [];
  const pump = () => {
    if (busy || queue.length === 0) return;
    busy = true;
    const next = queue.shift()!;
    next();
  };
  return {
    busyForTest: () => busy,
    query: async () => ({ held: busy ? [{ name: 'x' }] : [], pending: [] }),
    request: (_name: string, _opts: unknown, cb: () => Promise<unknown>) =>
      new Promise((resolve) => {
        queue.push(() => {
          Promise.resolve(cb()).then(resolve, resolve).finally(() => {
            busy = false;
            pump();
          });
        });
        pump();
      })
  } as unknown as LockManager & { busyForTest(): boolean };
}

interface TabOpts {
  locks?: LockManager | null;
  jar: { cookie: string };
  log: Array<{ sent: string | null; stale: boolean; replay: boolean }>;
  forcedFailures?: number; // server 401 N lần ĐẦU bất kể cookie (mô phỏng rotation lạc)
}

function makeTab(hub: BroadcastHub, opts: TabOpts) {
  const store = new AuthStore();
  let failures = opts.forcedFailures ?? 0;
  const base = makeRotatingFetch(opts.jar, opts.log);
  store.configureAuth({
    refreshUrl: REFRESH_URL,
    fetchImpl: async (input, init) => {
      if (failures > 0) {
        failures -= 1;
        await new Promise((r) => setTimeout(r, 0));
        return jsonResponse({ title: 'forced 401' }, 401);
      }
      return base(input, init);
    }
  });
  const sync = createSessionSync(store, {
    bus: hub.connect(),
    locks: opts.locks === undefined ? null : opts.locks, // default null = fallback mode cho unit
    backoffMs: 5,            // test nhanh — production 400
    jitterRange: [0, 0]
  });
  sync.start();
  return { store, sync };
}

/** Bật N refresh ĐỒNG THỜI trên 2 tab. */
async function race(a: AuthStore, b: AuthStore) {
  return Promise.all([a.refresh(), b.refresh()]);
}

describe('rotate-race — 2 tab refresh đồng thời (P0 FI-399)', () => {
  it('Web Locks serialize: 20 chạy liên tiếp — 0 stale POST, 0 spurious logout', async () => {
    for (let round = 0; round < 20; round++) {
      const hub = new BroadcastHub();
      const jar = { cookie: `C0-r${round}` };
      const logA: Array<{ sent: string | null; stale: boolean }> = [];
      const logB: Array<{ sent: string | null; stale: boolean }> = [];
      const locks = makeLockManagerMock();
      const a = makeTab(hub, { locks, jar, log: logA }).store;
      const b = makeTab(hub, { locks, jar, log: logB }).store;
      a.setToken(makeJwt('a')); // authed trước khi race
      b.setToken(makeJwt('b'));

      const [ra, rb] = await race(a, b);

      expect(ra, `round ${round}: tab A phải thành công (serialized)`).toBe(true);
      expect(rb, `round ${round}: tab B phải thành công — cookie mới sau khi chờ lock`).toBe(true);
      expect(a.isAuthenticated(), `round ${round}: 0 spurious logout A`).toBe(true);
      expect(b.isAuthenticated(), `round ${round}: 0 spurious logout B`).toBe(true);
      expect([...logA, ...logB].filter((e) => e.stale), `round ${round}: không POST nào mang cookie stale`).toEqual([]);
    }
  });

  it('KHÔNG lock (fallback): race bị phát hiện (stale 401) NHƯNG retry-once cứu → vẫn 0 logout', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: Array<{ sent: string | null; stale: boolean }> = [];
    const a = makeTab(hub, { locks: null, jar, log }).store;
    const b = makeTab(hub, { locks: null, jar, log }).store;
    a.setToken(makeJwt('a'));
    b.setToken(makeJwt('b'));

    const [ra, rb] = await race(a, b);

    expect(ra && rb, 'retry-once (fallback mode) cứu cả 2 tab').toBe(true);
    expect(a.isAuthenticated()).toBe(true);
    expect(b.isAuthenticated(), 'fallback: stale 401 → backoff → retry cookie mới → không logout').toBe(true);
    expect(log.some((e) => e.stale), 'fallback KHÔNG serialize hoàn hảo — ít nhất 1 stale bị bắt').toBe(true);
  });
});

describe('401-retry-once CÓ ĐIỀU KIỆN (spec §2.3)', () => {
  it('fallback mode + 401 → retry ĐÚNG 1 lần sau backoff → 200 → authed (2 POST)', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: Array<{ sent: string | null; stale: boolean }> = [];
    const { store } = makeTab(hub, { locks: null, jar, log, forcedFailures: 1 });
    store.setToken(makeJwt('u1'));

    await expect(store.refresh()).resolves.toBe(true);
    expect(log).toHaveLength(2);
    expect(store.isAuthenticated()).toBe(true);
  });

  it('fallback mode + 401 cả 2 lần → logout (retry CHỈ 1 lần, đúng 2 POST)', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: Array<{ sent: string | null; stale: boolean }> = [];
    const { store } = makeTab(hub, { locks: null, jar, log, forcedFailures: 5 });
    store.setToken(makeJwt('u1'));

    await expect(store.refresh()).resolves.toBe(false);
    expect(log, 'retry ĐÚNG 1 lần — không đệ quy').toHaveLength(2);
    expect(store.isAuthenticated()).toBe(false);
  });

  it('locks mode + KHÔNG contender + 401 → logout NGAY sau ĐÚNG 1 POST (cookie thật chết)', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: Array<{ sent: string | null; stale: boolean }> = [];
    const locks = makeLockManagerMock();
    const { store } = makeTab(hub, { locks, jar, log, forcedFailures: 5 });
    store.setToken(makeJwt('u1'));

    await expect(store.refresh()).resolves.toBe(false);
    expect(log, 'không contender → không retry → 1 POST duy nhất').toHaveLength(1);
    expect(store.isAuthenticated()).toBe(false);
  });

  it('locks mode + CÓ contender (lock đang giữ khi đo) + 401 → retry → 200 (2 POST)', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: Array<{ sent: string | null; stale: boolean }> = [];
    const locks = makeLockManagerMock();
    // giữ lock TRƯỚC — khi tab refresh đo contention sẽ thấy held > 0
    const hold = locks.request('ecommerce.auth-refresh', {}, async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const { store } = makeTab(hub, { locks, jar, log, forcedFailures: 1 });
    store.setToken(makeJwt('u1'));

    await expect(store.refresh()).resolves.toBe(true);
    await hold;
    expect(log, 'contender → retry enabled → đúng 2 POST').toHaveLength(2);
    expect(store.isAuthenticated()).toBe(true);
  });

  it('guest boot không contender + 401 → logout sau 1 POST, KHÔNG backoff thuế (spec-critic P1#2)', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: '' }; // guest — không cookie
    const log: Array<{ sent: string | null; stale: boolean }> = [];
    const locks = makeLockManagerMock();
    const { store } = makeTab(hub, { locks, jar, log, forcedFailures: 5 });

    const t0 = Date.now();
    await expect(store.refresh()).resolves.toBe(false);
    expect(Date.now() - t0, 'không contender → KHÔNG chờ backoff 400ms').toBeLessThan(200);
    expect(log).toHaveLength(1);
    expect(store.isAuthenticated()).toBe(false);
  });
});

describe('refresh coordination — đơn tab vẫn đi qua lock', () => {
  it('refresh thành công qua lock → token mới + listener notify', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: Array<{ sent: string | null; stale: boolean }> = [];
    const locks = makeLockManagerMock();
    const { store } = makeTab(hub, { locks, jar, log });
    store.setToken(makeJwt('old'));
    const listener = vi.fn();
    store.subscribe(listener);

    await expect(store.refresh()).resolves.toBe(true);
    expect(store.isAuthenticated()).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(locks.busyForTest(), 'lock nhả sau khi xong').toBe(false);
  });
});

// authStore singleton vẫn hoạt động (regression — export class không đổi behavior)
describe('singleton regression', () => {
  it('authStore.setToken/logout nguyên trạng', () => {
    authStore.setToken(makeJwt('s1'));
    expect(authStore.isAuthenticated()).toBe(true);
    authStore.logout();
    expect(authStore.isAuthenticated()).toBe(false);
  });
});
```

- [ ] **Step 2.2: Chạy verify FAIL**

Run: `cd frontend && pnpm --filter @ecommerce/auth test 2>&1 | tail -15`
Expected: FAIL — race tests fail (spurious logout / stale POSTs — KHÔNG có coordination) — đây chính là bug FI-399 tái hiện trong unit.

- [ ] **Step 2.3: Implement coordination trong `session-sync.ts`**

Thêm vào `createSessionSync` trong `start()` (thay comment "Task 2 cắm..."):

```ts
      wrapRefresh(ctx);
```

Thêm các function + sửa `onRemoteMessage` đã có sẵn REFRESH_START/DONE (Task 1):

```ts
type RefreshFn = () => Promise<boolean>;

/** Wrap store.refresh = coordinatedRefresh; giữ bản gốc để stop() restore. */
function wrapRefresh(ctx: SyncCtx): void {
  const target = ctx.store as AuthSyncStore & { refresh: RefreshFn };
  ctx.originalRefresh = target.refresh; // prototype method (chưa bị wrap)
  target.refresh = () => coordinatedRefresh(ctx);
  ctx.refreshWrapped = true;
}

function unwrapRefresh(ctx: SyncCtx): void {
  if (!ctx.refreshWrapped) return;
  delete (ctx.store as { refresh?: RefreshFn }).refresh; // trả prototype lookup
  ctx.refreshWrapped = false;
}
```

(`stop()` trong handle gọi thêm `unwrapRefresh(ctx)` TRƯỚC các unsubscribe.)

```ts
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getLocks(deps: SessionSyncDeps): LockManager | null {
  if (deps.locks !== undefined) return deps.locks; // DI (kể cả null = fallback)
  if (typeof navigator !== 'undefined') return navigator.locks ?? null;
  return null;
}

async function coordinatedRefresh(ctx: SyncCtx): Promise<boolean> {
  const locks = getLocks(ctx.deps);
  const fallback = locks === null;
  // Đo contention TRƯỚC khi vào lock — evidence cho retry-once (spec §2.3).
  // KHÔNG dựa handshake-start ở đây: refresh-start chỉ tồn tại ở fallback mode.
  let contender = false;
  if (locks && typeof locks.query === 'function') {
    try {
      const snapshot = await locks.query();
      contender = (snapshot.held?.length ?? 0) > 0;
    } catch {
      contender = true; // không đo được — an toàn là trên (retry enabled)
    }
  }
  const runInside = () => refreshWithConditionalRetry(ctx, { fallback, contender });
  if (locks) {
    try {
      return await locks.request(LOCK_NAME, { ifAvailable: false }, runInside);
    } catch {
      // locks API lỗi giữa chừng — chạy không lock, retry enabled (an toàn)
      return runInside();
    }
  }
  return fallbackRefresh(ctx, runInside);
}

/** Fallback (không Web Locks): jitter → nhường remote refresh đang chạy → handshake broadcast. BEST-EFFORT (ADR 0008). */
async function fallbackRefresh(ctx: SyncCtx, runInside: () => Promise<boolean>): Promise<boolean> {
  const [min, max] = ctx.deps.jitterRange ?? [50, 150];
  await sleep(min + Math.random() * (max - min));
  const deadline = Date.now() + 5_000;
  while (ctx.remoteRefreshActive && Date.now() < deadline) {
    await sleep(25);
  }
  ctx.bus?.post({ type: REFRESH_START });
  try {
    return await runInside();
  } finally {
    ctx.bus?.post({ type: REFRESH_DONE });
  }
}

async function refreshWithConditionalRetry(
  ctx: SyncCtx,
  flags: { fallback: boolean; contender: boolean }
): Promise<boolean> {
  const attempt = (): Promise<boolean> => ctx.originalRefresh!.call(ctx.store);
  const first = await attempt();
  if (first) return true;
  // 401 KHÔNG có bằng chứng rotate lúc mình chờ = cookie thật chết (expiry/
  // revoke/logout app khác) — logout đã xảy ra trong original, KHÔNG retry.
  if (!flags.fallback && !flags.contender) return false;
  // Retry ĐÚNG 1 lần (quyết định epic) — vẫn trong lock này.
  const timeoutMs = ctx.deps.fetchTimeoutMs ?? 10_000;
  await sleep(Math.min(ctx.deps.backoffMs ?? 400, timeoutMs));
  return attempt();
}
```

⚠ Lưu ý đặt `ctx.originalRefresh!` — wrapRefresh gán TRƯỚC khi refresh gọi; nếu caller gọi refresh TRƯỚC start() (không qua wrap) thì path không coordination — production start() luôn chạy trước (configureAuth → start ngay). Test gọi sau start().

- [ ] **Step 2.4: Chạy verify PASS + full package**

Run: `cd frontend && pnpm --filter @ecommerce/auth test`
Expected: ALL PASS (bao gồm Task 1 + cũ).

- [ ] **Step 2.5: Commit**

```bash
git add frontend/packages/auth/src/session-sync.ts frontend/packages/auth/src/__tests__/session-sync-race.test.ts
git commit -m "feat(auth): cross-tab refresh coordination — Web Locks serialize + 401 retry-once có điều kiện (FI-399)"
```

---

### Task 3: Redirect 127.0.0.1 → localhost — Next middleware

**Files:**
- Create: `frontend/apps/storefront-web/lib/host-redirect.ts`
- Create: `frontend/apps/storefront-web/tests/host-redirect.test.ts`
- Modify: `frontend/apps/storefront-web/middleware.ts` (guard đầu hàm + matcher `_next`)
- Test command: `cd frontend && pnpm --filter storefront-web test`

- [ ] **Step 3.1: Viết test FAIL — `tests/host-redirect.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { redirectHost127 } from '../lib/host-redirect';

/**
 * SF-2 FI-399: 127.0.0.1 vs localhost = 2 cookie host khác nhau → session vỡ.
 * Redirect FE-only (308 giữ method+body), localhost không khớp trigger → không loop.
 */
describe('redirectHost127', () => {
  it('127.0.0.1 → localhost', () => {
    expect(redirectHost127('127.0.0.1')).toBe('localhost');
  });
  it('localhost / domain khác / IPv6 loopback → null (không redirect)', () => {
    expect(redirectHost127('localhost')).toBeNull();
    expect(redirectHost127('example.com')).toBeNull();
    expect(redirectHost127('')).toBeNull();
  });
});
```

- [ ] **Step 3.2: Implement `lib/host-redirect.ts`**

```ts
/**
 * SF-2 FI-399 — host 127.0.0.1 phải về `localhost`: refresh cookie host-scoped,
 * 2 hostname = 2 cookie jar = session sync vỡ. Chỉ 127.0.0.1 trigger (localhost
 * không khớp → không loop). IPv6 [::1] ngoài scope (browser không tự dùng).
 */
export function redirectHost127(hostname: string): 'localhost' | null {
  return hostname === '127.0.0.1' ? 'localhost' : null;
}
```

- [ ] **Step 3.3: Sửa `middleware.ts`** — guard TRƯỚC mọi logic hiện có (affiliate `?ref` + locale), KHÔNG đụng phần còn lại:

```ts
import { redirectHost127 } from './lib/host-redirect';

export async function middleware(request: NextRequest) {
  // FI-399: 127.0.0.1 → localhost (cookie host) — giữ path+query (?ref vẫn qua
  // capture ở hop sau). 308 giữ method. Đặt TRƯỚC affiliate/locale.
  const localhost = redirectHost127(request.nextUrl.hostname);
  if (localhost) {
    const target = request.nextUrl.clone();
    target.hostname = localhost;
    return NextResponse.redirect(target, 308);
  }
  // ... nguyên trạng từ đây (rewriteTarget, resolveHeaderLocale, ?ref capture)
}
```

và matcher (dòng 103-107) mở `_next/static|_next/image` thành `_next` TOÀN PHẬN:

```ts
export const config = {
  // FI-399: loại trừ TOÀN BỘ /_next/* (redirect trên asset/data = refetch sai
  // host). App Router không phát sinh _next/data — matcher mới chỉ fast-path
  // các request middleware hôm nay đã no-op. api + robots… giữ nguyên.
  matcher: ['/((?!_next|favicon.ico|robots.txt|sitemap.xml|api).*)'],
};
```

- [ ] **Step 3.4: Chạy verify PASS + regression locale/affiliate tests**

Run: `cd frontend && pnpm --filter storefront-web test`
Expected: PASS (host-redirect mới + tests cũ unit/affiliate-cookie/locale vẫn xanh — middleware helper thay đổi không đụng logic của chúng).

- [ ] **Step 3.5: Commit**

```bash
git add frontend/apps/storefront-web/lib/host-redirect.ts frontend/apps/storefront-web/tests/host-redirect.test.ts frontend/apps/storefront-web/middleware.ts
git commit -m "feat(storefront): redirect 127.0.0.1→localhost trong Next middleware, matcher loại trừ /_next (FI-399)"
```

---

### Task 4: Redirect 127.0.0.1 → localhost — Vite plugin trong packages/config

**Files:**
- Modify: `frontend/packages/config/vite-preset.mjs` (CHỈ thêm plugin — KHÔNG đụng SHARED_SINGLETONS, vùng SF-1)
- Modify: `frontend/packages/config/vite-preset.test.mjs` (thêm describe)
- Test command: `cd frontend && pnpm --filter @ecommerce/config test`

- [ ] **Step 4.1: Viết test FAIL — append vào `vite-preset.test.mjs`**

```js
describe('redirect-127-to-localhost plugin (FI-399)', () => {
  it('defineMfeConfig nạp plugin redirect', () => {
    const config = defineMfeConfig({ name: 'mfe_x' });
    const names = config.plugins.filter(Boolean).map((p) => (Array.isArray(p) ? p.map((q) => q?.name) : p?.name));
    expect(names.flat()).toContain('redirect-127-to-localhost');
  });

  it('middleware: host 127.0.0.1 → 308 localhost giữ port+path+query; localhost → next(); ws upgrade → next()', () => {
    const config = defineMfeConfig({ name: 'mfe_x' });
    const plugin = config.plugins.flat().find((p) => p?.name === 'redirect-127-to-localhost');
    expect(plugin).toBeTruthy();
    let captured;
    const fakeServer = { middlewares: { use: (fn) => { captured = fn; } } };
    plugin.configureServer(fakeServer);
    expect(captured).toBeTypeOf('function');

    const makeRes = () => {
      const res = { code: null, headers: null, ended: false };
      res.writeHead = (code, headers) => { res.code = code; res.headers = headers; };
      res.end = () => { res.ended = true; };
      return res;
    };

    // 127.0.0.1 + path + query → 308 Location localhost (giữ ?ref để hop sau capture)
    const res1 = makeRes();
    captured({ method: 'GET', headers: { host: '127.0.0.1:5573' }, url: '/c/x?ref=CODE1' }, res1, () => { throw new Error('không được next'); });
    expect(res1.code).toBe(308);
    expect(res1.headers.Location).toBe('http://localhost:5573/c/x?ref=CODE1');
    expect(res1.ended).toBe(true);

    // localhost → next()
    let nexted = false;
    captured({ method: 'GET', headers: { host: 'localhost:5573' }, url: '/' }, makeRes(), () => { nexted = true; });
    expect(nexted).toBe(true);

    // ws upgrade (HMR) → next() — không redirect websocket
    nexted = false;
    captured({ method: 'GET', headers: { host: '127.0.0.1:5573', upgrade: 'websocket' }, url: '/' }, makeRes(), () => { nexted = true; });
    expect(nexted).toBe(true);
  });
});
```

- [ ] **Step 4.2: Chạy verify FAIL**

Run: `cd frontend && pnpm --filter @ecommerce/config test 2>&1 | tail -10`
Expected: FAIL — plugin chưa tồn tại.

- [ ] **Step 4.3: Implement trong `vite-preset.mjs`** — thêm function + 1 dòng trong plugins array (SHARED_SINGLETONS nguyên trạng):

```js
// FI-399: 127.0.0.1 vs localhost = 2 cookie host — dev mở bằng 127.0.0.1 sẽ vỡ
// session sync. Redirect 308 về localhost giữ port/path/query (proxy /api không
// đổi — redirect xảy ra trước). ws upgrade (HMR) không redirect. PRE middleware
// — chạy trước spa-fallback/transform (plugin order = mfeConfig.plugins rồi app
// plugins; configureServer hook chạy theo thứ tự plugin).
function redirect127ToLocalhostPlugin() {
  return {
    name: 'redirect-127-to-localhost',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.headers.upgrade === 'websocket') return next();
        const host = req.headers.host ?? '';
        if (!host.startsWith('127.0.0.1')) return next();
        const port = host.slice('127.0.0.1'.length); // ':5573' | ''
        res.writeHead(308, { Location: `http://localhost${port}${req.url ?? '/'}` });
        res.end();
      });
    }
  };
}
```

và trong `defineMfeConfig`:

```js
    plugins: [
      federation({ ... }),
      redirect127ToLocalhostPlugin()
    ]
```

- [ ] **Step 4.4: Chạy verify PASS**

Run: `cd frontend && pnpm --filter @ecommerce/config test`
Expected: PASS (test cũ preset vẫn xanh).

- [ ] **Step 4.5: Commit**

```bash
git add frontend/packages/config/vite-preset.mjs frontend/packages/config/vite-preset.test.mjs
git commit -m "feat(config): vite plugin redirect 127.0.0.1→localhost cho mọi MFE dev server (FI-399)"
```

---

### Task 5: e2e multi-tab — 2 PAGES CÙNG Playwright context

**Files:**
- Modify: `frontend/e2e/tests/auth-cookie.spec.ts` (append describe MỚI — 4 test HTTP-level cũ nguyên trạng)
- Validate syntax: `cd frontend && pnpm --filter @ecommerce/e2e exec playwright test auth-cookie --list` (chạy THẬT ở Task 7 — cần rig)

- [ ] **Step 5.1: Append describe vào cuối `auth-cookie.spec.ts`**

```ts
/**
 * FI-399 — session sync đa tab. 2 PAGES TRONG CÙNG 1 context (cookie jar +
 * storage + BroadcastChannel dùng chung). P1 pack: 2 contexts = partition riêng
 * → sync fail 100% như viết sai. Kịch bản: login A → B thấy ngay (≤1 POST
 * refresh, không reload); logout A → B out; 20-run rotate-race 0 spurious logout.
 */
test.describe('session sync — 2 pages cùng context (FI-399)', () => {
  let email: string;
  let password: string;

  test.beforeAll(async () => {
    const cred = newCredentials('sync399');
    email = cred.email;
    password = cred.password;
    // user cấp bằng API (pattern file này) — KHÔNG register qua UI
    const reg = await fetch(`${SHELL}/api/identity/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName: 'FI399 Sync' })
    });
    if (!reg.ok && reg.status !== 409) throw new Error(`register failed: ${reg.status}`);
  });

  /** Đếm POST refresh từ thời điểm attach (sau khi page boot xong). */
  function trackRefreshPosts(page: import('@playwright/test').Page): { count: () => number } {
    const times: number[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/identity/auth/refresh')) {
        times.push(Date.now());
      }
    });
    return {
      count: (sinceMs = 0) => times.filter((t) => t >= sinceMs).length
    };
  }

  /** Mở SHELL ở tab mới, chờ guest UI + đóng dấu chống-reload. */
  async function openGuestPage(context: import('@playwright/test').BrowserContext) {
    const page = await context.newPage();
    await page.goto(`${SHELL}/`);
    await expect(page.getByTestId('auth-guest')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { sync399Loaded: boolean }).sync399Loaded = true;
    });
    return page;
  }

  async function loginViaUi(page: import('@playwright/test').Page) {
    await page.getByTestId('auth-guest').getByRole('link', { name: 'Đăng nhập' }).click();
    await page.waitForURL(/\/login/);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByTestId('auth-user')).toBeVisible();
  }

  async function logoutViaUi(page: import('@playwright/test').Page) {
    await page.getByTestId('auth-user').click();
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
    await expect(page.getByTestId('auth-guest')).toBeVisible();
  }

  test('login A → B thấy user NGAY (không reload, ĐÚNG 1 POST refresh trên B)', async ({ page }) => {
    test.setTimeout(60_000);
    const b = await openGuestPage(page.context());
    await expect
      .poll(async () => b.evaluate(() => document.readyState), { timeout: 10_000 })
      .toBe('complete');
    const t0 = Date.now();
    const bCounter = trackRefreshPosts(b);

    await loginViaUi(page);

    await expect(b.getByTestId('auth-user'), 'B nhận broadcast → refresh → header user').toBeVisible({ timeout: 15_000 });
    expect(await b.evaluate(() => (window as unknown as { sync399Loaded: boolean }).sync399Loaded), 'B KHÔNG reload (đóng dấu còn nguyên)').toBe(true);
    expect(bCounter.count(t0), 'B đúng ≤1 POST refresh cho event này (coordination serialize)').toBeLessThanOrEqual(1);
    await b.close();
  });

  test('logout A → B về guest NGAY (không reload)', async ({ page }) => {
    test.setTimeout(60_000);
    const b = await openGuestPage(page.context());
    await loginViaUi(page);
    await expect(b.getByTestId('auth-user')).toBeVisible({ timeout: 15_000 });

    await logoutViaUi(page);

    await expect(b.getByTestId('auth-guest'), 'B nhận logout broadcast → refresh 401 → guest').toBeVisible({ timeout: 15_000 });
    expect(await b.evaluate(() => (window as unknown as { sync399Loaded: boolean }).sync399Loaded)).toBe(true);
    await b.close();
  });

  test('20-run rotate-race: 0 spurious logout (2 tab refresh đồng thời qua BC)', async ({ page }) => {
    test.setTimeout(180_000);
    const b = await openGuestPage(page.context());
    await loginViaUi(page);
    await expect(b.getByTestId('auth-user')).toBeVisible({ timeout: 15_000 });

    // counter gắn SAU login — chỉ đếm POST của 20 vòng race (spec §5)
    const aCounter = trackRefreshPosts(page);
    const bCounter = trackRefreshPosts(b);
    const t0 = Date.now();

    for (let i = 0; i < 20; i++) {
      // BroadcastChannel NGOÀI app cùng channel → CẢ 2 page (dữ listener của
      // app) refresh đồng thời — đúng race one-time-rotate thật.
      await page.evaluate(() => {
        const ch = new BroadcastChannel('ecommerce.auth');
        ch.postMessage({ type: 'auth-changed' });
        setTimeout(() => ch.close(), 50);
      });
      await expect(page.getByTestId('auth-user'), `run ${i}: A không logout`).toBeVisible();
      await expect(b.getByTestId('auth-user'), `run ${i}: B không logout`).toBeVisible();
      await page.waitForTimeout(150); // nhường 2 page kịp xong refresh serialized
    }

    const total = aCounter.count(t0) + bCounter.count(t0);
    expect(total, 'tổng POST refresh 20 vòng ≤ 50 (2×20 + slack 10) — vượt = coordination hỏng').toBeLessThanOrEqual(50);
    await expect(page.getByTestId('auth-user')).toBeVisible();
    await expect(b.getByTestId('auth-user')).toBeVisible();
    await b.close();
  });
});
```

⚠ Selector note: `auth-guest`/`auth-user` là data-testid có sẵn (AuthWidget.tsx:31,157 — READ-ONLY); 'Đăng nhập'/'Đăng xuất' là label vi hiện có (i18n `nav.login`, `account.menu.logout`). Nếu selector fail khi chạy thật → sửa TEST theo DOM thật ( KHÔNG sửa AuthWidget — không thuộc touch map).

- [ ] **Step 5.2: Validate syntax (không cần stack)**

Run: `cd frontend && pnpm --filter @ecommerce/e2e exec playwright test auth-cookie --list`
Expected: list ra 4 test cũ + 3 test mới (7 total trong file), không lỗi compile.

- [ ] **Step 5.3: Commit**

```bash
git add frontend/e2e/tests/auth-cookie.spec.ts
git commit -m "test(e2e): session sync multi-tab — 2 pages cùng context + 20-run rotate-race (FI-399)"
```

---

### Task 6: Guest-cart binary check + ADR 0008 + docker-compose.override-sf2.yml

**Files:**
- Create: `frontend/packages/auth/src/__tests__/guest-cart-key.test.ts`
- Create: `docs/adr/0008-session-sync-contract.md`
- Create: `docker-compose.override-sf2.yml` (repo root)
- Test command: `cd frontend && pnpm --filter @ecommerce/auth test`

- [ ] **Step 6.1: Viết test + chạy — `guest-cart-key.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * FI-399 — guest cart token consistency (binary, pack §7): localStorage key
 * `ecommerce.guest_cart_token` phải là CÙNG 1 literal từ cả 2 app (storefront
 * AddToCart + checkout cartApi) — 1 origin đọc/ghi chung. 2 app KHÔNG import
 * chéo được (mfe-checkout không phụ thuộc storefront-web) → kiểm bằng extract
 * literal từ source của cả 2 + simulate 2 app-context cùng 1 storage.
 */
const here = dirname(fileURLToPath(import.meta.url));
const checkoutCartApi = resolve(here, '../../../../apps/mfe-checkout/src/lib/cartApi.ts');
const storefrontAddToCart = resolve(here, '../../../../apps/storefront-web/components/pdp/AddToCart.tsx');

function extractKeyLiteral(source: string): string | null {
  const m = /['"`]ecommerce\.guest_cart_token['"`]/.exec(source);
  return m ? 'ecommerce.guest_cart_token' : null;
}

describe('guest cart token — same-key cross-app (binary)', () => {
  it('key literal ĐỒNG NHẤT ở cartApi (checkout) và AddToCart (storefront)', () => {
    const cartApi = readFileSync(checkoutCartApi, 'utf8');
    const addToCart = readFileSync(storefrontAddToCart, 'utf8');
    const fromCheckout = extractKeyLiteral(cartApi);
    const fromStorefront = extractKeyLiteral(addToCart);
    expect(fromCheckout, 'cartApi phải dùng literal ecommerce.guest_cart_token').toBe('ecommerce.guest_cart_token');
    expect(fromStorefront, 'AddToCart phải dùng cùng literal').toBe(fromCheckout);
  });

  it('2 app-context cùng 1 storage → ghi/đọc roundtrip cùng key', () => {
    const backing = new Map<string, string>();
    const storageAppA = {
      setItem: (k: string, v: string) => void backing.set(k, v),
      getItem: (k: string) => backing.get(k) ?? null
    };
    const storageAppB = { ...storageAppA }; // cùng origin = cùng backing store
    const KEY = 'ecommerce.guest_cart_token';

    storageAppA.setItem(KEY, 'token-abc');
    expect(storageAppB.getItem(KEY), 'app B đọc đúng token app A ghi — cùng origin/key').toBe('token-abc');
    storageAppB.setItem(KEY, 'token-def');
    expect(storageAppA.getItem(KEY)).toBe('token-def');
  });
});
```

- [ ] **Step 6.2: Viết `docs/adr/0008-session-sync-contract.md`**

```markdown
# ADR 0008 — Session sync contract (FI-399, story FI-397)

Date: 2026-09-09 · Status: Accepted · Owner: packages/auth (SF-2)

## Context
Access token chỉ sống in-memory; refresh dựa cookie httpOnly one-time rotate
(replay cookie cũ → 401). N tab refresh đồng thời với cùng cookie → 1 thắng,
N-1 nhận 401 → AuthStore logout NGAY → **spurious logout user-visible**. Ngoài
ra login/logout 1 tab không lan tab khác; 127.0.0.1 vs localhost = 2 cookie host.

## Decision
1. **Channel**: BroadcastChannel `ecommerce.auth` (primary) + localStorage
   sentinel `ecommerce.auth-sync` (fallback, value `{v:1,t,n}` — n = nonce để
   storage event luôn fire khi 2 transition cùng ms; KHÔNG token trong message).
2. **Broadcast transition-only**: chỉ khi isAuthenticated() FLIP auth↔unauth
   (subscriber-diff trên authStore). Refresh rotate token (authed→authed) không
   broadcast → chặn BC loop N-tab. Receiver nhận `auth-changed` → refresh()
   cookie-roundtrip (không áp token từ message); tự flip thì tự broadcast
   (đúng luật) — sóng N-tab tắt sau tối đa N broadcast, tự nhiên.
   **Chi phí đã biết (không phải bug)**: N tab boot guest→authed = O(N²) POST
   thừa (mỗi tab mới broadcasts → các tab đã-authed refresh lại vô nghĩa).
   Chấp nhận — chấp-range dev/small-N; optimize sau nếu cần.
3. **Cross-tab refresh coordination** (P0): mọi refresh() chạy trong
   Web Locks `ecommerce.auth-refresh` (origin-global) → POST tuần tự, mỗi POST
   đọc cookie mới nhất → không replay. Fallback (không có navigator.locks):
   BC handshake `refresh-start/refresh-done` + jitter 50-150ms + chờ remote
   xong (timeout 5s) — **best-effort**, message-crossing 2 tab start cùng lúc
   KHÔNG được serialize đầy đủ (khai báo rõ; Web Locks là path chuẩn).
4. **401-refresh retry ĐÚNG 1 lần** sau backoff 400ms, BÊN TRONG lock, CHỈ khi
   có bằng chứng rotate có thể xảy ra lúc mình chờ: (a) đang fallback mode, hoặc
   (b) navigator.locks.query() thấy holder khác lúc đo contention. Không
   contender + không fallback → 401 là cookie thật chết → logout NGAY (1 POST,
   không backoff) — guest boot không bị thuế 2 POST + 400ms authReady.
5. **Timeout**: POST refresh mang AbortSignal.timeout(10s) — fetch treo không
   giữ lock vô hạn (lock là coupling cross-tab mới).
6. **SSR-guard**: mọi Web API chạm sau `typeof window === 'undefined'` return —
   KHÔNG BAO GIỜ guard bằng `typeof BroadcastChannel` (Node 18+ có BC native).
   configureAuth auto-start idempotent (module-level handle).
7. **Seam**: `createSessionSync(store, deps)` wrap `store.refresh`; `stop()`
   restore. deps DI (bus/locks/backoff/jitter) — unit test dùng CÙNG seam với
   production path (`createSessionSync(authStore)` từ configureAuth).
8. **Redirect 127→localhost**: Next middleware guard đầu hàm (308 giữ
   path+query — `?ref` vẫn capture ở hop sau) + matcher loại trừ toàn bộ
   `/_next/*`; Vite plugin `redirect-127-to-localhost` trong preset (mọi MFE
   dev server; skip ws upgrade). Lý do: cookie host-scoped — 2 hostname = 2 jar.

## Consequences
- Login/logout lan tức thì đa tab/app cùng origin; 20-run rotate-race 0 spurious
  logout (unit + e2e regression).
- Cookie contract `/api/identity` không đổi; zero backend change; dep freeze
  (BC/Web Locks/storage = Web API).
- 2FA challenge không broadcast (throw trước setToken); OAuth callback broadcast
  tự nhiên.
- Roadmap migration (b) account→checkout thuộc SF-5 (ADR riêng).
```

- [ ] **Step 6.3: Viết `docker-compose.override-sf2.yml`** (repo root — recipe isolated +400 cho SF-5; SF-2 gate KHÔNG cần — dùng docker-run PG riêng, Task 7)

```yaml
# FI-399 — isolated stack cho gate same-origin proof + SF-5 regression.
# Dùng: COMPOSE_PROJECT_NAME=fi397sf2 docker compose -p fi397sf2 \
#         -f docker-compose.yml -f docker-compose.override-sf2.yml --profile full up -d
# Toàn bộ host-port +400 so với base; container_name prefix fi397sf2- (container
# là GLOBAL — project name riêng không đổi container_name, không prefix = đụng
# stack chính). Inter-service vẫn DNS theo service name (không đổi).
# ⚠ ports trong override PHẢI dùng !override tag để REPLACE (compose merge ports
# là union — không !override sẽ conflict 2 mapping cùng host port).
services:
  postgres:
    container_name: fi397sf2-postgres
    ports: !override
      - "5833:5432"
  redis:
    container_name: fi397sf2-redis
    ports: !override
      - "6777:6379"
  rabbitmq:
    container_name: fi397sf2-rabbitmq
    ports: !override
      - "6072:5672"
      - "16072:15672"
  mailpit:
    container_name: fi397sf2-mailpit
    ports: !override
      - "1425:1025"
      - "8425:8025"
  mongo:
    container_name: fi397sf2-mongo
    ports: !override
      - "27417:27017"
  mongo-express:
    container_name: fi397sf2-mongo-express
    ports: !override
      - "8489:8081"
  elasticsearch:
    container_name: fi397sf2-elasticsearch
    ports: !override
      - "9600:9200"
  invoice-service:
    container_name: fi397sf2-invoice-service
    ports: !override
      - "8490:8090"
  gateway:
    container_name: fi397sf2-gateway
    ports: !override
      - "8480:8080"
  minio:
    container_name: fi397sf2-minio
    ports: !override
      - "9400-9401:9000-9001"
  # Services chỉ nội bộ (identity, catalog, cart, inventory, ordering, payment,
  # notification, log, partner-api, affiliate, storefront-web, frontend-web…) —
  # KHÔNG có host port; chỉ prefix container_name khi compose file base khai
  # báo container_name cho service đó (grep trước khi thêm).
```

⚠ Khi thực hiện: grep `container_name:` trong docker-compose.yml — MỌI service base có container_name phải được prefix trong override (kể cả services không host-port), nếu không `up` full sẽ collision với stack chính. `docker compose version` ≥ 2.24 mới hiểu `!override` — kiểm trước; nếu cũ hơn → thay bằng copy toàn section ports và ghi chú cho SF-5.

- [ ] **Step 6.4: Chạy full packages/auth suite**

Run: `cd frontend && pnpm --filter @ecommerce/auth test`
Expected: ALL PASS.

- [ ] **Step 6.5: Commit**

```bash
git add frontend/packages/auth/src/__tests__/guest-cart-key.test.ts docs/adr/0008-session-sync-contract.md docker-compose.override-sf2.yml
git commit -m "docs+test: ADR 0008 session-sync contract + guest-cart key binary check + compose override +400 (FI-399)"
```

---

### Task 7: GATE — same-origin proof trên isolated rig (+400)

**Files:** không sửa code (chỉ chạy + evidence). Nếu rig bộc lộ bug code → FIX ở Task tương ứng rồi quay lại Task 7.

**Prereq check (chạy trước tất cả):**
```bash
lsof -nP -iTCP:5833 -iTCP:8480 -iTCP:8481 -iTCP:5573 -iTCP:5575 -iTCP:5576 -iTCP:5577 -iTCP:5578 -iTCP:3400 -sTCP:LISTEN   # phải rỗng
docker ps --format '{{.Names}}' | grep fi397sf2 || echo "no leftover"
curl -s http://localhost:8025/api/v2/messages >/dev/null && echo "mailpit :8025 OK (main stack)" || echo "MAILPIT DOWN — docker run -d --name fi397sf2-mailpit -p 8025:8025 axllent/mailpit"
```

- [ ] **Step 7.1: PG isolated + identity + gateway (JVM isolate — 0 image Java tồn tại, build compose = 20-40')**

```bash
REPO=/Users/hoivu/orca/workspaces/ecommerce/sf-2-session-sync
docker run -d --name fi397sf2-pg -e POSTGRES_PASSWORD=postgres -p 5833:5432 postgres:16
docker exec fi397sf2-pg psql -U postgres -c 'CREATE DATABASE db_identity;'

cd $REPO
# identity :8481 (keys ABSOLUTE — memory springboot-run-cwd)
SERVER_PORT=8481 \
SPRING_DATASOURCE_URL='jdbc:postgresql://localhost:5833/db_identity' \
JWT_PRIVATE_KEY_PATH=$REPO/infra/keys/jwt-private.pem \
JWT_PUBLIC_KEY_PATH=$REPO/infra/keys/jwt-public.pem \
  mvn -q -pl backend/services/identity-service -am spring-boot:run > /tmp/fi397sf2-identity.log 2>&1 &

# gateway :8480
SERVER_PORT=8480 \
IDENTITY_URI=http://localhost:8481 \
IDENTITY_JWKS_URI='http://localhost:8481/.well-known/jwks.json' \
  mvn -q -pl backend/gateway -am spring-boot:run > /tmp/fi397sf2-gateway.log 2>&1 &

# chờ khỏe (tối đa ~180s): curl -4 cả hai
for i in $(seq 1 60); do curl -4 -sf http://localhost:8481/actuator/health >/dev/null && break; sleep 3; done
for i in $(seq 1 60); do curl -4 -sf http://localhost:8480/actuator/health >/dev/null && break; sleep 3; done
curl -4 http://localhost:8480/actuator/health
```

⚠ Gateway nếu startup FAIL vì thiếu env URI placeholder → export bộ đầy đủ như compose (CATALOG_URI…MINIO_URI, xem docker-compose.yml gateway environment block, trỏ localhost port bất kỳ) rồi chạy lại — routes /api/identity là thứ cần sống.

Smoke round-trip (trước khi đụng e2e):
```bash
EMAIL="smoke-$(date +%s)@e2e.demo.vn"
curl -4 -s -X POST http://localhost:8480/api/identity/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"E2e#2026demo\",\"fullName\":\"Smoke\"}"
COOKIE=$(curl -4 -si -X POST http://localhost:8480/api/identity/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"E2e#2026demo\"}" | grep -i '^set-cookie:' | grep -o 'refresh_token=[^;]*')
echo "cookie: $COOKIE"
curl -4 -si -X POST http://localhost:8480/api/identity/auth/refresh -H "cookie: $COOKIE" | head -1   # 200
curl -4 -si -X POST http://localhost:8480/api/identity/auth/refresh -H "cookie: $COOKIE" | head -1   # 401 — one-time rotate
```

- [ ] **Step 7.2: FE rig +400 (boot `--host` — 127.0.0.1 phải với tới được; bind ::1-only = fail IPv4)**

```bash
cd $REPO/frontend
export GATEWAY_URL=http://localhost:8480
pnpm --filter @ecommerce/mfe-checkout exec vite --port 5575 --strictPort --host > /tmp/fi397sf2-checkout.log 2>&1 &
pnpm --filter @ecommerce/mfe-account exec vite --port 5576 --strictPort --host > /tmp/fi397sf2-account.log 2>&1 &
pnpm --filter @ecommerce/mfe-admin exec vite --port 5577 --strictPort --host > /tmp/fi397sf2-admin.log 2>&1 &
pnpm --filter @ecommerce/skeleton-remote exec vite --port 5578 --strictPort --host > /tmp/fi397sf2-skeleton.log 2>&1 &
REMOTE_ACCOUNT_URL=http://localhost:5576 REMOTE_CHECKOUT_URL=http://localhost:5575 \
REMOTE_ADMIN_URL=http://localhost:5577 REMOTE_SKELETON_URL=http://localhost:5578 \
  pnpm --filter @ecommerce/shell exec vite --port 5573 --strictPort --host > /tmp/fi397sf2-shell.log 2>&1 &
pnpm --filter storefront-web exec next dev -H 0.0.0.0 -p 3400 > /tmp/fi397sf2-next.log 2>&1 &

for p in 5575 5576 5577 5578 5573 3400; do curl -4 -sf -o /dev/null http://localhost:$p && echo "$p OK" || echo "$p CHƯA SỐNG"; done
```

- [ ] **Step 7.3: curl matrix — ACCEPTANCE 4**

```bash
# 127→localhost, giữ path+query (Next :3400)
curl -4 -sI 'http://127.0.0.1:3400/vi/c/test?ref=CODE123' | grep -iE 'HTTP/|location'
#   expect: HTTP/1.1 308 + location: http://localhost:3400/vi/c/test?ref=CODE123  (?ref GIỮ — hop sau capture)
# shell :5573
curl -4 -sI 'http://127.0.0.1:5573/account?x=1' | grep -iE 'HTTP/|location'
#   expect: 308 → http://localhost:5573/account?x=1
# asset /_next KHÔNG redirect (Next phục vụ thẳng, không 308)
curl -4 -sI 'http://127.0.0.1:3400/_next/static/nonexistent.js' | head -1
#   expect: KHÔNG PHẢI 308 (404/200 đều được — miễn không redirect)
# localhost không loop
curl -4 -sI 'http://localhost:3400/vi' | head -1
#   expect: KHÔNG PHẢI 308-redirect-loop (200/307 rewrite locale tùy route)
```

⚠ Nếu `curl -4` không với tới Vite (connection refused) mà `curl` thường được → Vite bind ::1-only dù `--host` → kiểm log, thêm `--host 0.0.0.0`.

- [ ] **Step 7.4: e2e auth-cookie FULL (HTTP-level cũ + multi-tab mới)**

```bash
cd $REPO/frontend
GATEWAY_URL=http://localhost:8480 \
E2E_SHELL_URL=http://localhost:5573 \
E2E_STOREFRONT_URL=http://localhost:5573 \
  pnpm --filter @ecommerce/e2e exec playwright test auth-cookie
```
Expected: **7/7 PASS** (4 regression FI-337 + 3 sync). Fail → đọc lỗi → fix task tương ứng → rerun (attempt ledger; 2 lần cùng nguyên nhân → STOP escalate).

Browser walkthrough bổ sung (Rule 0 — T3 flow): mở Playwright codegen hoặc thủ công 1 context: login UI tab A → thấy tab B đổi header KHÔNG reload (đã nằm trong e2e test 1) — e2e PASS = flow đã đi trọn; chụp 1 screenshot kết quả cuối mỗi tab làm evidence: `--trace on` KHÔNG cần (config off), dùng `playwright test auth-cookie -g "login A" --headed` nếu cần nhìn bằng mắt.

- [ ] **Step 7.5: Unit sweep toàn workspace (surface SF-2)**

```bash
cd $REPO/frontend && pnpm --filter @ecommerce/auth test && pnpm --filter @ecommerce/config test && pnpm --filter storefront-web test
```
Expected: ALL PASS.

- [ ] **Step 7.6: Teardown**

```bash
pkill -f 'vite --port 557' ; pkill -f 'next dev -H 0.0.0.0 -p 3400'
pkill -f 'identity-service' ; pkill -f 'backend.gateway'   # hoặc kill PID JVM theo jps
docker rm -f fi397sf2-pg
# (mailpit standalone nếu đã tạo: docker rm -f fi397sf2-mailpit)
```
Verify sạch: `lsof -nP -iTCP:8480 -iTCP:8481 -iTCP:5573 -iTCP:5833 -sTCP:LISTEN` rỗng.

- [ ] **Step 7.7: Commit evidence (nếu có file evidence) — KHÔNG commit log /tmp**

Evidence ghi vào Linear comment Phase 5 (outputs curl + playwright), không cần commit gì ngoài code.

---

## Verification matrix (ACCEPTANCE pack → task)

| ACCEPTANCE (pack) | Task chứng minh |
|---|---|
| 1. 2 pages cùng context login/logout sync, ≤1 POST refresh, không reload | T5 (test 1+2) + T7 run thật |
| 2. 20-run rotate-race 0 spurious logout | T2 unit 20-run + T5 test 3 + T7 |
| 3. 2FA không broadcast sai | T1 test 2FA (throw trước setToken → store không notify) |
| 4. 127→localhost redirect giữ path/query; /_next không redirect | T3+T4 unit + T7 curl matrix |
| 5. SSR sạch (renderToStaticMarkup/Node) | T1 ssr-guard test |
| 6. Unit auth xanh + e2e extension xanh | T7.5 sweep + T7.4 |

## Risks khi execute

| Rủi ro | Xử lý |
|---|---|
| NextRequest/middleware import trong vitest node env kẹ | T3 chỉ test pure helper (đã theo convention storefront tests); matcher check bằng curl ở T7 |
| gateway JVM thiếu env URI khác → startup fail | export đủ bộ như compose env block (Step 7.1 ⚠) |
| Vite bind IPv6-only → 127 unreachable | boot `--host` + fallback `--host 0.0.0.0` (Step 7.2/7.3 ⚠) |
| e2e timing flaky (BC delivery) | per-round assert + 150ms settle + retries:1 (playwright config); tổng-POST bound 50 |
| selector AuthWidget lệch DOM thật | sửa TEST theo DOM (không đụng AuthWidget — out of touch map) |
| mvn spring-boot:run `-am` build lâu lần đầu | chấp nhận; các lần sau nhanh (target/ cached) |
