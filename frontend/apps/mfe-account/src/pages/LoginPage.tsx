import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, IconButton, Input } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { login, oauthProviders } from '../api';
import { appNavigate } from '../bootstrap';
import { safeNextPath } from '../lib/nextPath';
import { EyeIcon } from '../components/EyeIcon';
import '../page.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Nút social ẩn/hiện theo identity env (well-known) — không key → không nút. */
function OAuthButtons(): ReactElement | null {
  const { t } = useT();
  const [providers, setProviders] = useState<{ google: boolean; facebook: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    oauthProviders().then((p) => {
      if (alive) setProviders(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!providers || (!providers.google && !providers.facebook)) return null;
  const go = (provider: 'google' | 'facebook'): void => {
    // Relative qua proxy/gateway — authorize 302 sang provider consent.
    window.location.assign(`/api/identity/oauth/${provider}/authorize`);
  };
  return (
    <>
      <div className="oauth-divider" role="separator" aria-label={t('account.oauth.or')}>
        <span>{t('account.oauth.or')}</span>
      </div>
      <div className="oauth-buttons">
        {providers.google ? (
          <Button type="button" variant="secondary" fullWidth onClick={() => go('google')}>
            <span className="oauth-btn-label">{t('account.oauth.google')}</span>
          </Button>
        ) : null}
        {providers.facebook ? (
          <Button type="button" variant="secondary" fullWidth onClick={() => go('facebook')}>
            <span className="oauth-btn-label">{t('account.oauth.facebook')}</span>
          </Button>
        ) : null}
      </div>
    </>
  );
}

export default function LoginPage(): ReactElement {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // SF-4 T2: validate realtime on-blur — validateField thuần string, error
  // hiện khi field đã chạm (blur/submit), onChange sau chạm re-validate.
  const validateField = (field: 'email' | 'password', value: string): string | undefined => {
    if (field === 'email') return EMAIL_RE.test(value.trim()) ? undefined : t('account.auth.errInvalidEmail');
    return value.length >= 8 ? undefined : t('account.auth.errPasswordMin8');
  };

  const onBlurField = (field: 'email' | 'password', value: string): void => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
  };

  const onChangeField = (field: 'email' | 'password', value: string): void => {
    if (field === 'email') setEmail(value);
    else setPassword(value);
    if (touched[field]) setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    // Validation client-side TRƯỚC submit — lỗi hiện dưới field, không gọi API.
    // Submit = validate tất cả + touch tất cả (SF-4 T2).
    const errors: { email?: string; password?: string } = {
      email: validateField('email', email),
      password: validateField('password', password)
    };
    setTouched({ email: true, password: true });
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setLoading(true);
    const nextPath = safeNextPath(window.location.search, '/account');
    login({ email, password })
      .then((result) => {
        if (result.kind === 'ok') {
          // Honor ?next= (vd admin gate :5177 gửi /login?next=%2Fadmin) —
          // local path đã sanitize, không hợp lệ thì về /account.
          appNavigate(nextPath);
          return;
        }
        // SF-15: 2FA bật — giữ challenge (single-use) cho trang nhập mã.
        sessionStorage.setItem('ecommerce.2fa.challenge', result.challengeToken);
        // Forward next qua 2FA để landing sau verify vẫn đúng đích ban đầu.
        appNavigate(`/login/2fa?next=${encodeURIComponent(nextPath)}`);
      })
      .catch((err: unknown) => {
        // Duck-type thay vì instanceof — @ecommerce/contracts không phải shared
        // singleton qua MF boundary, class của thrower khác class của remote.
        setBanner(
          err instanceof Error && err.name === 'ApiErrorClient'
            ? (err as Error & { detail?: string }).detail || err.message
            : t('account.auth.errGeneric')
        );
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">{t('account.auth.loginTitle')}</h1>
        {banner ? (
          <div className="auth-error" role="alert">
            {banner}
          </div>
        ) : null}
        <OAuthButtons />
        <form onSubmit={onSubmit} noValidate>
          <Input
            label={t('account.auth.email')}
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t('account.auth.phEmail')}
            value={email}
            error={fieldErrors.email}
            onBlur={(e) => onBlurField('email', e.target.value)}
            onChange={(e) => onChangeField('email', e.target.value)}
          />
          <div className="pw-field">
            <Input
              label={t('account.auth.password')}
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder={t('account.auth.phPassword')}
              value={password}
              error={fieldErrors.password}
              onBlur={(e) => onBlurField('password', e.target.value)}
              onChange={(e) => onChangeField('password', e.target.value)}
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
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            {t('account.auth.login')}
          </Button>
        </form>
        <p className="auth-switch">
          {t('account.auth.noAccount')}{' '}
          <a
            href="/register"
            onClick={(e) => {
              e.preventDefault();
              appNavigate('/register');
            }}
          >
            {t('account.auth.register')}
          </a>
        </p>
      </Card>
    </div>
  );
}
