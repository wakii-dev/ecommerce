import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { Button, Card, EmptyState } from '@ecommerce/ui-kit';
import { authStore } from '@ecommerce/auth';
import { DataTable } from '../components/DataTable';
import { PageSizeSelect } from '../components/PageSizeSelect';

/**
 * Danh sách subscriber (SF-13 A8, D21) — GET /api/identity/admin/newsletter
 * (ADMIN). Không contracts client cho endpoint runtime-additive → authed fetch.
 */

interface NewsletterItem {
  email: string;
  createdAt: string;
}

interface NewsletterPageDto {
  items: NewsletterItem[];
  page: number;
  size: number;
  total: number;
}

const DEFAULT_PAGE_SIZE = 50;

export default function NewsletterPage(): ReactElement {
  const { t } = useT();
  const [data, setData] = useState<NewsletterPageDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const load = useCallback(async (p: number, size: number): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await authStore.fetch(`/api/identity/admin/newsletter?page=${p}&size=${size}`);
      if (!res.ok) throw new Error(t('admin.common.error'));
      setData((await res.json()) as NewsletterPageDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.common.error'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  useEffect(() => {
    void load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const changePageSize = (n: number): void => {
    setPageSize(n);
    void load(1, n);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const columns = [
    {
      key: 'email',
      header: t('admin.newsletter.email'),
      sortValue: (row: NewsletterItem) => row.email
    },
    {
      key: 'createdAt',
      header: t('admin.newsletter.subscribedAt'),
      sortValue: (row: NewsletterItem) => row.createdAt,
      render: (row: NewsletterItem) =>
        new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(
          new Date(row.createdAt)
        )
    }
  ];

  return (
    <div className="admin-page" data-testid="newsletter-page">
      <div className="admin-page-head">
        <h1 className="admin-page-title">{t('admin.newsletter.title')}</h1>
      </div>
      <Card>
        {loading ? (
          <DataTable loading columns={columns} rows={[]} />
        ) : error ? (
          <div className="admin-error" role="alert">{error}</div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="📧" title={t('admin.newsletter.empty')} />
        ) : (
          <>
            <DataTable
              caption={t('admin.newsletter.title')}
              rows={data.items}
              rowKey={(row) => row.email}
              empty={<EmptyState icon="📧" title={t('admin.newsletter.empty')} />}
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
                {t('admin.newsletter.subscribers')}
              </span>
              <Button size="sm" variant="secondary" disabled={data.page <= 1 || loading}
                onClick={() => void load(data.page - 1, pageSize)}>
                ‹ {t('admin.common.prev')}
              </Button>
              <Button size="sm" variant="secondary" disabled={data.page >= totalPages || loading}
                onClick={() => void load(data.page + 1, pageSize)}>
                {t('admin.common.next')} ›
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
