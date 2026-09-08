import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Card } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { exchangeOauthCode } from '../api';
import { appNavigate } from '../bootstrap';
import '../page.css';

/** Thông điệp lỗi từ callback ?error= (identity sanitize [a-zA-Z0-9_-]) → i18n keys. */
const OAUTH_ERROR_KEYS: Record<string, string> = {
  access_denied: 'account.oauth.accessDenied',
  state_mismatch: 'account.oauth.stateMismatch',
  no_email: 'account.oauth.noEmail',
  missing_code: 'account.oauth.missingCode',
  provider_error: 'account.oauth.providerError'
};

/**
 * Trang nhận 302 từ identity sau OAuth callback (SF-15): đọc ?code một-lần →
 * POST /api/identity/oauth/exchange → token vào store → /account. Route shell
 * /login/oauth/callback (origin shell — cookie refresh set đúng chỗ).
 */
export default function OAuthCallbackPage(): ReactElement {
  const { t } = useT();
  const [message, setMessage] = useState(t('account.oauth.completing'));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const code = params.get('code');
    if (error) {
      setMessage(t(OAUTH_ERROR_KEYS[error] ?? 'account.oauth.genericError'));
      setFailed(true);
      return;
    }
    if (!code) {
      setMessage(t('account.oauth.missingCode'));
      setFailed(true);
      return;
    }
    exchangeOauthCode(code)
      .then(() => {
        if (alive) appNavigate('/account');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setMessage(
          err instanceof Error && err.name === 'ApiErrorClient'
            ? (err as Error & { detail?: string }).detail || err.message
            : t('account.oauth.exchangeError')
        );
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">{failed ? t('account.oauth.failedTitle') : t('account.auth.loginTitle')}</h1>
        <div className={failed ? 'auth-error' : 'auth-banner'} role={failed ? 'alert' : 'status'}>
          {message}
        </div>
        {failed ? (
          <Button variant="primary" fullWidth onClick={() => appNavigate('/login')}>
            {t('account.auth.backToLogin')}
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
