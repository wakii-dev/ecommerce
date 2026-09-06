import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Badge, Button, Card, Input } from '@ecommerce/ui-kit';
import { useAuth } from '@ecommerce/auth';
import { ApiErrorClient } from '@ecommerce/contracts';
import { fetchProfile, updateProfile } from '../api';
import type { MeProfile } from '../api';
import { appNavigate, authReady } from '../bootstrap';
import './page.css';

export default function AccountPage(): ReactElement {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    // Guard CHỜ authReady (boot refresh settle) — không thì F5 tại /account
    // bị ném về /login do race (chưa kịp refresh cookie).
    authReady.then((ok) => {
      if (!alive) return;
      if (!ok) {
        appNavigate('/login');
        return;
      }
      fetchProfile()
        .then((me) => {
          if (!alive) return;
          setProfile(me);
          setFullName(me.fullName);
          setPhone(me.phone ?? '');
        })
        .catch(() => {
          // Prefill fail không chặn form — ô trống, người dùng sửa rồi Lưu.
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    setSaved(false);
    const errors: { fullName?: string } = {};
    if (fullName.trim().length < 1) errors.fullName = 'Vui lòng nhập họ tên';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    updateProfile({ fullName, phone: phone.trim() === '' ? null : phone.trim() })
      .then((me) => {
        // Profile claim trong JWT cũ không đổi — cập nhật state cục bộ;
        // tên trên header (đọc từ token) áp ở lần refresh sau.
        setProfile(me);
        setFullName(me.fullName);
        setPhone(me.phone ?? '');
        setSaved(true);
      })
      .catch((err: unknown) => {
        setBanner(err instanceof ApiErrorClient ? (err.detail ?? 'Có lỗi xảy ra') : 'Có lỗi xảy ra');
      })
      .finally(() => setLoading(false));
  };

  const email = profile?.email ?? user?.email ?? '—';
  const role = profile?.roles?.[0] ?? user?.roles?.[0] ?? 'CUSTOMER';

  return (
    <div className="auth-page">
      <div className="account-grid">
        <Card className="account-info">
          <h1 className="auth-title">Tài khoản</h1>
          <dl className="account-rows">
            <div className="account-row">
              <dt>Email</dt>
              <dd>{email}</dd>
            </div>
            <div className="account-row">
              <dt>Vai trò</dt>
              <dd>
                <Badge variant="primary">{role}</Badge>
              </dd>
            </div>
          </dl>
        </Card>
        <Card className="account-form-card">
          <h2 className="auth-subtitle">Thông tin cá nhân</h2>
          {banner ? (
            <div className="auth-error" role="alert">
              {banner}
            </div>
          ) : null}
          {saved ? (
            <div className="auth-saved" role="status">
              Đã lưu
            </div>
          ) : null}
          <form onSubmit={onSubmit} noValidate>
            <Input
              label="Họ tên"
              type="text"
              name="fullName"
              autoComplete="name"
              value={fullName}
              error={fieldErrors.fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Input
              label="Số điện thoại"
              type="tel"
              name="phone"
              autoComplete="tel"
              placeholder="0901234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={loading}>
              Lưu
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
