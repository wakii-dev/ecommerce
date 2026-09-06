import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/identitySchema';

const routes = {
  register: ['POST', '/api/identity/auth/register'],
  login: ['POST', '/api/identity/auth/login'],
  refresh: ['POST', '/api/identity/auth/refresh'],
  logout: ['POST', '/api/identity/auth/logout'],
  getMe: ['GET', '/api/identity/me'],
  getJwks: ['GET', '/api/identity/.well-known/jwks.json'],
  adminListUsers: ['GET', '/api/identity/admin/users'],
  forgotPassword: ['POST', '/api/identity/password/forgot'],
  resetPassword: ['POST', '/api/identity/password/reset'],
  oauthAuthorize: ['GET', '/api/identity/oauth/{provider}/authorize'],
  oauthCallback: ['GET', '/api/identity/oauth/{provider}/callback'],
  setup2fa: ['POST', '/api/identity/2fa/setup'],
  enable2fa: ['POST', '/api/identity/2fa/enable'],
  disable2fa: ['POST', '/api/identity/2fa/disable'],
  verify2fa: ['POST', '/api/identity/2fa/verify'],
} as const satisfies RouteMap;

export type IdentityClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createIdentityClient(opts: ApiClientOptions): IdentityClient {
  return createServiceClient<IdentityClient>(opts, routes);
}
