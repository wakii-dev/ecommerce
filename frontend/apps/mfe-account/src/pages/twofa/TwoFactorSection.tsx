import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import QRCode from 'qrcode';
import { Badge, Button, Card, Input } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { disable2fa, enable2fa, setup2fa } from '../../api';

/**
 * Section bảo mật 2FA trong /account (SF-15): BẬT (QR quét app authenticator →
 * nhập mã đầu → backup codes hiện 1 lần) · TẮT (password + mã). enabled/onChanged
 * do AccountPage truyền (đồng bộ Me.twoFactorEnabled sau mỗi thao tác).
 * SF-4 (FI-394 T4): chỉ text → keys i18n + class polish — logic GIỮ nguyên.
 */
export default function TwoFactorSection({
  enabled,
  onChanged
}: {
  enabled: boolean;
  onChanged: () => void;
}): ReactElement {
  const { t } = useT();
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

  // Duck-type ApiErrorClient (pattern chung) — fallback từ catalog (dùng chung
  // account.profile.errorGeneric — cùng chuỗi generic toàn account surface).
  const errText = (err: unknown): string =>
    err instanceof Error && err.name === 'ApiErrorClient'
      ? (err as Error & { detail?: string }).detail || err.message
      : t('account.profile.errorGeneric');

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
      <h2 className="auth-subtitle twofa-title">
        {t('account.twofa.title')}{' '}
        <Badge variant={enabled ? 'success' : 'neutral'}>
          {enabled ? t('account.twofa.enabled') : t('account.twofa.disabled')}
        </Badge>
      </h2>
      {banner ? (
        <div className="auth-error" role="alert">
          {banner}
        </div>
      ) : null}

      {!enabled && step === 'idle' ? (
        <>
          <p className="twofa-note">{t('account.twofa.noteIdle')}</p>
          <Button variant="primary" loading={loading} onClick={startSetup}>
            {t('account.twofa.enable')}
          </Button>
        </>
      ) : null}

      {!enabled && step === 'qr' ? (
        <>
          <p className="twofa-note">{t('account.twofa.noteQr')}</p>
          <div className="twofa-qr">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={t('account.twofa.qrAlt')} width={180} height={180} />
            ) : null}
            <code className="twofa-secret">{otpauthUrl.replace(/^otpauth:\/\/totp\/[^?]+\?/, '')}</code>
          </div>
          <form onSubmit={confirmEnable} noValidate>
            <Input
              label={t('account.twofa.codeLabel')}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={loading}>
              {t('account.twofa.activate')}
            </Button>
          </form>
        </>
      ) : null}

      {!enabled && step === 'codes' ? (
        <>
          <p className="twofa-note">{t('account.twofa.noteCodes')}</p>
          <ul className="twofa-codes">
            {recoveryCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <Button variant="primary" onClick={finishEnable}>
            {t('account.twofa.codesSaved')}
          </Button>
        </>
      ) : null}

      {enabled && !disableOpen ? (
        <Button variant="danger" onClick={() => setDisableOpen(true)}>
          {t('account.twofa.disable')}
        </Button>
      ) : null}

      {enabled && disableOpen ? (
        <form onSubmit={submitDisable} noValidate>
          <p className="twofa-note">{t('account.twofa.disableNote')}</p>
          <Input
            label={t('account.twofa.disablePassword')}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label={t('account.twofa.disableCode')}
            name="code"
            autoComplete="one-time-code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
          />
          <div className="twofa-actions">
            <Button type="submit" variant="danger" loading={loading}>
              {t('account.twofa.confirmDisable')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDisableOpen(false);
                setBanner(null);
              }}
            >
              {t('account.twofa.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
