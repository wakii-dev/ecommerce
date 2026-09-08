import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, Icon, Input } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { appNavigate } from '../bootstrap';
import '../page.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Quên mật khẩu (SF-13 A1) — POST /api/identity/password/forgot.
 * Contract: LUÔN 202 kể cả email không tồn tại (anti-enumeration) →
 * banner thành công chung, không tiết lộ email có tài khoản hay không.
 */
export default function ForgotPasswordPage(): ReactElement {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // SF-4 T2: validate realtime on-blur (pattern per-page).
  const validateEmail = (value: string): string | undefined =>
    EMAIL_RE.test(value.trim()) ? undefined : t('account.auth.errInvalidEmail');

  const onBlurEmail = (value: string): void => {
    setTouched(true);
    setFieldError(validateEmail(value));
  };

  const onChangeEmail = (value: string): void => {
    setEmail(value);
    if (touched) setFieldError(validateEmail(value));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    setTouched(true);
    const error = validateEmail(email);
    setFieldError(error);
    if (error) return;
    setLoading(true);
    fetch('/api/identity/password/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() })
    })
      .then((res) => {
        if (!res.ok && res.status !== 202) throw new Error(String(res.status));
        setSent(true);
      })
      .catch(() => {
        setBanner(t('account.auth.errGeneric'));
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">{t('account.auth.forgotTitle')}</h1>
        {sent ? (
          <>
            <div className="auth-ok" role="status" data-testid="forgot-sent">
              <Icon name="check" size={16} />
              <span>{t('account.auth.forgotSent')}</span>
            </div>
            <p className="auth-switch">
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  appNavigate('/login');
                }}
              >
                {t('account.auth.backToLogin')}
              </a>
            </p>
          </>
        ) : (
          <>
            {banner ? (
              <div className="auth-error" role="alert">
                {banner}
              </div>
            ) : null}
            <form onSubmit={onSubmit} noValidate>
              <Input
                label={t('account.auth.email')}
                type="email"
                name="email"
                autoComplete="email"
                placeholder={t('account.auth.phEmail')}
                value={email}
                error={fieldError}
                data-testid="forgot-email"
                onBlur={(e) => onBlurEmail(e.target.value)}
                onChange={(e) => onChangeEmail(e.target.value)}
              />
              <Button type="submit" variant="primary" fullWidth loading={loading} data-testid="forgot-submit">
                {t('account.auth.sendResetLink')}
              </Button>
            </form>
            <p className="auth-switch">
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  appNavigate('/login');
                }}
              >
                {t('account.auth.backToLogin')}
              </a>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
