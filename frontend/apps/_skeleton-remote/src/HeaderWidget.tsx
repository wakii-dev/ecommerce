import { useState } from 'react';
import type { ReactElement } from 'react';

// Widget demo do REMOTE expose — SHELL nạp module này rồi tự đăng ký vào
// HeaderSlots ('right', xem apps/shell/src/pages/RemotePage.tsx). Remote
// KHÔNG tự gọi HeaderSlots (registry là của host).
export default function HeaderWidget(): ReactElement {
  const [mountedAt] = useState(() => new Date().toLocaleTimeString('vi-VN'));
  return (
    <span
      data-testid="mf-header-widget"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full, 999px)',
        border: '1px solid #2e7d32',
        color: '#2e7d32',
        fontSize: 'var(--text-xs, 12px)'
      }}
    >
      MF ✓ · {mountedAt}
    </span>
  );
}
