import { describe, expect, it, vi } from 'vitest';

// Node 24 CÓ BroadcastChannel + navigator.locks native — SSR-guard PHẢI dựa trên
// `typeof window`, KHÔNG phải `typeof BroadcastChannel` (spec §2.5). Spy thay
// global TRƯỚC khi import để bắt mọi constructor call (kể cả top-level).
const created: unknown[] = [];

vi.stubGlobal('BroadcastChannel', class SpyChannel {
  constructor() {
    created.push(this);
  }
  postMessage() {}
  close() {}
  addEventListener() {}
});

describe('session-sync SSR-guard (Node thuần — không window)', () => {
  it('import module + configureAuth → không ném, KHÔNG tạo BroadcastChannel nào', async () => {
    expect(created).toHaveLength(0); // import side-effect-free
    const { configureAuth } = await import('../AuthStore');
    expect(() => configureAuth({ refreshUrl: '/api/identity/auth/refresh' })).not.toThrow();
    expect(created, 'SSR/Node: lazy init KHÔNG chạm BroadcastChannel (typeof window guard)').toHaveLength(0);
  });

  it('configureAuth ×2 (browser path — window defined) → ĐÚNG 1 channel (idempotent, spec §4)', async () => {
    vi.stubGlobal('window', {}); // window defined → auto-start được phép chạy
    try {
      vi.resetModules(); // handle module-level singleton — cần module fresh
      const { configureAuth: freshConfigure } = await import('../AuthStore');
      created.length = 0;
      freshConfigure({ refreshUrl: '/api/identity/auth/refresh' });
      freshConfigure({ refreshUrl: '/api/identity/auth/refresh' });
      expect(created, '2 lần configureAuth không được nhân bản listener/channel').toHaveLength(1);
    } finally {
      vi.unstubAllGlobals(); // gỡ window + SpyBC stub
      vi.resetModules(); // tránh module AuthStore "dính" stub leak sang file khác
    }
  });
});
