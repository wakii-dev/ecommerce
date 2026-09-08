'use client';

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type { Locale } from '../lib/format';
import { t } from '../lib/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Newsletter form (SF-13 A8) — client island trong Footer; POST
 * `/api/identity/newsletter` qua Next rewrite. status subscribed/already
 * → thông báo tương ứng (dup KHÔNG double email — backend no-op).
 * FI-392 T11: style qua class `.nl-*` (app.css) — màu chỉ qua var(--*)
 * (§5 Cấm: cấm hex trực tiếp trong css). T12: copy trong lib/i18n
 * (miền `newsletter`).
 */
export default function NewsletterForm({ locale }: { locale: Locale }): ReactElement {
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
      <h3 className="footer-heading">{t(locale, 'newsletter.title')}</h3>
      <p className="nl-desc">{t(locale, 'newsletter.desc')}</p>
      {state === 'ok' || state === 'already' ? (
        <div role="status" data-testid="newsletter-msg" className="nl-msg nl-msg--ok">
          {state === 'ok' ? t(locale, 'newsletter.ok') : t(locale, 'newsletter.already')}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="nl-form">
          <input
            type="email"
            name="newsletter-email"
            placeholder={t(locale, 'newsletter.placeholder')}
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
            {state === 'loading' ? t(locale, 'newsletter.loading') : t(locale, 'newsletter.submit')}
          </button>
        </form>
      )}
      {state === 'error' ? (
        <div role="alert" className="nl-msg nl-msg--error">{t(locale, 'newsletter.error')}</div>
      ) : null}
    </div>
  );
}
