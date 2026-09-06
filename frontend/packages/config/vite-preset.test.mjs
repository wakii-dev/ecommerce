// Test preset MFE dùng chung — chặn regression package MF (review FI-311 P1-4:
// từng nhầm @module-federation/enhanced webpack-only). Contract kiểm ở đây:
// 1) package ĐÚNG (@module-federation/vite) import được và exports `federation`
// 2) preset wrap federation() không ném, build target + filename đúng.
// LƯU Ý: federation() có thể trả mảng plugin rỗng khi chạy dưới vitest
// (plugin đếm mode/NODE_ENV — hành vi của @module-federation/vite, không phải
// bug preset); plugin đầy đủ được SF-2 federation harness verify ở tầng vite
// dev/build thật.
import { describe, it, expect } from 'vitest';
import * as mf from '@module-federation/vite';
import { defineMfeConfig } from './vite-preset.mjs';

describe('vite-preset (MFE config dùng chung)', () => {
  it('package MF là @module-federation/vite — exports federation() function', () => {
    expect(typeof mf.federation, 'preset phải dùng @module-federation/vite, '
      + 'KHÔNG phải @module-federation/enhanced (webpack-only)').toBe('function');
  });

  it('defineMfeConfig wrap federation không ném + build target đúng', () => {
    const config = defineMfeConfig({
      name: 'mfe_test',
      exposes: { './Ping': './src/Ping.tsx' }
    });
    expect(config).toBeTruthy();
    expect(config.build.target).toBe('es2022');
    expect(Array.isArray(config.plugins)).toBe(true);
  });

  it('custom filename được nhận', () => {
    expect(() => defineMfeConfig({ name: 'mfe_x', filename: 'custom-entry.js' })).not.toThrow();
  });
});
