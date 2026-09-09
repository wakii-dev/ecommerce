import { describe, expect, it, vi } from 'vitest';

/**
 * Registry tests (FI-398 T3, spec §5.1): register/list trả đúng component,
 * ghi đè cùng id, unregister, event constant giữ literal. Registry là
 * module-level singleton — mỗi test resetModules + dynamic import để
 * isolate state giữa các case.
 */
async function fresh(): Promise<typeof import('../header-slots')> {
  vi.resetModules();
  return await import('../header-slots');
}

describe('HeaderSlots registry', () => {
  it('register/list trả đúng component theo slot', async () => {
    const { HeaderSlots } = await fresh();
    const A = () => null;
    HeaderSlots.register('left', 'a', A);
    expect(HeaderSlots.list('left')).toEqual([A]);
  });

  it('ghi đè cùng id — list không trùng, giữ thứ tự đăng ký', async () => {
    const { HeaderSlots } = await fresh();
    const A = (): null => null;
    const A2 = (): null => null;
    const B = (): null => null;
    HeaderSlots.register('right', 'a', A);
    HeaderSlots.register('right', 'b', B);
    HeaderSlots.register('right', 'a', A2);
    expect(HeaderSlots.list('right')).toEqual([A2, B]);
  });

  it('unregister xoá đúng id, slot khác không ảnh hưởng, id lạ no-op', async () => {
    const { HeaderSlots } = await fresh();
    const A = (): null => null;
    const B = (): null => null;
    HeaderSlots.register('left', 'a', A);
    HeaderSlots.register('center', 'b', B);
    HeaderSlots.unregister('left', 'a');
    expect(HeaderSlots.list('left')).toEqual([]);
    expect(HeaderSlots.list('center')).toEqual([B]);
    expect(() => HeaderSlots.unregister('left', 'ghost')).not.toThrow();
  });

  it('list slot rỗng trả [] và HEADER_SLOTS_CHANGED_EVENT giữ literal', async () => {
    const { HEADER_SLOTS_CHANGED_EVENT, HeaderSlots } = await fresh();
    expect(HeaderSlots.list('right')).toEqual([]);
    expect(HEADER_SLOTS_CHANGED_EVENT).toBe('ecommerce:header-slots-changed');
  });
});
