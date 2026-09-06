import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, Input } from '@ecommerce/ui-kit';
import { login } from '../api';
import { appNavigate } from '../bootstrap';
import './page.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage(): ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    // Validation client-side TRƯỚC submit — lỗi hiện dưới field, không gọi API.
    const errors: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) errors.email = 'Email không hợp lệ';
    if (password.length < 8) errors.password = 'Mật khẩu tối thiểu 8 ký tự';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    login({ email, password })
      .then(() => appNavigate('/account'))
      .catch((err: unknown) => {
        // Duck-type thay vì instanceof — @ecommerce/contracts không phải shared
        // singleton qua MF boundary, class của thrower khác class của remote.
        setBanner(
          err instanceof Error && err.name === 'ApiErrorClient'
            ? (err as Error & { detail?: string }).detail || err.message
            : 'Có lỗi xảy ra — thử lại'
        );
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">Đăng nhập</h1>
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
            error={fieldErrors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Mật khẩu"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            error={fieldErrors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            Đăng nhập
          </Button>
        </form>
        <p className="auth-switch">
          Chưa có tài khoản?{' '}
          <a
            href="/register"
            onClick={(e) => {
              e.preventDefault();
              appNavigate('/register');
            }}
          >
            Đăng ký
          </a>
        </p>
      </Card>
    </div>
  );
}
