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
 * FI-392 T11: style qua class `.nl-*` (app.css) — màu chỉ qua var(--*)
 * (§5 Cấm: cấm hex trực tiếp trong css).
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
      <p className="nl-desc">{copy.desc}</p>
      {state === 'ok' || state === 'already' ? (
        <div role="status" data-testid="newsletter-msg" className="nl-msg nl-msg--ok">
          {state === 'ok' ? copy.ok : copy.already}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="nl-form">
          <input
            type="email"
            name="newsletter-email"
            placeholder={copy.placeholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="newsletter-email"
            className="nl-input"
          />
          <button
            type="submit"
            disabled={state === 'loading'}
            data-testid="newsletter-submit"
            className="nl-submit"
          >
            {state === 'loading' ? copy.loading : copy.submit}
          </button>
        </form>
      )}
      {state === 'error' ? (
        <div role="alert" className="nl-msg nl-msg--error">{copy.error}</div>
      ) : null}
    </div>
  );
}
