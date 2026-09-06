import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { ApiErrorClient } from '@ecommerce/contracts';
import { Badge, Button, Card, Input } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';

import { appNavigate, authReady } from '../../bootstrap';
import '../../page.css';
import {
  fetchLedger,
  fetchProfile,
  registerAffiliate,
  type AffiliateProfile,
  type LedgerPage,
} from './affiliateApi';

/**
 * Affiliate dashboard (SF-12 — pack slice `pages/affiliate/*`): đăng ký
 * affiliate (PENDING chờ duyệt) → khi APPROVED: ref code + link generator
 * (copy link sản phẩm kèm ?ref=) + stats cards (clicks/conversions/earnings)
 * + bảng ledger. Guard authReady như AccountPage — guest → /login.
 * Contract affiliate.yaml (frozen): /me trả code null khi chưa APPROVED.
 */
export default function AffiliatePage(): ReactElement {
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const [ledger, setLedger] = useState<LedgerPage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false); // 404 — chưa đăng ký
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [note, setNote] = useState('');
  const [linkBase, setLinkBase] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    authReady.then(() => {
      if (!alive) return;
      if (!authStore.isAuthenticated()) {
        appNavigate('/login');
        return;
      }
      setLinkBase(window.location.origin);
      loadProfile(() => alive);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = (isAlive = (): boolean => true): void => {
    fetchProfile()
      .then((me) => {
        if (!isAlive()) return;
        setProfile(me);
        setNotFound(false);
        // APPROVED → tải luôn ledger trang 1
        if (me.status === 'APPROVED' && me.code) {
          fetchLedger()
            .then((page) => {
              if (isAlive()) setLedger(page);
            })
            .catch(() => undefined);
        }
      })
      .catch((err: unknown) => {
        if (!isAlive()) return;
        if (err instanceof ApiErrorClient && err.status === 404) {
          setNotFound(true); // chưa đăng ký — hiện form
        } else {
          setError(err instanceof Error ? err.message : 'Không tải được hồ sơ affiliate');
        }
      })
      .finally(() => {
        if (isAlive()) setLoaded(true);
      });
  };

  const onRegister = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    registerAffiliate({
      ...(portfolioUrl.trim() ? { portfolioUrl: portfolioUrl.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    })
      .then(() => {
        setNotFound(false);
        loadProfile();
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiErrorClient
            ? err.detail || err.message
            : 'Không gửi được hồ sơ — thử lại'
        );
      })
      .finally(() => setSubmitting(false));
  };

  const affiliateLink = (path: string): string => {
    const base = path.trim() || '/';
    const url = new URL(base, window.location.origin);
    url.searchParams.set('ref', profile?.code ?? '');
    return url.toString();
  };

  const copyText = async (text: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  if (!loaded) {
    return (
      <div className="auth-page">
        <Card>
          <p>Đang tải...</p>
        </Card>
    </div>
    );
  }

  // ── chưa đăng ký / bị từ chối → form đăng ký ───────────────────────────
  const showForm = notFound || profile?.status === 'REJECTED';

  return (
    <div className="auth-page">
      <h1 className="auth-title">Affiliate</h1>
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <Card>
          <h2 className="auth-subtitle">
            {profile?.status === 'REJECTED'
              ? 'Hồ sơ trước bị từ chối — bạn có thể đăng ký lại'
              : 'Đăng ký làm cộng tác viên (affiliate)'}
          </h2>
          <p style={{ color: 'var(--c-text-secondary, #555)' }}>
            Nhận link giới thiệu riêng — hoa hồng 5%/đơn (đổi theo quyết định của
            admin) cho mỗi đơn phát sinh từ link của bạn.
          </p>
          <form onSubmit={onRegister} noValidate>
            <Input
              label="Link kênh giới thiệu (blog/social)"
              type="url"
              name="portfolioUrl"
              placeholder="https://youtube.com/@kenh-cua-ban"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
            />
            <Input
              label="Giới thiệu ngắn"
              type="text"
              name="note"
              placeholder="Bạn sẽ quảng bá qua kênh nào?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={submitting}>
              Gửi hồ sơ
            </Button>
          </form>
        </Card>
      ) : profile?.status === 'PENDING' ? (
        <Card>
          <h2 className="auth-subtitle">Hồ sơ đã gửi — chờ duyệt</h2>
          <p style={{ color: 'var(--c-text-secondary, #555)' }}>
            Admin sẽ duyệt hồ sơ của bạn. Khi được duyệt bạn nhận ref code + link
            giới thiệu riêng tại trang này.
          </p>
          <Badge variant="warning">PENDING</Badge>
        </Card>
      ) : profile?.status === 'SUSPENDED' ? (
        <Card>
          <h2 className="auth-subtitle">Tài khoản affiliate tạm ngưng</h2>
          <p style={{ color: 'var(--c-text-secondary, #555)' }}>
            Link giới thiệu của bạn hiện không được theo dõi. Liên hệ admin để
            biết thêm chi tiết.
          </p>
          <Badge variant="danger">SUSPENDED</Badge>
        </Card>
      ) : profile?.status === 'APPROVED' && profile.code ? (
        <>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Card>
              <p style={{ margin: 0, color: 'var(--c-text-secondary, #555)' }}>Clicks</p>
              <h2 style={{ margin: '4px 0 0' }} data-testid="affiliate-clicks">
                {profile.stats.clicks}
              </h2>
            </Card>
            <Card>
              <p style={{ margin: 0, color: 'var(--c-text-secondary, #555)' }}>Conversions</p>
              <h2 style={{ margin: '4px 0 0' }} data-testid="affiliate-conversions">
                {profile.stats.conversions}
              </h2>
            </Card>
            <Card>
              <p style={{ margin: 0, color: 'var(--c-text-secondary, #555)' }}>Hoa hồng</p>
              <h2 style={{ margin: '4px 0 0' }} data-testid="affiliate-earnings">
                {formatPrice(profile.stats.earnings)}
              </h2>
            </Card>
          </div>

          <Card>
            <h2 className="auth-subtitle">Ref code của bạn</h2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <code
                data-testid="affiliate-code"
                style={{ fontSize: 24, letterSpacing: 4, fontWeight: 700 }}
              >
                {profile.code}
              </code>
              <Badge variant="primary">hoa hồng {profile.rate}%</Badge>
            </div>
          </Card>

          <Card>
            <h2 className="auth-subtitle">Tạo link giới thiệu</h2>
            <Input
              label="Link sản phẩm hoặc trang bất kỳ"
              type="text"
              name="linkBase"
              placeholder={`${linkBase}/p/ten-san-pham`}
              value={linkBase}
              onChange={(e) => setLinkBase(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <code
                data-testid="affiliate-link"
                style={{ wordBreak: 'break-all', flex: 1, minWidth: 240 }}
              >
                {profile.code ? affiliateLink(linkBase || '/') : ''}
              </code>
              <Button
                variant="secondary"
                onClick={() => void copyText(affiliateLink(linkBase || '/'), 'link')}
              >
                {copied === 'link' ? 'Đã copy!' : 'Copy link'}
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="auth-subtitle">Sổ hoa hồng</h2>
            {ledger && ledger.items.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Đơn</th>
                    <th style={thStyle}>Giá trị</th>
                    <th style={thStyle}>Rate</th>
                    <th style={thStyle}>Hoa hồng</th>
                    <th style={thStyle}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.items.map((entry) => (
                    <tr key={entry.id}>
                      <td style={tdStyle}>{entry.orderId.slice(0, 8)}…</td>
                      <td style={tdStyle}>{formatPrice(entry.orderTotal)}</td>
                      <td style={tdStyle}>{entry.rate}%</td>
                      <td style={tdStyle}>{formatPrice(entry.commission)}</td>
                      <td style={tdStyle}>{entry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'var(--c-text-secondary, #555)' }}>
                Chưa có hoa hồng nào — chia sẻ link và chờ đơn đầu tiên (hiện khi
                đơn được xác nhận).
              </p>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

const thStyle = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid var(--c-border, #eee)' } as const;
const tdStyle = { padding: '6px 8px', borderBottom: '1px solid var(--c-border, #eee)' } as const;
