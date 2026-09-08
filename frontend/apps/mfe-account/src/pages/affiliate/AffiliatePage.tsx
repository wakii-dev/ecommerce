import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { ApiErrorClient } from '@ecommerce/contracts';
import { Badge, Button, Card, Input, ListSkeleton, Table } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import type { TableColumn } from '@ecommerce/ui-kit';

import { AccountLayout } from '../../AccountLayout';
import { appNavigate, authReady } from '../../bootstrap';
import '../../page.css';
import {
  fetchLedger,
  fetchProfile,
  registerAffiliate,
  type AffiliateProfile,
  type LedgerEntry,
  type LedgerPage,
} from './affiliateApi';
import LoyaltyPointsSection from './LoyaltyPointsSection'; // SF-14 (FI-324) chắp section điểm

/**
 * Affiliate dashboard (SF-12 — pack slice `pages/affiliate/*`): đăng ký
 * affiliate (PENDING chờ duyệt) → khi APPROVED: ref code + link generator
 * (copy link sản phẩm kèm ?ref=) + stats cards (clicks/conversions/earnings)
 * + bảng ledger. Guard authReady như AccountPage — guest → /login.
 * Contract affiliate.yaml (frozen): /me trả code null khi chưa APPROVED.
 * SF-4 (FI-394 T9): stats → KPI pattern (§2.5/§4), ledger → Table primitive
 * (pill map ĐÚNG enum 2 giá trị PENDING|CONFIRMED, lạ → family cancelled),
 * i18n `account.affiliate.*`. Trạng thái ledger render RAW enum (giống
 * hiện trạng — server value, không có label vi chính thức).
 */

/** Ledger status → pill class; enum CHỈ 2 giá trị — giá trị lạ fallback đỏ. */
const STATUS_PILL: Record<string, string> = {
  PENDING: 'pill pill--pending',
  CONFIRMED: 'pill pill--confirmed',
};

