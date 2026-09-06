import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, Input } from '@ecommerce/ui-kit';
import { ApiErrorClient } from '@ecommerce/contracts';
import { register } from '../api';
import { appNavigate } from '../bootstrap';
import './page.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage(): ReactElement {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    // Validation client-side TRƯỚC submit — email format, password ≥8, fullName ≥1.
    const errors: { fullName?: string; email?: string; password?: string } = {};
    if (fullName.trim().length < 1) errors.fullName = 'Vui lòng nhập họ tên';
    if (!EMAIL_RE.test(email.trim())) errors.email = 'Email không hợp lệ';
    if (password.length < 8) errors.password = 'Mật khẩu tối thiểu 8 ký tự';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    register({ email, password, fullName })
      .then(() => appNavigate('/account')) // register auto-login (packages/auth)
      .catch((err: unknown) => {
        if (err instanceof ApiErrorClient) {
          setBanner(err.status === 409 ? 'Email đã tồn tại' : (err.detail ?? 'Có lỗi xảy ra'));
        } else {
          setBanner('Có lỗi xảy ra');
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">Đăng ký</h1>
        {banner ? (
          <div className="auth-error" role="alert">
            {banner}
          </div>
        ) : null}
        <form onSubmit={onSubmit} noValidate>
          <Input
            label="Họ tên"
            type="text"
            name="fullName"
            autoComplete="name"
            placeholder="Nguyen Van A"
            value={fullName}
            error={fieldErrors.fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
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
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
            value={password}
            error={fieldErrors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            Đăng ký
          </Button>
        </form>
        <p className="auth-switch">
          Đã có tài khoản?{' '}
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              appNavigate('/login');
            }}
          >
            Đăng nhập
          </a>
        </p>
      </Card>
    </div>
  );
}
