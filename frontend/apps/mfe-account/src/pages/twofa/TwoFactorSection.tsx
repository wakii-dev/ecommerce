import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import QRCode from 'qrcode';
import { Badge, Button, Card, Input } from '@ecommerce/ui-kit';
import { disable2fa, enable2fa, setup2fa } from '../../api';

/**
 * Section bảo mật 2FA trong /account (SF-15): BẬT (QR quét app authenticator →
 * nhập mã đầu → backup codes hiện 1 lần) · TẮT (password + mã). enabled/onChanged
 * do AccountPage truyền (đồng bộ Me.twoFactorEnabled sau mỗi thao tác).
 */
export default function TwoFactorSection({
  enabled,
  onChanged
}: {
  enabled: boolean;
  onChanged: () => void;
}): ReactElement {
  const [step, setStep] = useState<'idle' | 'qr' | 'codes'>('idle');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // QR render client-side (secret không rời thiết bị qua dịch vụ QR ngoài).
  useEffect(() => {
    if (step !== 'qr' || !otpauthUrl) return;
    let alive = true;
    QRCode.toDataURL(otpauthUrl, { width: 180, margin: 1 })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => {
        if (alive) setQrDataUrl(''); // QR lỗi → vẫn còn mã Base32 nhập tay
      });
    return () => {
      alive = false;
    };
  }, [step, otpauthUrl]);

  const startSetup = (): void => {
    setBanner(null);
    setLoading(true);
    setup2fa()
      .then((res) => {
        setOtpauthUrl(res.otpauthUrl);
        setStep('qr');
      })
      .catch((err: unknown) => setBanner(errText(err)))
      .finally(() => setLoading(false));
  };

  const confirmEnable = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    setLoading(true);
    enable2fa(code.trim())
      .then((res) => {
        setRecoveryCodes(res.recoveryCodes);
        setStep('codes');
      })
      .catch((err: unknown) => setBanner(errText(err)))
      .finally(() => setLoading(false));
  };

  const finishEnable = (): void => {
    setStep('idle');
    setCode('');
    setRecoveryCodes([]);
    setOtpauthUrl('');
    onChanged();
  };

  const submitDisable = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBanner(null);
    setLoading(true);
    disable2fa(password, disableCode.trim())
      .then(() => {
        setDisableOpen(false);
        setPassword('');
        setDisableCode('');
        onChanged();
      })
      .catch((err: unknown) => setBanner(errText(err)))
      .finally(() => setLoading(false));
  };

  return (
    <Card className="account-form-card">
      <h2 className="auth-subtitle">
        Bảo mật hai lớp{' '}
        <Badge variant={enabled ? 'success' : 'neutral'}>{enabled ? 'Đang bật' : 'Đang tắt'}</Badge>
      </h2>
      {banner ? (
        <div className="auth-error" role="alert">
          {banner}
        </div>
      ) : null}

      {!enabled && step === 'idle' ? (
        <>
          <p className="twofa-note">Chống truy cập trái phép — mỗi lần đăng nhập sẽ hỏi mã từ app authenticator.</p>
          <Button variant="primary" loading={loading} onClick={startSetup}>
            Bật 2FA
          </Button>
        </>
      ) : null}

      {!enabled && step === 'qr' ? (
        <>
          <p className="twofa-note">Quét mã bằng Google Authenticator / Authy, rồi nhập mã 6 số hiện tại.</p>
          <div className="twofa-qr">
            {qrDataUrl ? <img src={qrDataUrl} alt="Mã QR đăng ký 2FA" width={180} height={180} /> : null}
            <code className="twofa-secret">{otpauthUrl.replace(/^otpauth:\/\/totp\/[^?]+\?/, '')}</code>
          </div>
          <form onSubmit={confirmEnable} noValidate>
            <Input
              label="Mã 6 số trong app"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={loading}>
              Kích hoạt
            </Button>
          </form>
        </>
      ) : null}

      {!enabled && step === 'codes' ? (
        <>
          <p className="twofa-note">
            Lưu lại mã dự phòng — mỗi mã dùng được <strong>1 lần</strong> khi mất điện thoại. Không hiện lại lần nữa.
          </p>
          <ul className="twofa-codes">
            {recoveryCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <Button variant="primary" onClick={finishEnable}>
            Tôi đã lưu mã dự phòng
          </Button>
        </>
      ) : null}

      {enabled && !disableOpen ? (
        <Button variant="danger" onClick={() => setDisableOpen(true)}>
          Tắt 2FA
        </Button>
      ) : null}

      {enabled && disableOpen ? (
        <form onSubmit={submitDisable} noValidate>
          <p className="twofa-note">Cần mật khẩu + một mã 2FA (app hoặc mã dự phòng) để tắt.</p>
          <Input
            label="Mật khẩu"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Mã 2FA"
            name="code"
            autoComplete="one-time-code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
          />
          <div className="twofa-actions">
            <Button type="submit" variant="danger" loading={loading}>
              Xác nhận tắt
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDisableOpen(false);
                setBanner(null);
              }}
            >
              Hủy
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

function errText(err: unknown): string {
  return err instanceof Error && err.name === 'ApiErrorClient'
    ? (err as Error & { detail?: string }).detail || err.message
    : 'Có lỗi xảy ra — thử lại';
}
