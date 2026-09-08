import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Token-regression (FI-368 T10) — khóa giá trị tokens.css vào direction A
 * "Chợ Sôi Động" (docs/superpowers/designs/fi310-storefront-direction.md §1).
 * tokens.css là nguồn style chung 5 apps: một hex/scale sai lệch sẽ lan toàn
 * hệ thống mà không unit test UI nào bắt được. Test này fail = ai đó đã đổi
 * VALUE token ngoài quy trình diff-vs-direction.
 */

const css = readFileSync(join(__dirname, '../styles/tokens.css'), 'utf8');

/** Đếm số lần một định nghĩa `--tên: giá trị;` xuất hiện (mỗi theme 1 lần). */
function countDef(token: string, value: string): number {
  const pattern = new RegExp(`${token}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`, 'g');
  return (css.match(pattern) ?? []).length;
}

describe('tokens.css — direction A §1.1 màu gốc (storefront + admin + dark + admin-dark)', () => {
  it('primary/hover/danger/warning/success/accent đúng hex §1.1', () => {
    expect(countDef('--c-primary', '#F53D2D')).toBeGreaterThanOrEqual(2); // storefront + admin (+dark)
    expect(countDef('--c-primary-hover', '#CB1B00')).toBe(2); // light themes; dark #FF6B54
    expect(countDef('--c-danger', '#D0011B')).toBe(2);
    expect(countDef('--c-warning', '#FE9C08')).toBe(4); // cả dark + admin-dark giữ nguyên
    expect(countDef('--c-success', '#26AA99')).toBe(2);
    expect(countDef('--c-accent', '#FFD839')).toBe(4); // cả dark + admin-dark giữ nguyên
  });

  it('bg/surface/text/muted/border đúng hex §1.1 (light)', () => {
    expect(countDef('--c-bg', '#F5F5F5')).toBe(1); // storefront; admin #EFEFEF
    expect(countDef('--c-bg', '#EFEFEF')).toBe(1); // admin §1.7
    expect(countDef('--c-surface', '#FFFFFF')).toBe(2);
    expect(countDef('--c-text', '#212121')).toBe(2);
    expect(countDef('--c-text-muted', '#757575')).toBe(2);
    expect(countDef('--c-border', '#EEEEEE')).toBe(2);
  });

  it('spacing scale §1.2 — 4/8/12/16/24/32/48/64 (light themes; dark cascade)', () => {
    const scale: Array<[string, string]> = [
      ['--space-1', '4px'],
      ['--space-2', '8px'],
      ['--space-3', '12px'],
      ['--space-4', '16px'],
      ['--space-5', '24px'],
      ['--space-6', '32px'],
      ['--space-7', '48px'],
      ['--space-8', '64px']
    ];
    for (const [token, value] of scale) {
      expect(countDef(token, value)).toBe(2); // storefront + admin; dark cascade từ :root
    }
  });

  it('radius §1.3 — 2/4/8/999px (light themes; dark cascade)', () => {
    expect(countDef('--radius-sm', '2px')).toBe(2);
    expect(countDef('--radius-md', '4px')).toBe(2);
    expect(countDef('--radius-lg', '8px')).toBe(2);
    expect(countDef('--radius-full', '999px')).toBe(2);
  });

  it('shadow §1.4 — rgba(0,0,0,.08/.12/.16) (light themes; dark cascade)', () => {
    expect(
      countDef('--shadow-1', '0 1px 2px rgba(0, 0, 0, 0.08)')
    ).toBe(2);
    expect(
      countDef('--shadow-2', '0 2px 8px rgba(0, 0, 0, 0.12)')
    ).toBe(2);
    expect(
      countDef('--shadow-3', '0 8px 24px rgba(0, 0, 0, 0.16)')
    ).toBe(2);
  });

  it('typography §1.5 — Be Vietnam Pro + text scale (light themes; dark cascade)', () => {
    expect((css.match(/--font-sans:\s*'Be Vietnam Pro'/g) ?? []).length).toBe(2);
    expect(countDef('--text-xs', '11px')).toBe(2);
    expect(countDef('--text-sm', '12px')).toBe(2);
    expect(countDef('--text-lg', '16px')).toBe(2);
    expect(countDef('--text-xl', '18px')).toBe(2);
    expect(countDef('--text-2xl', '24px')).toBe(2);
    expect(countDef('--text-3xl', '34px')).toBe(2);
  });
});

