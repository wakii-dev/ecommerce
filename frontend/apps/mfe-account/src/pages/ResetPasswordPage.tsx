import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, Input } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import '../page.css';

/**
 * Đặt lại mật khẩu (SF-13 A1) — trang shell `/reset-password?token=…`.
 * Token từ query param; POST /api/identity/password/reset → 204 OK,
 * 401 token sai/hết hạn/đã dùng (problem+json detail).
 */
export default function ResetPasswordPage(): ReactElement {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    if (password.length < 8) {
      setFieldError('Mật khẩu tối thiểu 8 ký tự');
      return;
    }
    setFieldError(undefined);
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
        setBanner(res.status === 401 ? body?.detail || 'Token không hợp lệ hoặc đã hết hạn' : 'Có lỗi xảy ra — thử lại');
      })
      .catch(() => {
        setBanner('Có lỗi xảy ra — thử lại');
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">Đặt lại mật khẩu</h1>
        {done ? (
          <>
            <div className="auth-error" role="status" data-testid="reset-success" style={{ background: '#eefcf0', color: '#1b7a34' }}>
              Đổi mật khẩu thành công! Mọi phiên đăng nhập cũ đã bị đăng xuất.
            </div>
            <p className="auth-switch">
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  appNavigate('/login');
                }}
              >
                Đăng nhập bằng mật khẩu mới
              </a>
            </p>
          </>
        ) : !token ? (
          <div className="auth-error" role="alert" data-testid="reset-missing-token">
            Thiếu token đặt lại mật khẩu. Hãy mở link trong email chúng tôi đã gửi.
          </div>
        ) : (
          <>
            {banner ? (
              <div className="auth-error" role="alert">
                {banner}
              </div>
            ) : null}
            <form onSubmit={onSubmit} noValidate>
              <Input
                label="Mật khẩu mới"
                type="password"
                name="newPassword"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                error={fieldError}
                data-testid="reset-password-input"
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" variant="primary" fullWidth loading={loading} data-testid="reset-submit">
                Đặt lại mật khẩu
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