function AffiliatePageContent({ hash }: { hash: string }): ReactElement {
  const { t } = useT();
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
          setError(
            err instanceof Error ? err.message : t('account.affiliate.errorLoad')
          );
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
            : t('account.affiliate.errorSubmit')
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
      <div className="acc-content">
        <ListSkeleton count={1} />
      </div>
    );
  }

  // ── chưa đăng ký / bị từ chối → form đăng ký ───────────────────────────
  const showForm = notFound || profile?.status === 'REJECTED';

  const ledgerColumns: TableColumn<LedgerEntry>[] = [
    {
      key: 'orderId',
      header: t('account.affiliate.colOrder'),
      render: (entry) => (
        <span className="af-order-id">{entry.orderId.slice(0, 8)}…</span>
      ),
    },
    {
      key: 'orderTotal',
      header: t('account.affiliate.colValue'),
      align: 'right',
      render: (entry) => formatPrice(entry.orderTotal),
    },
    {
      key: 'rate',
      header: t('account.affiliate.colRate'),
    },
    {
      key: 'commission',
      header: t('account.affiliate.colCommission'),
      align: 'right',
      render: (entry) => (
        <span className="af-commission">{formatPrice(entry.commission)}</span>
      ),
    },
    {
      key: 'status',
      header: t('account.affiliate.colStatus'),
      render: (entry) => (
        <span className={STATUS_PILL[entry.status] ?? 'pill pill--cancelled'}>
          {entry.status}
        </span>
      ),
    },
  ];

  return (
    <div className="acc-content">
      <h1 className="acc-page-title">{t('account.affiliate.title')}</h1>
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}

      {/* SF-14 (FI-324): block điểm thưởng — hiện cho mọi user đã đăng nhập */}
      <LoyaltyPointsSection hash={hash} />

      {showForm ? (
        <Card>
          <h2 className="auth-subtitle">
            {profile?.status === 'REJECTED'
              ? t('account.affiliate.rejectedRetry')
              : t('account.affiliate.registerTitle')}
          </h2>
          <p className="af-desc">{t('account.affiliate.registerDesc')}</p>
          <form onSubmit={onRegister} noValidate>
            <Input
              label={t('account.affiliate.portfolioLabel')}
              type="url"
              name="portfolioUrl"
              placeholder={t('account.affiliate.portfolioPlaceholder')}
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
            />
            <Input
              label={t('account.affiliate.noteLabel')}
              type="text"
              name="note"
              placeholder={t('account.affiliate.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={submitting}>
              {t('account.affiliate.submit')}
            </Button>
          </form>
        </Card>
      ) : profile?.status === 'PENDING' ? (
        <Card>
          <h2 className="auth-subtitle">{t('account.affiliate.pendingTitle')}</h2>
          <p className="af-desc">{t('account.affiliate.pendingDesc')}</p>
          <Badge variant="warning">PENDING</Badge>
        </Card>
      ) : profile?.status === 'SUSPENDED' ? (
        <Card>
          <h2 className="auth-subtitle">{t('account.affiliate.suspendedTitle')}</h2>
          <p className="af-desc">{t('account.affiliate.suspendedDesc')}</p>
          <Badge variant="danger">SUSPENDED</Badge>
        </Card>
      ) : profile?.status === 'APPROVED' && profile.code ? (
        <>
          <div className="af-kpis">
            <Card>
              <p className="af-kpi__label">{t('account.affiliate.statsClicks')}</p>
              <p className="af-kpi__value" data-testid="affiliate-clicks">
                {profile.stats.clicks}
              </p>
            </Card>
            <Card>
              <p className="af-kpi__label">{t('account.affiliate.statsConversions')}</p>
              <p className="af-kpi__value" data-testid="affiliate-conversions">
                {profile.stats.conversions}
              </p>
            </Card>
            <Card>
              <p className="af-kpi__label">{t('account.affiliate.statsEarnings')}</p>
              <p className="af-kpi__value" data-testid="affiliate-earnings">
                {formatPrice(profile.stats.earnings)}
              </p>
            </Card>
          </div>

          <Card>
            <h2 className="auth-subtitle">{t('account.affiliate.refCode')}</h2>
            <div className="af-code-row">
              <code data-testid="affiliate-code" className="af-code">
                {profile.code}
              </code>
              <Badge variant="primary">
                {t('account.affiliate.rateBadge', { rate: profile.rate })}
              </Badge>
            </div>
          </Card>

          <Card>
            <h2 className="auth-subtitle">{t('account.affiliate.linkTitle')}</h2>
            <Input
              label={t('account.affiliate.linkLabel')}
              type="text"
              name="linkBase"
              placeholder={`${linkBase}/p/ten-san-pham`}
              value={linkBase}
              onChange={(e) => setLinkBase(e.target.value)}
            />
            <div className="af-code-row">
              <code data-testid="affiliate-link" className="af-link">
                {profile.code ? affiliateLink(linkBase || '/') : ''}
              </code>
              <Button
                variant="secondary"
                onClick={() => void copyText(affiliateLink(linkBase || '/'), 'link')}
              >
                {copied === 'link'
                  ? t('account.affiliate.copied')
                  : t('account.affiliate.copyLink')}
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="auth-subtitle">{t('account.affiliate.ledger')}</h2>
            {ledger && ledger.items.length > 0 ? (
              <Table
                className="af-ledger"
                columns={ledgerColumns}
                rows={ledger.items}
                rowKey={(entry) => entry.id}
              />
            ) : (
              <p className="af-desc">{t('account.affiliate.ledgerEmpty')}</p>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

/**
 * SF-4 (FI-394 T1/T9/T9-fix): side-nav layout; active + scroll THEO HASH STATE,
 * không đọc location lúc render một lần. appNavigate('/account/affiliate#loyalty')
 * là pushState CÙNG pathname → shell usePath không re-render page → mount-only
 * read không bao giờ thấy hash mới (browser-verify FAIL 2/11). Hash là state +
 * listener 'popstate' (appNavigate dispatch PopStateEvent thủ công trong
 * router.tsx navigate()) VÀ 'hashchange' (back/forward, edit URL) → active
 * (plan §4: 2 item affiliate/loyalty không active đồng thời) + hash truyền
 * xuống LoyaltyPointsSection cho scrollIntoView.
 */
export default function AffiliatePage(): ReactElement {
  const [hash, setHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash
  );

  useEffect(() => {
    const syncHash = (): void => setHash(window.location.hash);
    window.addEventListener('popstate', syncHash);
    window.addEventListener('hashchange', syncHash);
    return () => {
      window.removeEventListener('popstate', syncHash);
      window.removeEventListener('hashchange', syncHash);
    };
  }, []);

  const active = hash === '#loyalty' ? 'loyalty' : 'affiliate';
  return (
    <AccountLayout active={active}>
      <AffiliatePageContent hash={hash} />
    </AccountLayout>
  );
}
