import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Badge, Button, Card, Input } from '@ecommerce/ui-kit';
import { authStore, useAuth } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { fetchProfile, updateProfile } from '../api';
import type { MeProfile } from '../api';
import TwoFactorSection from './twofa/TwoFactorSection';
import { AccountLayout } from '../AccountLayout';
import { appNavigate, authReady } from '../bootstrap';
import '../page.css';

// Định dạng phone vi: 0 hoặc +84, theo 8-10 chữ số. Optional field — rỗng hợp lệ.
const PHONE_RE = /^(0|\+84)\d{8,10}$/;

export default function AccountPage(): ReactElement {
  const { t } = useT();
  const { user } = useAuth();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [touched, setTouched] = useState<{ fullName?: boolean; phone?: boolean }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    // Guard CHỜ authReady (boot refresh settle) — không thì F5 tại /account
    // bị ném về /login do race (chưa kịp refresh cookie).
    authReady.then(() => {
      if (!alive) return;
      // authReady settle MỘT LẦN lúc boot — guest boot (refresh fail → false) rồi
      // SPA login thành công vẫn thấy false cũ → bị ném về /login oan.
      // Quyết theo state HIỆN TẠI; chờ authReady vẫn cần (boot refresh kịp xong).
      if (!authStore.isAuthenticated()) {
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

  // SF-4 T4: validate realtime on-blur — pattern trang auth (T2): validateField
  // thuần string, error hiện khi field đã chạm (blur/submit), onChange sau chạm
  // re-validate. Phone optional — rỗng hợp lệ, có nhập thì phải khớp format vi.
  const validateField = (field: 'fullName' | 'phone', value: string): string | undefined => {
    if (field === 'fullName') return value.trim().length >= 1 ? undefined : t('account.profile.fullNameRequired');
    if (value.trim() === '') return undefined;
    return PHONE_RE.test(value.trim()) ? undefined : t('account.profile.phoneInvalid');
  };

  const onBlurField = (field: 'fullName' | 'phone', value: string): void => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
  };

  const onChangeField = (field: 'fullName' | 'phone', value: string): void => {
    if (field === 'fullName') setFullName(value);
    else setPhone(value);
    if (touched[field]) setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    setSaved(false);
    // Submit = validate tất cả + touch tất cả (pattern T2). API shape GIỮ nguyên.
    const errors: { fullName?: string; phone?: string } = {
      fullName: validateField('fullName', fullName),
      phone: validateField('phone', phone)
    };
    setTouched({ fullName: true, phone: true });
    setFieldErrors(errors);
    if (errors.fullName || errors.phone) return;

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
        // Duck-type thay vì instanceof — @ecommerce/contracts không phải shared
        // singleton qua MF boundary, class của thrower khác class của remote.
        setBanner(
          err instanceof Error && err.name === 'ApiErrorClient'
            ? (err as Error & { detail?: string }).detail || err.message
            : t('account.profile.errorGeneric')
        );
      })
      .finally(() => setLoading(false));
  };

  const email = profile?.email ?? user?.email ?? '—';
  const role = profile?.roles?.[0] ?? user?.roles?.[0] ?? 'CUSTOMER';
  // Role badge: tint + label theo role; giá trị lạ → fallback raw role (neutral).
  const ROLE_BADGE: Record<string, { variant: 'neutral' | 'primary'; labelKey: string }> = {
    CUSTOMER: { variant: 'neutral', labelKey: 'account.profile.roleCustomer' },
    ADMIN: { variant: 'primary', labelKey: 'account.profile.roleAdmin' }
  };
  const roleMeta = ROLE_BADGE[role] ?? { variant: 'neutral' as const, labelKey: '' };

  return (
    <AccountLayout active="account">
      <div className="account-grid">
        <Card className="account-info">
          <h1 className="auth-title">{t('account.profile.title')}</h1>
          <dl className="account-rows">
            <div className="account-row">
              <dt>{t('account.profile.email')}</dt>
              <dd>{email}</dd>
            </div>
            <div className="account-row">
              <dt>{t('account.profile.role')}</dt>
              <dd>
                <Badge variant={roleMeta.variant}>
                  {roleMeta.labelKey ? t(roleMeta.labelKey) : role}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>
        <Card className="account-form-card">
          <h2 className="auth-subtitle">{t('account.profile.personalInfo')}</h2>
          {banner ? (
            <div className="auth-error" role="alert">
              {banner}
            </div>
          ) : null}
          {saved ? (
            <div className="auth-saved" role="status">
              {t('account.profile.saved')}
            </div>
          ) : null}
          <form onSubmit={onSubmit} noValidate>
            <Input
              label={t('account.profile.fullName')}
              type="text"
              name="fullName"
              autoComplete="name"
              value={fullName}
              error={fieldErrors.fullName}
              onBlur={(e) => onBlurField('fullName', e.target.value)}
              onChange={(e) => onChangeField('fullName', e.target.value)}
            />
            <Input
              label={t('account.profile.phone')}
              type="tel"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t('account.profile.phonePlaceholder')}
              value={phone}
              error={fieldErrors.phone}
              onBlur={(e) => onBlurField('phone', e.target.value)}
              onChange={(e) => onChangeField('phone', e.target.value)}
            />
            <Button type="submit" variant="primary" loading={loading}>
              {t('account.profile.save')}
            </Button>
          </form>
        </Card>
        {/* SF-15 (FI-325): bảo mật hai lớp — bật/tắt 2FA, sync qua fetchProfile. */}
        <TwoFactorSection
          enabled={profile?.twoFactorEnabled ?? false}
          onChanged={() => {
            fetchProfile().then(setProfile).catch(() => undefined);
          }}
        />
      </div>
    </AccountLayout>
  );
}
