'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { logout, useAuth } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { Icon } from '@ecommerce/ui-kit';

/**
 * AuthMenu (FI-398 T9, spec §3.7) — port VERBATIM từ mfe-account AuthWidget
 * (SF-4 FI-394 T3) — UserMenu keyboard-OK: trigger aria-haspopup +
 * aria-expanded, menu role="menu" + item role="menuitem" roving focus thật
 * (tabIndex=-1 + .focus(), KHÔNG aria-activedescendant): ArrowDown/Up wrap,
 * Home/End, Escape đóng + restore focus về trigger, Tab đóng tự nhiên.
 * ▲/▼ text → Icon chevron-down + caret rotate. GIỮ data-testid
 * auth-guest/auth-user + chuỗi vi ('Đăng nhập', 'Đăng ký', 'Tài khoản',
 * 'Đơn hàng của tôi', 'Đăng xuất') — e2e/walkthrough locate theo text.
 *
 * DELTA so với nguồn (spec §3.7 chốt):
 * - `logout` import từ '@ecommerce/auth' (account src/api.ts chỉ re-export —
 *   cùng nguồn; packages/auth api.ts: POST logout + finally clear cục bộ).
 * - `appNavigate(to)` → prop `onNavigate?: (to: string) => void`. Không
 *   onNavigate → KHÔNG preventDefault: anchor href (/login,/register,
 *   /account) điều hướng tự nhiên (guest links + menu item nav 2 nhánh);
 *   logout → window.location.assign('/login') khi không có router shell.
 * - i18n keys đổi nguồn: nav.login/register → chrome.guest.login/register;
 *   account.menu.* → chrome.menu.* — strings GIỮ NGUYÊN (mirror T11).
 *
 * Classes .um-* do chrome.css sở hữu bản port (account page.css GIỮ bộ cũ
 * cho standalone — dup tạm F4 đã duyệt, SF-4 dọn khi xóa wrapper).
 */
export interface AuthMenuProps {
  onNavigate?: (to: string) => void;
}

interface MenuItem {
  key: string;
  to?: string;
  danger?: boolean;
  action?: () => void;
}

function GuestLinks({ onNavigate }: { onNavigate?: (to: string) => void }): ReactElement {
  const { t } = useT();
  const go = (to: string) => (event: { preventDefault(): void }) => {
    // Không onNavigate → KHÔNG preventDefault: anchor href điều hướng tự nhiên
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(to);
  };
  return (
    <span className="um-guest" data-testid="auth-guest">
      <a href="/login" onClick={go('/login')} className="um-guest__login">
        {t('chrome.guest.login')}
      </a>
      <a href="/register" onClick={go('/register')} className="um-guest__register">
        {t('chrome.guest.register')}
      </a>
    </span>
  );
}

function UserMenu({ onNavigate }: { onNavigate?: (to: string) => void }): ReactElement {
  const { user, logout: clearLocal } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  // Focus item sau khi menu render xong (setOpen trong keydown chưa có DOM item).
  const pendingFocus = useRef<'first' | 'last' | null>(null);

  const displayName =
    user?.fullName?.split(' ')[0] || user?.email?.split('@')[0] || t('chrome.menu.displayNameFallback');

  // 3 item cố định — logout GIỮ nguyên flow cũ (logout → clearLocal → /login).
  const items: MenuItem[] = [
    { key: 'chrome.menu.account', to: '/account' },
    { key: 'chrome.menu.orders', to: '/account/orders' },
    {
      key: 'chrome.menu.logout',
      danger: true,
      action: () => {
        void logout()
          .then(() => clearLocal())
          .then(() => {
            // Điều hướng /login: qua router shell khi có onNavigate;
            // standalone (không router) → điều hướng trình duyệt.
            if (onNavigate) onNavigate('/login');
            else window.location.assign('/login');
          });
      }
    }
  ];

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    if (open && pendingFocus.current) {
      const index = pendingFocus.current === 'first' ? 0 : items.length - 1;
      itemRefs.current[index]?.focus();
      pendingFocus.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openWithFocus = (where: 'first' | 'last') => {
    pendingFocus.current = where;
    setOpen(true);
  };

  const select = (it: MenuItem, event?: { preventDefault(): void }) => {
    setOpen(false);
    if (it.action) {
      event?.preventDefault();
      it.action();
      return;
    }
    if (it.to && onNavigate) {
      event?.preventDefault();
      onNavigate(it.to);
    }
    // nav item + KHÔNG onNavigate → KHÔNG preventDefault — anchor href tự nhiên
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      // preventDefault TRƯỚC khi xử lý: browser tổng hợp click sau keydown —
      // không chặn thì click đó toggle lần 2 làm menu vừa mở bị đóng ngay
      // (Space còn cuộn trang). Đóng → mở + focus item đầu; đang mở → đóng
      // + restore focus trigger (Safari không giữ focus nút sau click).
      event.preventDefault();
      if (open) {
        setOpen(false);
        triggerRef.current?.focus();
      } else {
        openWithFocus('first');
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      openWithFocus('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openWithFocus('last');
    } else if (event.key === 'Escape' && open) {
      setOpen(false);
    } else if (event.key === 'Tab' && open) {
      setOpen(false); // focus đi tiếp tự nhiên — KHÔNG preventDefault
    }
  };

  const onItemKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number, it: MenuItem) => {
    const count = items.length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        itemRefs.current[(index + 1) % count]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        itemRefs.current[(index - 1 + count) % count]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        itemRefs.current[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        itemRefs.current[count - 1]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus(); // restore focus về trigger
        break;
      case 'Tab':
        setOpen(false); // KHÔNG preventDefault — focus đi tiếp tự nhiên
        break;
      case ' ': // Space không activate <a> mặc định — chọn như click
        event.preventDefault();
        select(it);
        break;
    }
  };

  return (
    <span ref={rootRef} className="um-root" data-testid="auth-user">
      <button
        ref={triggerRef}
        type="button"
        className="um-trigger"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {displayName}
        <span className={open ? 'um-caret um-caret--open' : 'um-caret'} aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      {open ? (
        <span role="menu" className="um-menu">
          {items.map((it, index) => (
            <a
              key={it.key}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              role="menuitem"
              href={it.to ?? '#'}
              tabIndex={-1}
              className={it.danger ? 'um-menu__item um-menu__item--danger' : 'um-menu__item'}
              onClick={(event) => {
                select(it, event);
              }}
              onKeyDown={(event) => onItemKeyDown(event, index, it)}
            >
              {t(it.key)}
            </a>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function AuthMenu({ onNavigate }: AuthMenuProps): ReactElement {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <UserMenu onNavigate={onNavigate} /> : <GuestLinks onNavigate={onNavigate} />;
}

export default AuthMenu;
