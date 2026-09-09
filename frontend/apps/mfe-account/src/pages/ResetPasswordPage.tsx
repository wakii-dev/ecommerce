import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, Icon, IconButton, Input } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { appNavigate } from '../bootstrap';
import { EyeIcon } from '../components/EyeIcon';
import '../page.css';

/**
 * Đặt lại mật khẩu (SF-13 A1) — trang shell `/reset-password?token=…`.
 * Token từ query param; POST /api/identity/password/reset → 204 OK,
 * 401 token sai/hết hạn/đã dùng (problem+json detail).
 */
export default function ResetPasswordPage(): ReactElement {
  const { t } = useT();
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  // SF-4 T2: validate realtime on-blur (pattern per-page).
  const validatePassword = (value: string): string | undefined =>
    value.length >= 8 ? undefined : t('account.auth.errPasswordMin8');

  const onBlurPassword = (value: string): void => {
    setTouched(true);
    setFieldError(validatePassword(value));
  };

  const onChangePassword = (value: string): void => {
    setPassword(value);
    if (touched) setFieldError(validatePassword(value));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    setTouched(true);
    const error = validatePassword(password);
    setFieldError(error);
    if (error) return;
    setLoading(true);
    fetch('/api/identity/password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: password })
    })
      .then(async (res) => {
        if (res.status === 204) {
          setDone(true);
          return;
        }
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        setBanner(
          res.status === 401 ? body?.detail || t('account.auth.errTokenInvalid') : t('account.auth.errGeneric')
        );
      })
      .catch(() => {
        setBanner(t('account.auth.errGeneric'));
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">{t('account.auth.resetTitle')}</h1>
        {done ? (
          <>
            <div className="auth-ok" role="status" data-testid="reset-success">
              <Icon name="check" size={16} />
              <span>{t('account.auth.resetSuccess')}</span>
            </div>
            <p className="auth-switch">
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  appNavigate('/login');
                }}
              >
                {t('account.auth.loginWithNewPassword')}
              </a>
            </p>
          </>
        ) : !token ? (
          <div className="auth-error" role="alert" data-testid="reset-missing-token">
            {t('account.auth.resetMissingToken')}
          </div>
        ) : (
          <>
            {banner ? (
              <div className="auth-error" role="alert">
                {banner}
              </div>
            ) : null}
            <form onSubmit={onSubmit} noValidate>
              <div className="pw-field">
                <Input
                  label={t('account.auth.newPassword')}
                  type={showPassword ? 'text' : 'password'}
                  name="newPassword"
                  autoComplete="new-password"
                  placeholder={t('account.auth.phPassword')}
                  value={password}
                  error={fieldError}
                  data-testid="reset-password-input"
                  onBlur={(e) => onBlurPassword(e.target.value)}
                  onChange={(e) => onChangePassword(e.target.value)}
                />
                <IconButton
                  className="pw-toggle"
                  aria-label={t(showPassword ? 'account.auth.hidePassword' : 'account.auth.showPassword')}
                  aria-pressed={showPassword}
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  <EyeIcon off={showPassword} />
                </IconButton>
              </div>
              <Button type="submit" variant="primary" fullWidth loading={loading} data-testid="reset-submit">
                {t('account.auth.resetPassword')}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
