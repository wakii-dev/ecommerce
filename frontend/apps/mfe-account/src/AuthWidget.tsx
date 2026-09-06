import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useAuth } from '@ecommerce/auth';
import { logout } from './api';
import { appNavigate } from './bootstrap';

function GuestLinks(): ReactElement {
  const go = (to: string) => (event: { preventDefault(): void }) => {
    event.preventDefault();
    appNavigate(to);
  };
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--space-3, 12px)', alignItems: 'center' }} data-testid="auth-guest">
      <a href="/login" onClick={go('/login')} style={{ color: 'var(--c-text, #212121)', fontSize: 'var(--text-md, 14px)', textDecoration: 'none' }}>
        Đăng nhập
      </a>
      <a href="/register" onClick={go('/register')}
        style={{ color: 'var(--c-primary, #F53D2D)', border: '1px solid var(--c-primary, #F53D2D)', borderRadius: 'var(--radius-sm, 2px)', padding: '5px 12px', fontSize: 'var(--text-md, 14px)', textDecoration: 'none', fontWeight: 600 }}>
        Đăng ký
      </a>
    </span>
  );
}

function UserMenu(): ReactElement {
  const { user, logout: clearLocal } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const displayName = user?.fullName?.split(' ')[0] || user?.email?.split('@')[0] || 'Tài khoản';
  const item = (label: string, to?: string, action?: () => void): ReactElement => (
    <a
      href={to ?? '#'}
      onClick={(event) => {
        event.preventDefault();
        setOpen(false);
        action ? action() : to && appNavigate(to);
      }}
      style={{ display: 'block', padding: '9px 16px', fontSize: 'var(--text-md, 14px)', color: 'var(--c-text, #212121)', textDecoration: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAFA')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </a>
  );

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }} data-testid="auth-user">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text, #212121)', fontSize: 'var(--text-md, 14px)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        {displayName} <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <span
          role="menu"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #eee)', borderRadius: 'var(--radius-md, 4px)', boxShadow: 'var(--shadow-2, 0 2px 8px rgba(0,0,0,.12))', minWidth: 180, zIndex: 1000, display: 'block', overflow: 'hidden' }}
        >
          {item('Tài khoản', '/account')}
          {item('Đơn hàng của tôi', '/account/orders')}
          {item('Đăng xuất', undefined, () => { void logout().then(() => clearLocal()).then(() => appNavigate('/login')); })}
        </span>
      ) : null}
    </span>
  );
}

export default function AuthWidget(): ReactElement {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <UserMenu /> : <GuestLinks />;
}
