/**
 * AdminIcon (SF-5 FI-395 T2) — icon admin-local CHỈ cho những tên thiếu so
 * catalog Icon.tsx của ui-kit (ui-kit READ-ONLY — không đụng). Cùng chuẩn
 * geometry Feather-icons 24×24, copy ĐÚNG stroke attrs của Icon.tsx để khớp
 * nét với icon ui-kit dùng kèm trong sidebar. Server-safe: fill=none +
 * stroke=currentColor nên tự theo màu chữ của context (dark cascade miễn phí).
 */
import type { ReactElement } from 'react';

export type AdminIconName =
  | 'grid'
  | 'folder'
  | 'rotate-ccw'
  | 'mail'
  | 'award'
  | 'file-text';

export interface AdminIconProps {
  name: AdminIconName;
  /** default 18 (sidebar nav item — hand-off §2.5) */
  size?: number | string;
  className?: string;
}

/** Catalog path data 24×24 — geometry Feather-icons, cùng viewBox/stroke Icon.tsx. */
export const ADMIN_ICON_PATHS: Record<AdminIconName, ReactElement> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
  folder: (
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  ),
  'rotate-ccw': (
    <>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </>
  ),
  mail: (
    <>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </>
  ),
  'file-text': (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </>
  )
};

/** Danh sách tên — guard phân loại icon admin-local vs ui-kit ở callsite. */
export const ADMIN_ICON_NAMES: ReadonlyArray<AdminIconName> = [
  'grid',
  'folder',
  'rotate-ccw',
  'mail',
  'award',
  'file-text'
];

/** Decorative-only (aria-hidden) — nav item đã có text label riêng. */
export function AdminIcon({ name, size = 18, className }: AdminIconProps) {
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
      className={['admin-icon', className ?? null].filter(Boolean).join(' ')}
      aria-hidden={true}
    >
      {ADMIN_ICON_PATHS[name]}
    </svg>
  );
}
