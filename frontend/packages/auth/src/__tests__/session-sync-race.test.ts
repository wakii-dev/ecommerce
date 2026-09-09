import { describe, expect, it, vi } from 'vitest';
import { AuthStore, authStore } from '../AuthStore';
import { LOCK_NAME, createSessionSync } from '../session-sync';
// LockManager là DOM global type (lib.dom) — không import từ session-sync.

const REFRESH_URL = '/api/identity/auth/refresh';

/** 1 entry log cho mỗi POST refresh (giả lập server quan sát được). */
interface LogEntry {
  sent: string | null;
  stale: boolean;
  replay: boolean;
}

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
        // Delivery ASYNC (giống BC thật — không chạy trên call stack của post).
        // Sync delivery sẽ khiến handshake serialize cả race 2-tab (START của A
        // tới B trước khi B kịp check) → stale không bao giờ xảy ra → assertion
        // `log.some(stale)` chết. Async tái hiện message-crossing thật.
        for (const [t, fn] of members) if (t !== tag) setTimeout(() => fn(message), 0);
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
function makeRotatingFetch(jar: { cookie: string }, log: LogEntry[]) {
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
    // held mang ĐÚNG tên lock của mình — production code đo contender bằng
    // `held.some(l => l.name === LOCK_NAME)` (P2 FI-399 review).
    query: async () => ({ held: busy ? [{ name: LOCK_NAME, mode: 'exclusive' }] : [], pending: [] }),
    request: (_name: string, _opts: unknown, cb: () => Promise<unknown>) =>
      new Promise((resolve, reject) => {
        queue.push(() => {
          // Giống Web Locks thật: callback reject → promise của request REJECT
          // (không resolve-with-error) — coordination dựa phân biệt này (P1#3).
          Promise.resolve(cb()).then(resolve, reject).finally(() => {
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
  log: LogEntry[];
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
        const sent = opts.jar.cookie;
        await new Promise((r) => setTimeout(r, 0));
        // PHẢI đếm POST vào log (base() không chạy ở nhánh này) — các test
        // retry assert log length; stale=false để không nhiễu filter(stale).
        opts.log.push({ sent, stale: false, replay: false });
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
async function race(a: AuthStore, b: AuthStore): Promise<[boolean, boolean]> {
  return Promise.all([a.refresh(), b.refresh()]);
}

describe('rotate-race — 2 tab refresh đồng thời (P0 FI-399)', () => {
  it('Web Locks serialize: 20 chạy liên tiếp — 0 stale POST, 0 spurious logout', async () => {
    for (let round = 0; round < 20; round++) {
      const hub = new BroadcastHub();
      const jar = { cookie: `C0-r${round}` };
      const logA: LogEntry[] = [];
      const logB: LogEntry[] = [];
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
    const log: LogEntry[] = [];
    const a = makeTab(hub, { locks: null, jar, log }).store;
    const b = makeTab(hub, { locks: null, jar, log }).store;
    a.setToken(makeJwt('a'));
    b.setToken(makeJwt('b'));
    // setToken → broadcast AUTH_CHANGED → tab kia TỰ refresh (đúng luật receiver).
    // Các boot-refresh ẩn này phải XONG trước race (handshake fallback chỉ
    // best-effort — straggler ẩn fail-late sẽ logout SAU khi race thành công,
    // nhiễu assertion; không phải behavior đang test).
    await new Promise((r) => setTimeout(r, 60));

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
    const log: LogEntry[] = [];
    const { store } = makeTab(hub, { locks: null, jar, log, forcedFailures: 1 });
    store.setToken(makeJwt('u1'));

    await expect(store.refresh()).resolves.toBe(true);
    expect(log).toHaveLength(2);
    expect(store.isAuthenticated()).toBe(true);
  });

  it('fallback mode + 401 cả 2 lần → logout (retry CHỈ 1 lần, đúng 2 POST)', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: LogEntry[] = [];
    const { store } = makeTab(hub, { locks: null, jar, log, forcedFailures: 5 });
    store.setToken(makeJwt('u1'));

    await expect(store.refresh()).resolves.toBe(false);
    expect(log, 'retry ĐÚNG 1 lần — không đệ quy').toHaveLength(2);
    expect(store.isAuthenticated()).toBe(false);
  });

  it('locks mode + KHÔNG contender + 401 → logout NGAY sau ĐÚNG 1 POST (cookie thật chết)', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: LogEntry[] = [];
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
    const log: LogEntry[] = [];
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
    const log: LogEntry[] = [];
    const locks = makeLockManagerMock();
    const { store } = makeTab(hub, { locks, jar, log, forcedFailures: 5 });

    const t0 = Date.now();
    await expect(store.refresh()).resolves.toBe(false);
    expect(Date.now() - t0, 'không contender → KHÔNG chờ backoff 400ms').toBeLessThan(200);
    expect(log).toHaveLength(1);
    expect(store.isAuthenticated()).toBe(false);
  });

  it('fallback mode + network error (fetch throw) → ĐÚNG 1 POST, KHÔNG retry — chỉ 401 mới retry (P1#2 review)', async () => {
    const hub = new BroadcastHub();
    const store = new AuthStore();
    let posts = 0;
    store.configureAuth({
      refreshUrl: REFRESH_URL,
      fetchImpl: vi.fn(async (): Promise<Response> => {
        posts += 1;
        throw new TypeError('fetch failed'); // network error — KHÔNG phải 401
      })
    });
    const sync = createSessionSync(store, {
      bus: hub.connect(),
      locks: null, // fallback mode — flag cho phép retry, nhưng kind ≠ '401'
      backoffMs: 5,
      jitterRange: [0, 0]
    });
    sync.start();
    store.setToken(makeJwt('u1'));

    await expect(store.refresh()).resolves.toBe(false);
    expect(posts, 'network error → logout nguyên trạng ở attempt 1, KHÔNG POST lần 2').toBe(1);
    expect(store.getLastRefreshFailure(), 'kind được đo = other (không phải 401)').toBe('other');
    expect(store.isAuthenticated()).toBe(false);
  });
});

describe('locks callback throw vs acquisition error (P1#3 FI-399 review)', () => {
  it('callback throw (refreshUrl misconfig) → rethrow NGUYÊN, KHÔNG chạy lại unlocked (đúng 1 attempt)', async () => {
    const hub = new BroadcastHub();
    const locks = makeLockManagerMock();
    const store = new AuthStore(); // KHÔNG configureAuth → refresh() throw refreshUrl
    const spy = vi.spyOn(AuthStore.prototype, 'refresh');
    try {
      const sync = createSessionSync(store, { bus: hub.connect(), locks, backoffMs: 5, jitterRange: [0, 0] });
      sync.start();
      await expect(store.refresh()).rejects.toThrow(/refreshUrl/);
      expect(spy, 'callback throw → rethrow — không fallback rerun (attempt thứ 2)').toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('refresh coordination — đơn tab vẫn đi qua lock', () => {
  it('refresh thành công qua lock → token mới + listener notify', async () => {
    const hub = new BroadcastHub();
    const jar = { cookie: 'C0' };
    const log: LogEntry[] = [];
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