describe('tokens.css — §1.6 tint palette (khớp hex hand-off)', () => {
  it('primary tint + success tint + new tint + washes + star track', () => {
    expect(countDef('--tint-primary-bg', '#FDEEEE')).toBe(2);
    expect(countDef('--tint-primary-text', '#CB1B00')).toBe(2);
    expect(countDef('--tint-primary-border', '#FBC8C2')).toBe(2);
    expect(countDef('--tint-success-bg', '#E5F5F3')).toBe(2);
    expect(countDef('--tint-success-text', '#197A6D')).toBe(2);
    expect(countDef('--tint-new-bg', '#FFF4DC')).toBe(2);
    expect(countDef('--tint-new-text', '#9A6B00')).toBe(2);
    expect(countDef('--wash-price-bg', '#FFF1F0')).toBe(2);
    expect(countDef('--wash-hover', '#FAFAFA')).toBe(2);
    expect(countDef('--star-track', '#D8D8D8')).toBe(2);
  });
});

describe('tokens.css — §1.7 status pill palette (admin)', () => {
  it('6 cặp pill-bg/pill-text đúng hex (×2 light theme)', () => {
    expect(countDef('--pill-pending-bg', '#FFF4E0')).toBe(2);
    expect(countDef('--pill-pending-text', '#9A5B00')).toBe(2);
    expect(countDef('--pill-paid-bg', '#E3F0FF')).toBe(2); // exception có chủ đích: xanh dương
    expect(countDef('--pill-paid-text', '#1677FF')).toBe(2);
    expect(countDef('--pill-confirmed-bg', '#E3F5F2')).toBe(2);
    expect(countDef('--pill-confirmed-text', '#1B8476')).toBe(2);
    expect(countDef('--pill-shipped-bg', '#EEF0FB')).toBe(2);
    expect(countDef('--pill-shipped-text', '#4A4AC8')).toBe(2);
    expect(countDef('--pill-delivered-bg', '#E7F6EC')).toBe(2);
    expect(countDef('--pill-delivered-text', '#1F7A45')).toBe(2);
    expect(countDef('--pill-cancelled-bg', '#FDEBEC')).toBe(2);
    expect(countDef('--pill-cancelled-text', '#C0151F')).toBe(2);
  });
});

describe('tokens.css — dark theme (FI-368 T2 contrast AA)', () => {
  it('dark nền/chữ + biến contrast mới có mặt đủ 4 theme', () => {
    expect(css).toContain("[data-theme='dark']");
    expect(countDef('--c-on-accent', '#212121')).toBe(4); // FI-368: chữ trên accent/warning/success (3 theme cũ + admin-dark)
    expect(countDef('--c-link', '#F53D2D')).toBe(2); // light = nguyên primary
    expect(countDef('--c-link', '#FF6B54')).toBe(2); // dark + admin-dark: AA 4.5:1 trên surface
  });

  it('dark muted/border đúng giá trị đã verify contrast', () => {
    expect(countDef('--c-text-muted', '#9E9E9E')).toBe(2); // 6.22:1 surface (dark + admin-dark)
    expect(countDef('--c-border', '#2C2C2C')).toBe(2);
    expect(countDef('--c-danger', '#FF5A5A')).toBe(2); // 5.45:1 surface (dark + admin-dark)
  });
});

describe('tokens v2 — SF-1 FI-391 (hand-off §1.2-§1.5)', () => {
  it('motion durations + easing §1.2 — chỉ :root/storefront (theme khác cascade)', () => {
    expect(countDef('--dur-fast', '140ms')).toBe(1);
    expect(countDef('--dur-base', '180ms')).toBe(1);
    expect(countDef('--dur-slow', '260ms')).toBe(1);
    expect(countDef('--ease-pop', 'cubic-bezier(0.34, 1.4, 0.4, 1)')).toBe(1);
  });

  it('z-index + breakpoints §1.2 — 1 lần (:root); @media không đọc var()', () => {
    expect(countDef('--z-toast', '400')).toBe(1);
    expect(countDef('--bp-md', '960px')).toBe(1);
  });

  it('gradient + CTA shadow §1.3 — family FI-310 §1.8 (hex nguyên văn hand-off)', () => {
    expect(css).toContain('--grad-cta: linear-gradient(90deg, #F53D2D, #FF7A45);');
    expect(countDef('--shadow-cta', '0 4px 12px rgba(245, 61, 45, 0.35)')).toBe(1);
    expect(countDef('--shadow-cta-hover', '0 6px 18px rgba(245, 61, 45, 0.45)')).toBe(1);
  });

  it('admin-dark §1.5 — bg hex mới duy nhất + shadow = bộ dark §1.4 (×2: dark + admin-dark)', () => {
    expect(countDef('--c-bg', '#0F0F0F')).toBe(1); // hex mới duy nhất của elevation
    // admin-dark KHÔNG cascade từ dark (khác giá trị attribute) → shadow re-declare ×2
    expect(countDef('--shadow-1', '0 1px 2px rgba(0, 0, 0, 0.4)')).toBe(2);
    expect(countDef('--shadow-2', '0 2px 8px rgba(0, 0, 0, 0.5)')).toBe(2);
    expect(countDef('--shadow-3', '0 8px 24px rgba(0, 0, 0, 0.6)')).toBe(2);
  });
});
