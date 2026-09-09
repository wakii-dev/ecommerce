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

describe('redirect-127-to-localhost plugin (FI-399)', () => {
  it('defineMfeConfig nạp plugin redirect', () => {
    const config = defineMfeConfig({ name: 'mfe_x' });
    const names = config.plugins.filter(Boolean).map((p) => (Array.isArray(p) ? p.map((q) => q?.name) : p?.name));
    expect(names.flat()).toContain('redirect-127-to-localhost');
  });

  it('middleware: host 127.0.0.1 → 308 localhost giữ port+path+query; localhost → next(); ws upgrade → next()', () => {
    const config = defineMfeConfig({ name: 'mfe_x' });
    const plugin = config.plugins.flat().find((p) => p?.name === 'redirect-127-to-localhost');
    expect(plugin).toBeTruthy();
    let captured;
    const fakeServer = { middlewares: { use: (fn) => { captured = fn; } } };
    plugin.configureServer(fakeServer);
    expect(captured).toBeTypeOf('function');

    const makeRes = () => {
      const res = { code: null, headers: null, ended: false };
      res.writeHead = (code, headers) => { res.code = code; res.headers = headers; };
      res.end = () => { res.ended = true; };
      return res;
    };

    // 127.0.0.1 + path + query → 308 Location localhost (giữ ?ref để hop sau capture)
    const res1 = makeRes();
    captured({ method: 'GET', headers: { host: '127.0.0.1:5573' }, url: '/c/x?ref=CODE1' }, res1, () => { throw new Error('không được next'); });
    expect(res1.code).toBe(308);
    expect(res1.headers.Location).toBe('http://localhost:5573/c/x?ref=CODE1');
    expect(res1.ended).toBe(true);

    // localhost → next()
    let nexted = false;
    captured({ method: 'GET', headers: { host: 'localhost:5573' }, url: '/' }, makeRes(), () => { nexted = true; });
    expect(nexted).toBe(true);

    // ws upgrade (HMR) → next() — không redirect websocket
    nexted = false;
    captured({ method: 'GET', headers: { host: '127.0.0.1:5573', upgrade: 'websocket' }, url: '/' }, makeRes(), () => { nexted = true; });
    expect(nexted).toBe(true);
  });
});
