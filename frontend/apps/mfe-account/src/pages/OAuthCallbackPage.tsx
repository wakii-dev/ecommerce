import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Card } from '@ecommerce/ui-kit';
import { exchangeOauthCode } from '../api';
import { appNavigate } from '../bootstrap';
import '../page.css';

/** Thông điệp lỗi từ callback ?error= (identity sanitize [a-zA-Z0-9_-]). */
const ERRORS: Record<string, string> = {
  access_denied: 'Bạn đã từ chối cấp quyền đăng nhập.',
  state_mismatch: 'Phiên đăng nhập không hợp lệ — thử lại từ đầu.',
  no_email: 'Tài khoản mạng xã hội chưa xác thực email — dùng cách đăng nhập khác.',
  missing_code: 'Thiếu mã đăng nhập từ nhà cung cấp.',
  provider_error: 'Nhà cung cấp đăng nhập gặp lỗi — thử lại.'
};

/**
 * Trang nhận 302 từ identity sau OAuth callback (SF-15): đọc ?code một-lần →
 * POST /api/identity/oauth/exchange → token vào store → /account. Route shell
 * /login/oauth/callback (origin shell — cookie refresh set đúng chỗ).
 */
export default function OAuthCallbackPage(): ReactElement {
  const [message, setMessage] = useState('Đang hoàn tất đăng nhập…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const code = params.get('code');
    if (error) {
      setMessage(ERRORS[error] ?? 'Đăng nhập không thành công.');
      setFailed(true);
      return;
    }
    if (!code) {
      setMessage('Thiếu mã đăng nhập từ nhà cung cấp.');
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
            : 'Không hoàn tất được đăng nhập — thử lại.'
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
        <h1 className="auth-title">{failed ? 'Đăng nhập không thành công' : 'Đăng nhập'}</h1>
        <div className={failed ? 'auth-error' : 'auth-banner'} role={failed ? 'alert' : 'status'}>
          {message}
        </div>
        {failed ? (
          <Button variant="primary" fullWidth onClick={() => appNavigate('/login')}>
            Về trang đăng nhập
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
