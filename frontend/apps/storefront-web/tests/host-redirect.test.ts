import { describe, expect, it } from 'vitest';
import { hostnameFromHostHeader, redirectHost127 } from '../lib/host-redirect';

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

/**
 * T7-gate lesson (13-09-09): `next dev -H 0.0.0.0` normalize `nextUrl.hostname`
 * thành BIND address (`0.0.0.0`) — guard PHẢI đọc Host header (host client
 * thật dùng — cookie jar theo host client nhìn thấy), không phải nextUrl.
 */
describe('hostnameFromHostHeader — Host header là nguồn sự thật', () => {
  it('127.0.0.1:3400 → 127.0.0.1; không port → nguyên vẹn; localhost giữ nguyên', () => {
    expect(hostnameFromHostHeader('127.0.0.1:3400')).toBe('127.0.0.1');
    expect(hostnameFromHostHeader('127.0.0.1')).toBe('127.0.0.1');
    expect(hostnameFromHostHeader('localhost:5573')).toBe('localhost');
  });
  it('IPv6 bracket + header thiếu/sai format → rỗng (không redirect)', () => {
    expect(hostnameFromHostHeader('[::1]:3000')).toBe('[::1]');
    expect(hostnameFromHostHeader(null)).toBe('');
    expect(hostnameFromHostHeader('')).toBe('');
    expect(hostnameFromHostHeader('not a host')).toBe('');
  });
});
