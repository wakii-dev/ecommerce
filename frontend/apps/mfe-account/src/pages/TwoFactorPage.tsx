import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, Input } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { TWOFA_CHALLENGE_KEY, verify2fa } from '../api';
import { appNavigate } from '../bootstrap';
import { safeNextPath } from '../lib/nextPath';
import '../page.css';

/**
 * Trang nhập mã sau login challenge (SF-15): login trả {twoFactorRequired,
 * challengeToken} → LoginPage giữ challenge vào sessionStorage → trang này
 * verify → accessToken vào store → /account. Không có challenge → về /login.
 */
export default function TwoFactorPage(): ReactElement {
  const { t } = useT();
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const challenge = sessionStorage.getItem(TWOFA_CHALLENGE_KEY) ?? '';

  useEffect(() => {
    if (!challenge) appNavigate('/login');
  }, [challenge]);

  // SF-4 T2: validate realtime on-blur — regex GIỮ nguyên logic cũ:
  // hợp lệ khi 6 chữ số (app authenticator) hoặc 8 ký tự (mã dự phòng).
  const validateCode = (value: string): string | undefined =>
    /^\d{6}$/.test(value.trim()) || value.trim().length === 8 ? undefined : t('account.auth.errCodeInvalid');

  const onBlurCode = (value: string): void => {
    setTouched(true);
    setFieldError(validateCode(value));
  };

  const onChangeCode = (value: string): void => {
    setCode(value);
    if (touched) setFieldError(validateCode(value));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    setTouched(true);
    const error = validateCode(code);
    setFieldError(error);
    if (error) return;
    setLoading(true);
    verify2fa(challenge, code.trim())
      .then(() => {
        sessionStorage.removeItem(TWOFA_CHALLENGE_KEY);
        appNavigate(safeNextPath(window.location.search, '/account'));
      })
      .catch((err: unknown) => {
        setBanner(
          err instanceof Error && err.name === 'ApiErrorClient'
            ? (err as Error & { detail?: string }).detail || err.message
            : t('account.auth.errTwofaFailed')
        );
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">{t('account.auth.twofaTitle')}</h1>
        {banner ? (
          <div className="auth-error" role="alert">
            {banner}
          </div>
        ) : null}
        <form onSubmit={onSubmit} noValidate>
          <Input
            label={t('account.auth.code')}
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder={t('account.auth.phCode')}
            value={code}
            error={fieldError}
            onBlur={(e) => onBlurCode(e.target.value)}
            onChange={(e) => onChangeCode(e.target.value)}
          />
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            {t('account.auth.confirm')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
