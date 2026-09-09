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
    // P2 (FI-399 review round-2): IPv6 CÓ assertion — cả bracket (Next hostname
    // mang bracket) lẫn bare.
    expect(redirectHost127('[::1]')).toBeNull();
    expect(redirectHost127('::1')).toBeNull();
  });
});
