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
  // Defensive: bus DI/test có thể đưa message lạ (null/sai shape) — bỏ qua,
  // KHÔNG crash (createProductionBus lọc isSyncMessage trước, đường khác thì ở đây).
  if (!isSyncMessage(message)) return;
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
      wrapRefresh(ctx);
    },
    stop() {
      if (!ctx.started) return;
      ctx.started = false;
      unwrapRefresh(ctx); // trả prototype refresh TRƯỚC khi gỡ listener
      ctx.unsubBus?.();
      ctx.unsubBus = null;
      ctx.unsubTransition?.();
      ctx.unsubTransition = null;
      ctx.bus = null;
    }
  };
}

// ---------------------------------------------------------------------------
// Cross-tab refresh coordination (FI-399, spec §2.3):
// - Web Locks serialize mọi refresh (POST tuần tự → không replay cookie cũ).
// - Fallback (không navigator.locks): BC handshake refresh-start/done + jitter.
// - 401 retry ĐÚNG 1 lần, BÊN TRONG lock, CHỈ khi có bằng chứng rotate có thể
//   xảy ra lúc mình chờ (fallback mode HOẶC locks.query() thấy holder khác).
//   Không contender + không fallback → cookie thật chết → logout NGAY (1 POST).
// ---------------------------------------------------------------------------

type RefreshFn = () => Promise<boolean>;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
      return refreshWithConditionalRetry(ctx, { fallback: true, contender: true });
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
