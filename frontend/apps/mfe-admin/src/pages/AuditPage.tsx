import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { Button, Card, EmptyState, Input } from '@ecommerce/ui-kit';
import { authStore } from '@ecommerce/auth';
import { DataTable } from '../components/DataTable';
import { PageSizeSelect } from '../components/PageSizeSelect';

/**
 * Audit log viewer (SF-13 A5, D21) — đọc event_log qua log-service
 * `GET /api/log/admin/events` (ADMIN — gateway admin-prefix + service guard).
 * Không có contracts client cho log-service → authed fetch trực tiếp
 * (same-origin gateway qua vite proxy / proxy shell).
 */

interface EventLogItem {
  id: string;
  eventId: string;
  eventType: string;
  occurredAt: string;
  correlationId: string | null;
  payload: unknown;
}

interface EventLogPage {
  items: EventLogItem[];
  page: number;
  size: number;
  total: number;
}

const DEFAULT_PAGE_SIZE = 50;

export default function AuditPage(): ReactElement {
  const { t } = useT();
  const [eventType, setEventType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<EventLogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState({
    eventType: '',
    from: '',
    to: '',
    page: 1,
    size: DEFAULT_PAGE_SIZE
  });

  const load = useCallback(async (q: typeof query): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.eventType.trim()) params.set('eventType', q.eventType.trim());
      if (q.from) params.set('from', new Date(q.from).toISOString());
      if (q.to) params.set('to', new Date(q.to).toISOString());
      params.set('page', String(q.page));
      params.set('size', String(q.size));
      const res = await authStore.fetch(`/api/log/admin/events?${params.toString()}`);
      if (!res.ok) {
        throw new Error(t('admin.common.error'));
      }
      setData((await res.json()) as EventLogPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.common.error'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Load lần đầu
  useEffect(() => {
    void load(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const next = { eventType, from, to, page: 1, size: query.size };
    setQuery(next);
    void load(next);
  };

  const goPage = (next: number): void => {
    const q = { ...query, page: next };
    setQuery(q);
    void load(q);
  };

  const changePageSize = (n: number): void => {
    const q = { ...query, page: 1, size: n };
    setQuery(q);
    void load(q);
  };

  const pageSize = query.size;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const columns = [
    {
      key: 'occurredAt',
      header: t('admin.audit.time'),
      sortValue: (row: EventLogItem) => row.occurredAt,
      render: (row: EventLogItem) => formatTime(row.occurredAt)
    },
    {
      key: 'eventType',
      header: t('admin.audit.eventTypeCol'),
      sortValue: (row: EventLogItem) => row.eventType
    },
    { key: 'correlationId', header: t('admin.audit.correlation') },
    {
      key: 'payload',
      header: t('admin.audit.payload'),
      render: (row: EventLogItem) => (
        <code style={{ fontSize: 12 }} title={JSON.stringify(row.payload)}>
          {JSON.stringify(row.payload).slice(0, 120)}
          {JSON.stringify(row.payload).length > 120 ? '…' : ''}
        </code>
      )
    }
  ];

  return (
    <div className="admin-page" data-testid="audit-page">
      <div className="admin-page-head">
        <h1 className="admin-page-title">{t('admin.audit.title')}</h1>
      </div>

      <Card>
        <form className="admin-filters" onSubmit={onSubmit}>
          <Input
            label={t('admin.audit.eventType')}
            placeholder="order.confirmed"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            data-testid="audit-filter-event-type"
          />
          <Input
            label={t('admin.audit.from')}
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-testid="audit-filter-from"
          />
          <Input
            label={t('admin.audit.to')}
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-testid="audit-filter-to"
          />
          <Button type="submit" variant="primary" disabled={loading} data-testid="audit-apply">
            {t('admin.audit.apply')}
          </Button>
        </form>

        {loading ? (
          <DataTable loading columns={columns} rows={[]} />
        ) : error ? (
          <div className="admin-error" role="alert">{error}</div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon="🗂️"
            title={t('admin.audit.empty')}
            description={t('admin.audit.emptyDesc')}
          />
        ) : (
          <>
            <DataTable
              caption={t('admin.audit.title')}
              rows={data.items}
              rowKey={(row) => row.id}
              empty={<EmptyState icon="🗂️" title={t('admin.audit.empty')} />}
              columns={columns}
            />
            <div className="admin-pagination">
              <PageSizeSelect
                value={pageSize}
                onChange={changePageSize}
                label={t('admin.common.pageSize')}
              />
              <span>
                {t('admin.common.pageOf', { page: data.page, total: totalPages })} — {data.total}{' '}
                {t('admin.audit.events')}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page <= 1 || loading}
                onClick={() => goPage(data.page - 1)}
                data-testid="audit-prev"
              >
                ‹ {t('admin.common.prev')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page >= totalPages || loading}
                onClick={() => goPage(data.page + 1)}
                data-testid="audit-next"
              >
                {t('admin.common.next')} ›
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
}
