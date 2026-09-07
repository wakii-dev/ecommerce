'use client';

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

const COPY = {
  vi: {
    title: 'Đăng ký nhận tin',
    desc: 'Nhận khuyến mãi và flash deal mới nhất.',
    placeholder: 'Email của bạn',
    submit: 'Đăng ký',
    loading: 'Đang gửi…',
    ok: 'Đã đăng ký! Kiểm tra email chào mừng nhé.',
    already: 'Email này đã được đăng ký từ trước.',
    error: 'Có lỗi xảy ra — thử lại.'
  },
  en: {
    title: 'Newsletter',
    desc: 'Get the latest promos and flash deals.',
    placeholder: 'Your email',
    submit: 'Subscribe',
    loading: 'Sending…',
    ok: 'Subscribed! Check your welcome email.',
    already: 'This email is already subscribed.',
    error: 'Something went wrong — try again.'
  }
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Newsletter form (SF-13 A8) — client island trong Footer; POST
 * `/api/identity/newsletter` qua Next rewrite. status subscribed/already
 * → thông báo tương ứng (dup KHÔNG double email — backend no-op).
 */
export default function NewsletterForm({ locale }: { locale: string }): ReactElement {
  const copy = COPY[locale === 'en' ? 'en' : 'vi'];
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'already' | 'error'>('idle');

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!EMAIL_RE.test(email.trim()) || state === 'loading') return;
    setState('loading');
    fetch('/api/identity/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() })
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { status?: string };
        setState(body.status === 'already' ? 'already' : 'ok');
      })
      .catch(() => setState('error'));
  };

  return (
    <div>
      <h3 className="footer-heading">{copy.title}</h3>
      <p style={{ color: '#bbb', fontSize: 13 }}>{copy.desc}</p>
      {state === 'ok' || state === 'already' ? (
        <div role="status" data-testid="newsletter-msg" style={{ color: '#7ed957', fontSize: 13 }}>
          {state === 'ok' ? copy.ok : copy.already}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate style={{ display: 'flex', gap: 8, maxWidth: 320 }}>
          <input
            type="email"
            name="newsletter-email"
            placeholder={copy.placeholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="newsletter-email"
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #444',
              background: '#222',
              color: '#fff',
              fontSize: 13
            }}
          />
          <button
            type="submit"
            disabled={state === 'loading'}
            data-testid="newsletter-submit"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#F53D2D',
              color: '#fff',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            {state === 'loading' ? copy.loading : copy.submit}
          </button>
        </form>
      )}
      {state === 'error' ? (
        <div role="alert" style={{ color: '#ff7b6b', fontSize: 13 }}>{copy.error}</div>
      ) : null}
    </div>
  );
}
