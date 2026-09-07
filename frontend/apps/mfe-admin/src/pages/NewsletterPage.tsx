import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { Button, Card, EmptyState, Skeleton, Table } from '@ecommerce/ui-kit';
import { authStore } from '@ecommerce/auth';

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

const PAGE_SIZE = 50;

export default function NewsletterPage(): ReactElement {
  const { t } = useT();
  const [data, setData] = useState<NewsletterPageDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await authStore.fetch(`/api/identity/admin/newsletter?page=${p}&size=${PAGE_SIZE}`);
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
    void load(1);
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="admin-page" data-testid="newsletter-page">
      <div className="admin-page-head">
        <h1 className="admin-page-title">{t('admin.newsletter.title')}</h1>
      </div>
      <Card>
        {loading ? (
          <Skeleton count={6} />
        ) : error ? (
          <div className="admin-error" role="alert">{error}</div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="📧" title={t('admin.newsletter.empty')} />
        ) : (
          <>
            <Table
              caption={t('admin.newsletter.title')}
              rows={data.items}
              rowKey={(row) => row.email}
              empty={<EmptyState icon="📧" title={t('admin.newsletter.empty')} />}
              columns={[
                { key: 'email', header: t('admin.newsletter.email') },
                {
                  key: 'createdAt',
                  header: t('admin.newsletter.subscribedAt'),
                  render: (row: NewsletterItem) =>
                    new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(
                      new Date(row.createdAt)
                    )
                }
              ]}
            />
            <div className="admin-pagination">
              <span>
                {t('admin.common.pageOf', { page: data.page, total: totalPages })} — {data.total}{' '}
                {t('admin.newsletter.subscribers')}
              </span>
              <Button size="sm" variant="secondary" disabled={data.page <= 1 || loading}
                onClick={() => void load(data.page - 1)}>
                ‹ {t('admin.common.prev')}
              </Button>
              <Button size="sm" variant="secondary" disabled={data.page >= totalPages || loading}
                onClick={() => void load(data.page + 1)}>
                {t('admin.common.next')} ›
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
