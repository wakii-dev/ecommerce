// AuthStore — singleton auth state dùng chung toàn frontend (MF shared
// singleton ở SF-3+). AccessToken CHỈ sống in-memory (không localStorage —
// XSS không đọc được token). Refresh dựa vào cookie httpOnly do identity
// service set — client không bao giờ chạm refresh token.

import { createSessionSync, type SessionSyncHandle } from './session-sync';

export interface AuthUser {
  id: string;
  email?: string;
  fullName?: string;
  roles: string[];
}

export interface AuthConfig {
  /** Endpoint refresh (vd `/api/identity/auth/refresh`). KHÔNG có default — bắt buộc configureAuth. */
  refreshUrl: string;
  /** Route đăng nhập cho app-layer redirect sau logout/401 cuối (thông tin, store không tự điều hướng). */
  loginPath?: string;
  /** Origin của API gateway — rỗng/không set = same-origin (Vite proxy). */
  identityBaseUrl?: string;
  /** Inject fetch cho test / SSR client riêng. Mặc định global fetch. */
  fetchImpl?: typeof fetch;
  /** Timeout 1 POST refresh (ms) — default 10s. Fetch treo không được giữ cross-tab lock. */
  fetchTimeoutMs?: number;
}

type AuthListener = () => void;

/**
 * Decode phần payload của JWT (base64url) thành object. KHÔNG verify chữ ký —
 * RS256 verify là việc backend qua JWKS (`/api/identity/.well-known/jwks.json`).
 * Trả null với token sai format.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toUser(payload: Record<string, unknown>): AuthUser | null {
  const id =
    typeof payload.sub === 'string'
      ? payload.sub
      : typeof payload.userId === 'string'
        ? payload.userId
        : null;
  if (!id) return null;
  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((r): r is string => typeof r === 'string')
    : [];
  const user: AuthUser = { id, roles };
  if (typeof payload.email === 'string') user.email = payload.email;
  if (typeof payload.fullName === 'string') user.fullName = payload.fullName;
  return user;
}

export class AuthStore {
  private accessToken: string | null = null;
  private user: AuthUser | null = null;
  private config: AuthConfig = { refreshUrl: '' };
  private listeners = new Set<AuthListener>();
  /** Single-flight refresh — nhiều 401 đồng thời chia sẻ ĐÚNG 1 promise này. */
  private refreshPromise: Promise<boolean> | null = null;

  configureAuth(config: Partial<AuthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private get doFetch(): typeof fetch {
    return this.config.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  setToken(token: string | null): void {
    this.accessToken = token;
    this.user = token ? this.extractUser(token) : null;
    this.notify();
  }

  private extractUser(token: string): AuthUser | null {
    const payload = decodeJwtPayload(token);
    return payload ? toUser(payload) : null;
  }

  getToken(): string | null {
    return this.accessToken;
  }

  getUser(): AuthUser | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  getLoginPath(): string | undefined {
    return this.config.loginPath;
  }

  /** Đọc config (api.ts dựng client từ đây) — readonly để caller không mutate. */
  getConfig(): Readonly<AuthConfig> {
    return this.config;
  }

  /** true nếu user có ÍT NHẤT 1 trong các role truyền vào. */
  hasRole(...wanted: string[]): boolean {
    const user = this.user;
    if (!user || wanted.length === 0) return false;
    return wanted.some((role) => user.roles.includes(role));
  }

  /** Đăng ký listener UI; trả hàm unsubscribe. */
  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * POST refreshUrl với refresh cookie httpOnly (`credentials: 'include'`).
   * Thành công → set token mới + notify. Thất bại (HTTP lỗi / mạng lỗi /
   * body sai) → logout + notify, trả false. Không đi qua queue — tránh đệ quy.
   */
  async refresh(): Promise<boolean> {
    if (!this.config.refreshUrl) {
      throw new Error('[auth] refreshUrl chưa cấu hình — gọi configureAuth({refreshUrl}) trước');
    }
    try {
      const res = await this.doFetch(this.config.refreshUrl, {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(this.config.fetchTimeoutMs ?? 10_000)
      });
      if (!res.ok) {
        this.logout();
        return false;
      }
      const data = (await res.json()) as { accessToken?: unknown };
      if (typeof data.accessToken !== 'string') {
        this.logout();
        return false;
      }
      this.setToken(data.accessToken);
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  private ensureRefreshed(): Promise<boolean> {
    this.refreshPromise ??= this.refresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  /**
   * Fetch wrapper có auth: gắn `Authorization: Bearer` khi có token; gặp 401
   * → chờ ĐÚNG 1 refresh chung (single-flight) → retry đúng 1 lần. Refresh
   * fail → trả response 401 gốc (store đã logout).
   *
   * Lưu ý SSR/node: fetch mặc định cần URL tuyệt đối — inject qua
   * `configureAuth({fetchImpl})` nếu chạy ngoài browser.
   */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await this.doFetch(input, this.authorizedInit(init));
    if (res.status !== 401) return res;
    const refreshed = await this.ensureRefreshed();
    if (!refreshed) return res;
    return this.doFetch(input, this.authorizedInit(init));
  }

  private authorizedInit(init?: RequestInit): RequestInit {
    if (!this.accessToken) return init ?? {};
    const headers = new Headers(init?.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    return { ...init, headers };
  }

  /**
   * Xóa state cục bộ + notify listeners. (Clear refresh cookie phía server là
   * việc app-layer gọi `POST /api/identity/auth/logout` — store không tự gọi
   * mạng trong logout để tránh side-effect khi refresh fail.)
   */
  logout(): void {
    const hadState = this.accessToken !== null || this.user !== null;
    this.accessToken = null;
    this.user = null;
    if (hadState) this.notify();
  }
}

export const authStore = new AuthStore();

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
