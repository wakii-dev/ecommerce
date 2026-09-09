/**
 * AuthWidget wrapper (FI-398 T9, spec §3.7) — NGUỒN widget chuyển sang
 * `@ecommerce/chrome` (AuthMenu: keyboard menu GIỮ, logout từ '@ecommerce/auth').
 * account giữ wiring: appNavigate từ './bootstrap' truyền qua prop onNavigate.
 *
 * bootstrap.tsx GIỮ NGUYÊN: AuthWidget vẫn là component đăng ký 3 slot
 * ('account-auth' trong initAccountShell) — chỉ NỘI BỘ wrapper đổi nguồn.
 */
import type { ReactElement } from 'react';
import { AuthMenu } from '@ecommerce/chrome';
import { appNavigate } from './bootstrap';

export default function AuthWidget(): ReactElement {
  return <AuthMenu onNavigate={appNavigate} />;
}
