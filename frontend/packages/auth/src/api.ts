// api.ts — API auth user-facing: login/register(auto-login)/logout/updateProfile.
// Client dựng TỪ authStore config; fetchImpl = authStore.fetch để 401 →
// single-flight refresh → retry (ACCEPTANCE 2 — executeRequest không tự refresh).

import { authStore, type AuthUser } from './AuthStore';
import {
  createIdentityClient,
  executeRequest,
  type ApiClientOptions,
  type IdentityClient
} from '@ecommerce/contracts';

export interface CredentialsInput {
  email: string;
  password: string;
}

export interface RegisterInput extends CredentialsInput {
  fullName: string;
}

export interface ProfileInput {
  fullName?: string;
  phone?: string | null;
}

export interface MeProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  roles: string[];
  twoFactorEnabled: boolean;
}

function clientOptions(): ApiClientOptions {
  const config = authStore.getConfig();
  return {
    baseURL: config.identityBaseUrl ?? '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

// KHÔNG cache client: config (fetchImpl stub trong test) đổi qua configureAuth —
// dựng per-call (object rẻ). Cache sẽ bám stale fetchImpl của test đầu tiên.
function identity(): IdentityClient {
  return createIdentityClient(clientOptions());
}

function toAuthUser(): AuthUser {
  const user = authStore.getUser();
  if (!user) throw new Error('[auth] setToken xong nhưng không decode được user từ token');
  return user;
}

/** POST login → accessToken vào store. twoFactorRequired → throw (2FA là SF-15). */
export async function login({ email, password }: CredentialsInput): Promise<AuthUser> {
  const res = await identity().login({ email: email.trim().toLowerCase(), password });
  if ('twoFactorRequired' in res && (res as { twoFactorRequired?: boolean }).twoFactorRequired) {
    throw new Error('Đăng nhập hai lớp (2FA) chưa được hỗ trợ trong phiên bản này');
  }
  const success = res as { accessToken: string; user: { id: string; email: string; fullName: string; roles: string[] } };
  authStore.setToken(success.accessToken);
  return toAuthUser();
}

/** Đăng ký 201 → auto-login (gọi login với cùng credentials). */
export async function register({ email, password, fullName }: RegisterInput): Promise<AuthUser> {
  await identity().register({ email: email.trim().toLowerCase(), password, fullName: fullName.trim() });
  return login({ email, password });
}

/** POST logout (xóa refresh cookie server-side) + xóa state cục bộ. */
export async function logout(): Promise<void> {
  try {
    await identity().logout({});
  } catch {
    // API fail (401/mạng) không chặn logout — user LUÔN về guest cục bộ.
  } finally {
    authStore.logout();
  }
}

/** PATCH /api/identity/me — GAP endpoint (REQUIREMENT-GAP FI-310, chưa có trong generated client). */
export async function updateProfile(input: ProfileInput): Promise<MeProfile> {
  // PATCH chưa có trong generated client (GAP FI-310) → executeRequest với RouteDef local.
  return executeRequest(clientOptions(), ['PATCH', '/api/identity/me'], { ...input }) as Promise<MeProfile>;
}

/** GET /api/identity/me — prefill trang /account (dùng getMe của generated client). */
export async function fetchProfile(): Promise<MeProfile> {
  return identity().getMe({}) as Promise<MeProfile>;
}
