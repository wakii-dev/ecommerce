import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, IconButton, Input } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { register } from '../api';
import { appNavigate } from '../bootstrap';
import { EyeIcon } from '../components/EyeIcon';
import '../page.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterField = 'fullName' | 'email' | 'password';

export default function RegisterPage(): ReactElement {
  const { t } = useT();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<RegisterField, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // SF-4 T2: validate realtime on-blur — pattern per-page (không shared hook).
  const validateField = (field: RegisterField, value: string): string | undefined => {
    if (field === 'fullName') return value.trim().length >= 1 ? undefined : t('account.auth.errFullNameRequired');
    if (field === 'email') return EMAIL_RE.test(value.trim()) ? undefined : t('account.auth.errInvalidEmail');
    return value.length >= 8 ? undefined : t('account.auth.errPasswordMin8');
  };

  const onBlurField = (field: RegisterField, value: string): void => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
  };

  const onChangeField = (field: RegisterField, value: string): void => {
    if (field === 'fullName') setFullName(value);
    else if (field === 'email') setEmail(value);
    else setPassword(value);
    if (touched[field]) setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    // Validation client-side TRƯỚC submit — email format, password ≥8, fullName ≥1.
    // Submit = validate tất cả + touch tất cả (SF-4 T2).
    const errors: Partial<Record<RegisterField, string>> = {
      fullName: validateField('fullName', fullName),
      email: validateField('email', email),
      password: validateField('password', password)
    };
    setTouched({ fullName: true, email: true, password: true });
    setFieldErrors(errors);
    if (errors.fullName || errors.email || errors.password) return;

    setLoading(true);
    register({ email, password, fullName })
      .then(() => appNavigate('/account')) // register auto-login (packages/auth)
      .catch((err: unknown) => {
        // Duck-type thay vì instanceof — @ecommerce/contracts không phải shared
        // singleton qua MF boundary, class của thrower khác class của remote.
        if (err instanceof Error && err.name === 'ApiErrorClient') {
          const apiErr = err as Error & { status?: number; detail?: string };
          setBanner(apiErr.status === 409 ? t('account.auth.errEmailTaken') : apiErr.detail || apiErr.message);
        } else {
          setBanner(t('account.auth.errGeneric'));
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">{t('account.auth.registerTitle')}</h1>
        {banner ? (
          <div className="auth-error" role="alert">
            {banner}
          </div>
        ) : null}
        <form onSubmit={onSubmit} noValidate>
          <Input
            label={t('account.auth.fullName')}
            type="text"
            name="fullName"
            autoComplete="name"
            placeholder={t('account.auth.phFullName')}
            value={fullName}
            error={fieldErrors.fullName}
            onBlur={(e) => onBlurField('fullName', e.target.value)}
            onChange={(e) => onChangeField('fullName', e.target.value)}
          />
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
              autoComplete="new-password"
              placeholder={t('account.auth.phPasswordRegister')}
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
            {t('account.auth.register')}
          </Button>
        </form>
        <p className="auth-switch">
          {t('account.auth.haveAccount')}{' '}
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              appNavigate('/login');
            }}
          >
            {t('account.auth.login')}
          </a>
        </p>
      </Card>
    </div>
  );
}
