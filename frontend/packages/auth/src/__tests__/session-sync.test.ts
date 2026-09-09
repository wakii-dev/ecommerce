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
  // `seen` = message do CHÍNH tab này broadcast ra ngoài (spy trên bus của sync),
  // KHÔNG phải mọi message trên hub: emitter của test cũng là 1 member trên hub
  // và BroadcastChannel thật không loopback về người gửi — watcher thô sẽ bắt
  // nhầm message của emitter vào `seen`, khiến assertion "KHÔNG re-broadcast"
  // không thể pass dù implementation đúng.
  const seen: SyncMessage[] = [];
  const syncBus = hub.connect();
  const hubPost = syncBus.post.bind(syncBus);
  syncBus.post = (message: SyncMessage) => {
    seen.push(message);
    hubPost(message);
  };
  const sync = createSessionSync(store, { bus: syncBus });
  sync.start();
  return { store, sync, seen };
}

beforeEach(() => {
  authStore.setToken(null);
  authStore.configureAuth({ refreshUrl: REFRESH_URL, fetchImpl: undefined });
});

afterEach(() => {
  vi.restoreAllMocks();
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
      await expect(login({ email: 'a@b.c', password: 'password123' })).rejects.toThrow(/2FA|hai lớp/);
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

    // refreshCalls tăng ĐỒNG BỘ trong fetch mock, nhưng res.json()→setToken là
    // async (stream undici) — gộp assertion authed vào waitFor để không race.
    await vi.waitFor(() => {
      expect(refreshCalls).toBe(1);
      expect(store.isAuthenticated()).toBe(true);
    });
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
    const bus = createStorageFallbackBus(storage as unknown as Storage, (fn) => {
      handlers.add(fn);
      return () => handlers.delete(fn);
    });
    const received: SyncMessage[] = [];
    bus.subscribe((m) => received.push(m));

    bus.post({ type: AUTH_CHANGED });
    expect(written).toHaveLength(1);
    const first = JSON.parse(written[0]!);
    expect(first.v).toBe(1);
    bus.post({ type: AUTH_CHANGED });
    const second = JSON.parse(written[1]!);
    expect(second.n, 'nonce KHÁC lần trước (storage event cần value đổi để fire)').not.toBe(first.n);

    // tab khác ghi sentinel đúng key → nhận auth-changed
    for (const fn of handlers) fn({ key: SENTINEL_KEY, newValue: written[0] ?? null });
    expect(received).toEqual([{ type: AUTH_CHANGED }]);
    // key lạ / value rác → bỏ qua
    for (const fn of handlers) fn({ key: 'other-key', newValue: written[0] ?? null });
    for (const fn of handlers) fn({ key: SENTINEL_KEY, newValue: 'garbage' });
    for (const fn of handlers) fn({ key: SENTINEL_KEY, newValue: null });
    expect(received).toHaveLength(1);
  });

  it('sentinel v1 bare (không type — bản cũ) → auth-changed; type lạ trong sentinel → BỎ (P0 whitelist)', () => {
    const handlers = new Set<(e: { key: string | null; newValue: string | null }) => void>();
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const bus = createStorageFallbackBus(storage as unknown as Storage, (fn) => {
      handlers.add(fn);
      return () => handlers.delete(fn);
    });
    const received: SyncMessage[] = [];
    bus.subscribe((m) => received.push(m));

    for (const fn of handlers) fn({ key: SENTINEL_KEY, newValue: JSON.stringify({ v: 1, t: 1, n: 'bare' }) });
    expect(received, 'v1 bare (không type) = bản cũ → auth-changed (backwards-compat)').toEqual([{ type: AUTH_CHANGED }]);
    for (const fn of handlers) fn({ key: SENTINEL_KEY, newValue: JSON.stringify({ v: 1, t: 2, n: 'x', type: 'weird-type' }) });
    expect(received, 'type ngoài whitelist → BỎ — không biến thành auth-changed').toHaveLength(1);
  });
});

/**
 * localStorage giả chia sẻ N tab: setItem ở tab A fire storage event ở CÁC TAB
 * KHÁC (không loopback — giống storage thật). Mỗi tab connect() nhận 1 view
 * (storage + listen) để nhá vào createStorageFallbackBus.
 */
