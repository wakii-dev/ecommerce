// EyeIcon (SF-4 FI-394 T2) — SVG inline cho password visibility toggle.
// Icon set ui-kit (22 names) không có eye/eye-off → file surface-owned,
// KHÔNG sửa ui-kit (plan T2 Step 1). Feather-geometry, stroke 1.8,
// currentColor, aria-hidden mặc định (nút toggle đã có aria-label mô tả).
// Server-safe: pure component, không effect/state.
import type { ReactElement } from 'react';

export function EyeIcon({ size = 18, off = false }: { size?: number; off?: boolean }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
