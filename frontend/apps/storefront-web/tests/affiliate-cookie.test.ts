import { describe, expect, it } from 'vitest';

import {
  nextAffiliateCookieAction,
  parseAffiliateSetCookie,
  type CaptureResult,
} from '../lib/affiliate-cookie';

/**
 * Unit SF-12 (review P1-2): logic cookie attribution ?ref ở middleware —
 * parse Set-Cookie của affiliate-service + quyết định set/clear/keep.
 */

const SERVICE_SET_COOKIE =
  'aff_ref=CETQZ7JL; Path=/; Max-Age=2592000; Expires=Wed, 07 Oct 2026 00:00:00 GMT; HttpOnly; SameSite=Lax';

describe('parseAffiliateSetCookie', () => {
  it('parse name/value/maxAge từ Set-Cookie của affiliate-service', () => {
    const plan = parseAffiliateSetCookie(SERVICE_SET_COOKIE);
    expect(plan).not.toBeNull();
    expect(plan?.name).toBe('aff_ref');
    expect(plan?.value).toBe('CETQZ7JL');
    expect(plan?.maxAge).toBe(2592000); // 30 ngày
    expect(plan?.httpOnly).toBe(false); // P0: bản forward phải JS-readable
    expect(plan?.path).toBe('/');
    expect(plan?.sameSite).toBe('lax');
  });

  it('maxAge thiếu → undefined (mặc định session cookie)', () => {
    const plan = parseAffiliateSetCookie('aff_ref=ABC23456; Path=/; HttpOnly');
    expect(plan?.maxAge).toBeUndefined();
    expect(plan?.value).toBe('ABC23456');
  });

  it('header rác (không name=value) → null', () => {
    expect(parseAffiliateSetCookie('garbage')).toBeNull();
    expect(parseAffiliateSetCookie('; Path=/')).toBeNull();
    expect(parseAffiliateSetCookie('')).toBeNull();
  });
});

describe('nextAffiliateCookieAction — tri-state capture (review P1-1)', () => {
  const setCapture: CaptureResult = { kind: 'set', setCookie: SERVICE_SET_COOKIE };

  it('set → apply plan', () => {
    const decision = nextAffiliateCookieAction(setCapture, false);
    expect(decision.action).toBe('set');
    if (decision.action === 'set') {
      expect(decision.plan.value).toBe('CETQZ7JL');
      expect(decision.plan.httpOnly).toBe(false);
    }
  });

  it('absent (code sai/SUSPENDED) + có cookie cũ → clear', () => {
    expect(nextAffiliateCookieAction({ kind: 'absent' }, true).action).toBe('clear');
  });

  it('absent + không có cookie cũ → keep (không set gì)', () => {
    expect(nextAffiliateCookieAction({ kind: 'absent' }, false).action).toBe('keep');
  });

  it('error (gateway chết/timeout) + có cookie cũ → KEEP (không mất attribution)', () => {
    expect(nextAffiliateCookieAction({ kind: 'error' }, true).action).toBe('keep');
  });

  it('error + không có cookie cũ → keep', () => {
    expect(nextAffiliateCookieAction({ kind: 'error' }, false).action).toBe('keep');
  });

  it('set nhưng header hỏng → keep (an toàn, không clear oan)', () => {
    const decision = nextAffiliateCookieAction({ kind: 'set', setCookie: 'garbage' }, true);
    expect(decision.action).toBe('keep');
  });
});
