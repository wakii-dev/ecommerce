// mfe-account/src/api.ts — challenge-aware login + oauth/2fa helpers (SF-15).
// login() KHÔNG dùng bản packages/auth (bản đó throw khi twoFactorRequired —
// "2FA là SF-15"): bản local trả discriminated result, token chỉ set khi 'ok'.
import { authStore } from '@ecommerce/auth';
import { createIdentityClient, executeRequest, type ApiClientOptions } from '@ecommerce/contracts';
import type { CredentialsInput } from '@ecommerce/auth';

export { register, logout, updateProfile, fetchProfile } from '@ecommerce/auth';
export type { RegisterInput, ProfileInput, MeProfile } from '@ecommerce/auth';

function clientOptions(): ApiClientOptions {
  const config = authStore.getConfig();
  return {
    baseURL: config.identityBaseUrl ?? '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

// KHÔNG cache client — pattern packages/auth: config đổi qua configureAuth,
// dựng per-call (object rẻ) để không bám stale fetchImpl của test đầu tiên.
function identity() {
  return createIdentityClient(clientOptions());
}

export type LoginResult = { kind: 'ok' } | { kind: 'challenge'; challengeToken: string };

/** POST login — 2FA bật → {kind:'challenge'} (FE chuyển trang nhập mã). */
export async function login({ email, password }: CredentialsInput): Promise<LoginResult> {
  const res = await identity().login({ email: email.trim().toLowerCase(), password });
  if ('twoFactorRequired' in res && (res as { twoFactorRequired?: boolean }).twoFactorRequired) {
    return { kind: 'challenge', challengeToken: (res as { challengeToken?: string }).challengeToken ?? '' };
  }
  authStore.setToken((res as { accessToken: string }).accessToken);
  return { kind: 'ok' };
}

/** Session storage challenge (trang /login/2fa đọc — shell router không pass state). */
export const TWOFA_CHALLENGE_KEY = 'ecommerce.2fa.challenge';

// ── 2FA (SF-15) — route local qua executeRequest (shape freeze contracts) ──
export async function setup2fa(): Promise<{ secret: string; otpauthUrl: string }> {
  return executeRequest(clientOptions(), ['POST', '/api/identity/2fa/setup'], {}) as Promise<{
    secret: string;
    otpauthUrl: string;
  }>;
}

export async function enable2fa(code: string): Promise<{ recoveryCodes: string[] }> {
  return executeRequest(clientOptions(), ['POST', '/api/identity/2fa/enable'], { code }) as Promise<{
    recoveryCodes: string[];
  }>;
}

export async function disable2fa(password: string, code: string): Promise<void> {
  await executeRequest(clientOptions(), ['POST', '/api/identity/2fa/disable'], { password, code });
}

/** Verify challenge → accessToken vào store (refresh cookie set kèm response). */
export async function verify2fa(challengeToken: string, code: string): Promise<void> {
  const res = (await executeRequest(
    clientOptions(),
    ['POST', '/api/identity/2fa/verify'],
    { challengeToken, code }
  )) as { accessToken: string };
  authStore.setToken(res.accessToken);
}

// ── OAuth (SF-15) — nút ẩn/hiện theo identity env (single source of truth) ──
export async function oauthProviders(): Promise<{ google: boolean; facebook: boolean }> {
  try {
    return (await executeRequest(clientOptions(), [
      'GET',
      '/api/identity/.well-known/oauth-providers'
    ], {})) as { google: boolean; facebook: boolean };
  } catch {
    return { google: false, facebook: false }; // endpoint chết → ẩn nút, không lỗi
  }
}

/** Đổi one-time code sau callback → accessToken vào store. */
export async function exchangeOauthCode(code: string): Promise<void> {
  const res = (await executeRequest(
    clientOptions(),
    ['POST', '/api/identity/oauth/exchange'],
    { code }
  )) as { accessToken: string };
  authStore.setToken(res.accessToken);
}