class SharedStorageHub {
  private handlers = new Map<object, Set<(e: { key: string | null; newValue: string | null }) => void>>();
  private value = '';
  connect(): {
    storage: Storage;
    listen: (fn: (e: { key: string | null; newValue: string | null }) => void) => () => void;
  } {
    const tag = {};
    const handlers = new Set<(e: { key: string | null; newValue: string | null }) => void>();
    this.handlers.set(tag, handlers);
    const hub = this;
    const storage = {
      getItem: () => hub.value,
      setItem: (_k: string, v: string) => {
        hub.value = v;
        for (const [t, fns] of hub.handlers) {
          if (t === tag) continue; // storage event KHÔNG fire ở tab ghi
          for (const fn of fns) fn({ key: SENTINEL_KEY, newValue: v });
        }
      },
      removeItem: () => {}
    };
    return {
      storage: storage as unknown as Storage,
      listen: (fn) => {
        handlers.add(fn);
        return () => {
          handlers.delete(fn);
        };
      }
    };
  }
}

describe('session-sync — storage fallback P0 storm regression (FI-399 review)', () => {
  it('1 login flip qua storage bus (không locks) → refresh count HỮU HẠN cả 2 tab (không exponential storm)', async () => {
    const hub = new SharedStorageHub();
    const mkTab = () => {
      const view = hub.connect();
      const store = new AuthStore();
      let refreshCalls = 0;
      store.configureAuth({
        refreshUrl: REFRESH_URL,
        fetchImpl: vi.fn(async (): Promise<Response> => {
          refreshCalls += 1;
          return jsonResponse({ accessToken: makeJwt('storm') });
        })
      });
      const bus = createStorageFallbackBus(view.storage, view.listen);
      const sync = createSessionSync(store, { bus, locks: null, backoffMs: 5, jitterRange: [0, 0] });
      sync.start();
      return { store, calls: () => refreshCalls };
    };
    const a = mkTab();
    const b = mkTab();

    a.store.setToken(makeJwt('u1')); // 1 login flip → sentinel ra tab B

    // Handler cũ: mỗi handshake (start/done) tới receiver như auth-changed →
    // refresh → post handshake tiếp → exponential storm (700K/800ms) — 100ms
    // settle đủ để storm nổ nếu có. Handler mới: bounded.
    await new Promise((r) => setTimeout(r, 100));
    expect(a.calls(), 'tab A — refresh count bounded').toBeLessThanOrEqual(5);
    expect(b.calls(), 'tab B — refresh count bounded').toBeLessThanOrEqual(5);
    expect(b.store.isAuthenticated(), 'tab B vẫn nhận được login (sync hoạt động)').toBe(true);
  });

  it('REFRESH_START/DONE + type lạ post qua storage bus → KHÔNG trigger refresh ở receiver', async () => {
    const hub = new SharedStorageHub();
    const emitterView = hub.connect();
    const emitterBus = createStorageFallbackBus(emitterView.storage, emitterView.listen);
    const view = hub.connect();
    const store = new AuthStore();
    let refreshCalls = 0;
    store.configureAuth({
      refreshUrl: REFRESH_URL,
      fetchImpl: vi.fn(async (): Promise<Response> => {
        refreshCalls += 1;
        return jsonResponse({ accessToken: makeJwt('u9') });
      })
    });
    const bus = createStorageFallbackBus(view.storage, view.listen);
    const sync = createSessionSync(store, { bus, locks: null, backoffMs: 5, jitterRange: [0, 0] });
    sync.start();

    emitterBus.post({ type: REFRESH_START }); // handshake — bus cũ biến thành auth-changed → storm
    emitterBus.post({ type: REFRESH_DONE });
    emitterBus.post({ type: 'totally-unknown' });
    await new Promise((r) => setTimeout(r, 30));
    expect(refreshCalls, 'handshake/type lạ qua storage bus KHÔNG refresh').toBe(0);
    expect(store.isAuthenticated()).toBe(false);
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
