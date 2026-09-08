import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Card, Input } from '@ecommerce/ui-kit';
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
  const [code, setCode] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const challenge = sessionStorage.getItem(TWOFA_CHALLENGE_KEY) ?? '';

  useEffect(() => {
    if (!challenge) appNavigate('/login');
  }, [challenge]);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    if (!/^\d{6}$/.test(code.trim()) && code.trim().length !== 8) {
      setBanner('Nhập mã 6 số (app authenticator) hoặc mã dự phòng 8 ký tự');
      return;
    }
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
            : 'Xác thực không thành công — thử lại'
        );
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1 className="auth-title">Xác thực hai lớp</h1>
        {banner ? (
          <div className="auth-error" role="alert">
            {banner}
          </div>
        ) : null}
        <form onSubmit={onSubmit} noValidate>
          <Input
            label="Mã xác thực"
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="123456 hoặc mã dự phòng"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            Xác nhận
          </Button>
        </form>
      </Card>
    </div>
  );
}
