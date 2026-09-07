#!/usr/bin/env node
// Mock OAuth2 provider (SF-15 dev tool) — thay Google/Facebook khi browser-verify
// flow login social mà không cần key thật. Đủ 3 endpoint của authorization-code flow:
//   GET /authorize  → 302 redirect_uri kèm code + state (login form tối giản)
//   POST /token     → {access_token}
//   GET /userinfo   → profile (email trong access_token: "at_<base64url(json)>")
// Dùng: node infra/dev/mock-oauth-provider.mjs [--port 9099]
// Wire identity-service: OAUTH_GOOGLE_CLIENT_ID=mock OAUTH_GOOGLE_CLIENT_SECRET=mock
//   OAUTH_GOOGLE_AUTHORIZE_URI=http://localhost:9099/authorize
//   OAUTH_GOOGLE_TOKEN_URI=http://localhost:9099/token
//   OAUTH_GOOGLE_USERINFO_URI=http://localhost:9099/userinfo
// (redirect_uri phải khớp IDENTITY_OAUTH_PUBLIC_BASE_URL=http://localhost:8080)
import http from 'node:http';
import { URL } from 'node:url';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 9099);
// Email đăng ký dùng cho lần verify — đổi qua ?email= trên authorize (form điền).
const DEFAULT_EMAIL = 'google-user@demo.vn';

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url').toString('utf8');
const codes = new Map(); // code → email

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/authorize' && req.method === 'GET') {
    // Mini consent: nhập email → submit (GET /consent) → 302 callback kèm code.
    const redirect = url.searchParams.get('redirect_uri') || '';
    const state = url.searchParams.get('state') || '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="vi"><body style="font-family:sans-serif;max-width:420px;margin:60px auto">
<h2>Mock Google sign-in</h2>
<form method="get" action="/consent">
  <input type="hidden" name="redirect_uri" value="${redirect}">
  <input type="hidden" name="state" value="${state}">
  <label>Email đăng nhập<br><input name="email" style="width:100%" value="${DEFAULT_EMAIL}"></label><br><br>
  <label>Tên hiển thị<br><input name="name" style="width:100%" value="Google User"></label><br><br>
  <button type="submit" style="padding:8px 24px">Đăng nhập</button>
</form></body></html>`);
    return;
  }
  if (url.pathname === '/consent' && req.method === 'GET') {
    const code = 'mc_' + Math.random().toString(36).slice(2);
    codes.set(code, { email: url.searchParams.get('email') || DEFAULT_EMAIL, name: url.searchParams.get('name') || 'Google User' });
    const back = new URL(url.searchParams.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', url.searchParams.get('state') || '');
    res.writeHead(302, { Location: back.toString() });
    res.end();
    return;
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const profile = codes.get(params.get('code')) || { email: DEFAULT_EMAIL, name: 'Google User' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'at_' + b64u(JSON.stringify(profile)), token_type: 'Bearer', expires_in: 3600 }));
    });
    return;
  }
  if (url.pathname === '/userinfo' && req.method === 'GET') {
    const at = (url.searchParams.get('access_token') || req.headers.authorization?.replace('Bearer ', '') || '');
    let profile = { email: DEFAULT_EMAIL, name: 'Google User' };
    try { if (at.startsWith('at_')) profile = JSON.parse(unb64u(at.slice(3))); } catch { /* default */ }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sub: 'mock-google-' + b64u(profile.email).slice(0, 12), email: profile.email, email_verified: true, name: profile.name }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, () => console.log(`[mock-oauth-provider] http://localhost:${port}/authorize`));
