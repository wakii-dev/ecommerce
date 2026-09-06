import type { ComponentType } from 'react';

// Slot registry cho header shell — SF-2 Task 14. Shell/remote đăng ký widget
// vào slot SAU khi module sẵn sàng; Header.tsx KHÔNG import gì của remote —
// thêm widget mới = register từ phía consumer, không sửa file Header
// (additive, mở đường cho SF-6/7 đăng ký từ remote của chúng).

export type SlotKey = 'left' | 'center' | 'right';

/** Map[slot] -> Map[id] -> Component — id để unregister / ghi đè deterministic. */
const registry = new Map<SlotKey, Map<string, ComponentType>>();

export const HeaderSlots = {
  register(slot: SlotKey, id: string, Component: ComponentType): void {
    let byId = registry.get(slot);
    if (!byId) {
      byId = new Map();
      registry.set(slot, byId);
    }
    byId.set(id, Component);
  },

  unregister(slot: SlotKey, id: string): void {
    registry.get(slot)?.delete(id);
  },

  list(slot: SlotKey): ComponentType[] {
    return Array.from(registry.get(slot)?.values() ?? []);
  }
};
