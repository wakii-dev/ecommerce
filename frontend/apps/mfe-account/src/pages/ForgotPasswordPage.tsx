import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, Input } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import '../page.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Quên mật khẩu (SF-13 A1) — POST /api/identity/password/forgot.
 * Contract: LUÔN 202 kể cả email không tồn tại (anti-enumeration) →
 * banner thành công chung, không tiết lộ email có tài khoản hay không.
 */
export default function ForgotPasswordPage(): ReactElement {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError('Email không hợp lệ');
      return;
    }
    setFieldError(undefined);
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
        setBanner('Có lỗi xảy ra — thử lại');
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">Quên mật khẩu</h1>
        {sent ? (
          <>
            <div className="auth-error" role="status" data-testid="forgot-sent" style={{ background: '#eefcf0', color: '#1b7a34' }}>
              Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu. Kiểm tra hộp thư (kể cả Spam).
            </div>
            <p className="auth-switch">
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  appNavigate('/login');
                }}
              >
                Về trang đăng nhập
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
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="ban@example.com"
                value={email}
                error={fieldError}
                data-testid="forgot-email"
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" variant="primary" fullWidth loading={loading} data-testid="forgot-submit">
                Gửi link đặt lại mật khẩu
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
                Về trang đăng nhập
              </a>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
