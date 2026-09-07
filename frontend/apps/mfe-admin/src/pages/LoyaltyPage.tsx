import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authStore } from '@ecommerce/auth';
import { executeRequest, type ApiClientOptions, type RouteDef } from '@ecommerce/contracts';
import { Badge, Button, Card, Input, Skeleton, Table, useToast, formatPrice } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';

/**
 * LoyaltyPage (SF-14, FI-324, D22): tra cứu + chỉnh điểm thủ công LIVE.
 * Endpoints ADDITIVE của affiliate-service (không nằm trong affiliate.yaml
 * frozen — cùng precedent suspend/reactivate SF-12): gọi qua executeRequest
 * với RouteDef cục bộ, KHÔNG sửa packages/contracts.
 *
 * Quy đổi (spec D3): 1 điểm = 100đ — hiển thị quy đổi VND cho tiện đối chiếu.
 */

// RouteDef additive — path khớp backend LoyaltyMeAdminController (SF-14).
const LOOKUP_ROUTE: RouteDef = ['GET', '/api/affiliate/admin/loyalty'];
const ADJUST_ROUTE: RouteDef = ['POST', '/api/affiliate/admin/loyalty/adjust'];

interface LedgerEntry {
  id: string;
  orderId: string | null;
  type: 'EARN' | 'REDEEM' | 'ADJUST';
  points: number;
  note: string | null;
  createdAt: string;
}

interface AdminLoyaltyResponse {
  account: { userId: string; balance: number; totalEarned: number };
  ledger: LedgerEntry[];
  page: number;
  size: number;
  total: number;
}

function affiliateOptions(): ApiClientOptions {
  return {
    baseURL: authStore.getConfig().identityBaseUrl ?? '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LoyaltyPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const [userIdInput, setUserIdInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [adjustPoints, setAdjustPoints] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  const lookup = useMutation({
    mutationFn: (id: string) =>
      executeRequest(affiliateOptions(), LOOKUP_ROUTE, { userId: id, page: 1, size: 10 }) as
        unknown as Promise<AdminLoyaltyResponse>,
    onSuccess: () => setLookupError(null),
    onError: () => setLookupError(t('admin.loyalty.notFound'))
  });

  const adjust = useMutation({
    mutationFn: (input: { userId: string; points: number; note: string }) =>
      executeRequest(affiliateOptions(), ADJUST_ROUTE, input) as unknown as Promise<{
        balance: number;
      }>,
    onSuccess: () => {
      toast.toast(t('admin.loyalty.adjustDone'), { variant: 'success' });
      setAdjustPoints('');
      setAdjustNote('');
      if (userId) lookup.mutate(userId);
    },
    onError: (error) => toast.toast(String(error), { variant: 'danger' })
  });

  const onLookupSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const id = userIdInput.trim();
    if (!UUID_RE.test(id)) {
      setLookupError(t('admin.loyalty.notFound'));
      return;
    }
    setUserId(id);
    lookup.mutate(id);
  };

  const onAdjustSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!userId) return;
    const points = Number(adjustPoints);
    if (!Number.isFinite(points) || points === 0) {
      toast.toast(`${t('admin.loyalty.adjustPoints')}: ±1…`, { variant: 'danger' });
      return;
    }
    adjust.mutate({ userId, points: Math.trunc(points), note: adjustNote.trim() });
  };

  const data = lookup.data;

  return (
    <div>
      <div className="admin-page-head">
        <h1>{t('admin.loyalty.title')}</h1>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>{t('admin.loyalty.lookupTitle')}</h2>
        <form onSubmit={onLookupSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, maxWidth: 480 }}>
            <Input
              label={t('admin.loyalty.lookupTitle')}
              name="userId"
              placeholder={t('admin.loyalty.lookupPh')}
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={lookup.isPending}>
            {t('admin.loyalty.lookup')}
          </Button>
        </form>
        {lookupError && (
          <p role="alert" className="admin-error-text" style={{ marginBottom: 0 }}>
            {lookupError}
          </p>
        )}
      </Card>

      {lookup.isPending && <Skeleton variant="rect" height={160} />}

      {data && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Card>
              <p className="admin-hint">{t('admin.loyalty.balance')}</p>
              <h2 style={{ margin: 0 }} data-testid="loyalty-balance">
                {data.account.balance.toLocaleString('vi-VN')} đ
              </h2>
            </Card>
            <Card>
              <p className="admin-hint">{t('admin.loyalty.totalEarned')}</p>
              <h2 style={{ margin: 0 }} data-testid="loyalty-total-earned">
                {data.account.totalEarned.toLocaleString('vi-VN')} đ
              </h2>
            </Card>
            <Card>
              <p className="admin-hint">≈ VND</p>
              <h2 style={{ margin: 0 }}>{formatPrice(data.account.balance * 100)}</h2>
            </Card>
          </div>

          <Card>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>{t('admin.loyalty.adjustTitle')}</h2>
            <form onSubmit={onAdjustSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ width: 160 }}>
                <Input
                  label={t('admin.loyalty.adjustPoints')}
                  name="points"
                  type="number"
                  step={1}
                  placeholder="+100 / -50"
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(e.target.value)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Input
                  label={t('admin.loyalty.adjustNote')}
                  name="note"
                  placeholder="gd lễ 2/9…"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" disabled={adjust.isPending}>
                {t('admin.loyalty.adjust')}
              </Button>
            </form>
          </Card>

          <Table<LedgerEntry>
            columns={[
              { key: 'createdAt', header: t('admin.common.date'), render: (row) => new Date(row.createdAt).toLocaleString('vi-VN') },
              {
                key: 'type',
                header: t('admin.common.status'),
                render: (row) => (
                  <Badge variant={row.type === 'EARN' ? 'success' : row.type === 'REDEEM' ? 'warning' : 'neutral'}>
                    {row.type}
                  </Badge>
                )
              },
              {
                key: 'points',
                header: t('admin.loyalty.adjustPoints'),
                render: (row) => (
                  <span style={{ color: row.points >= 0 ? 'var(--c-success, #189e47)' : 'var(--c-danger, #d63a2f)', fontWeight: 700 }}>
                    {row.points >= 0 ? `+${row.points}` : row.points}
                  </span>
                )
              },
              { key: 'orderId', header: t('admin.rma.colOrder'), render: (row) => (row.orderId ? `#${row.orderId.slice(0, 8).toUpperCase()}` : '—') },
              { key: 'note', header: t('admin.loyalty.adjustNote'), render: (row) => row.note ?? '—' }
            ]}
            rows={data.ledger}
            rowKey={(row) => row.id}
            empty={t('admin.loyalty.ledger')}
            caption={t('admin.common.total', { count: data.total })}
          />
        </div>
      )}
    </div>
  );
}
