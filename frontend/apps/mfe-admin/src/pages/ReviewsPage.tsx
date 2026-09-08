import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, EmptyState, Icon, Pagination, Select, StarRating, useToast } from '@ecommerce/ui-kit';
import { DataTable } from '../components/DataTable';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { catalogApi } from '../lib/api';
import { useClientSort } from '../lib/tableSort';
import type { SortAccessor } from '../lib/tableSort';
import { formatDateTime } from '../lib/format';
import type { ModerationStatus, AdminReview } from '../lib/types';

// SF-10: reviews LIVE — productId resolve tên qua adminListProducts 1 lần
// (map id→name); review shape khớp ReviewAdmin (catalog.yaml).

export default function ReviewsPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ModerationStatus | ''>('PENDING');

  const reviewsQuery = useQuery({
    queryKey: ['admin-reviews', status],
    queryFn: async () => {
      const res = (await catalogApi().adminListReviews({
        ...(status ? { status } : {}),
        page: 1,
        size: 100
      })) as { items: AdminReview[]; total: number };
      return res.items;
    }
  });

  // map productId → tên (adminListProducts size 100 — seed 24 products)
  const productNamesQuery = useQuery({
    queryKey: ['admin-reviews', 'product-names'],
    queryFn: async () => {
      const res = (await catalogApi().adminListProducts({ page: 1, size: 100 })) as {
        items: { id: string; name: { vi?: string } }[];
      };
      const map: Record<string, string> = {};
      for (const p of res.items) map[p.id] = p.name?.vi ?? p.id;
      return map;
    },
    staleTime: 5 * 60 * 1000
  });

  function productName(productId: string): string {
    return productNamesQuery.data?.[productId] ?? productId;
  }

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
  };

  const moderate = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      action === 'approve'
        ? catalogApi().adminApproveReview({ id })
        : catalogApi().adminRejectReview({ id }),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.toast(
        vars.action === 'approve' ? t('admin.reviews.approved') : t('admin.reviews.rejected'),
        { variant: 'success' }
      );
    },
    onError: (error) => toast.toast(String(error), { variant: 'danger' })
  });

  // server đã lọc theo status; giữ shape mảng cho render
  const rows = reviewsQuery.data ?? [];

  // Load-all (size 100) → sort client (useClientSort) rồi slice trang hiện tại
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sort, sortedRows, toggleSort } = useClientSort<AdminReview>(rows);
  const onSortToggle = (key: string, accessor: SortAccessor<AdminReview>): void => {
    // sort→slice trên toàn bộ rows đã load → trang hiện tại vẫn hợp lệ khi sort
    toggleSort(key, accessor);
  };
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  // render-clamp: moderate (approve/reject) gỡ row khỏi list → page cũ có thể
  // vượt totalPages (bảng trắng) — clamp lúc render, không effect.
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedRows, safePage, pageSize]
  );

  const columns = [
    {
      key: 'rating',
      header: t('admin.reviews.rating'),
      sortValue: (row: AdminReview) => row.rating,
      render: (row: AdminReview) => <StarRating value={row.rating} />
    },
    {
      key: 'product',
      header: t('admin.reviews.product'),
      render: (row: AdminReview) => (
        <div>
          <div style={{ fontWeight: 600 }}>{productName(row.productId)}</div>
          {row.verifiedPurchase && (
            <Badge variant='success'>{t('admin.reviews.verified')}</Badge>
          )}
        </div>
      )
    },
    {
      key: 'user',
      header: t('admin.reviews.user'),
      render: (row: AdminReview) => (
        <div>
          <div>{row.userName}</div>
          <div className='admin-hint'>{formatDateTime(row.createdAt)}</div>
        </div>
      )
    },
    {
      key: 'content',
      header: t('admin.reviews.content'),
      render: (row: AdminReview) => (
        <div style={{ minWidth: 200 }}>
          {row.title !== undefined && row.title !== '' && (
            <div style={{ fontWeight: 600 }}>{row.title}</div>
          )}
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{row.content}</p>
        </div>
      )
    },
    {
      key: 'status',
      header: t('admin.common.status'),
      render: (row: AdminReview) =>
        row.status !== 'PENDING' ? (
          <Badge variant={row.status === 'APPROVED' ? 'primary' : 'danger'}>
            {t(`admin.status.${row.status}`)}
          </Badge>
        ) : null
    },
    {
      key: 'createdAt',
      header: t('admin.common.date'),
      sortValue: (row: AdminReview) => row.createdAt,
      render: (row: AdminReview) => formatDateTime(row.createdAt)
    },
    {
      key: 'actions',
      header: t('admin.common.actions'),
      render: (row: AdminReview) =>
        row.status === 'PENDING' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size='sm'
              onClick={() => moderate.mutate({ id: row.id, action: 'approve' })}
              disabled={moderate.isPending}
            >
              <Icon name='check' size={14} /> {t('admin.reviews.approve')}
            </Button>
            <Button
              size='sm'
              variant='danger'
              onClick={() => moderate.mutate({ id: row.id, action: 'reject' })}
              disabled={moderate.isPending}
            >
              <Icon name='x' size={14} /> {t('admin.reviews.reject')}
            </Button>
          </div>
        ) : null
    }
  ];

  return (
    <div>
      <div className='admin-page-head'>
        <h1>{t('admin.reviews.title')}</h1>
        <div className='admin-page-head__actions'>
          <Select
            value={status}
            onChange={(e) => {
              setPage(1); // status đổi → data set đổi hoàn toàn
              setStatus(e.target.value as ModerationStatus | '');
            }}
            aria-label={t('admin.common.status')}
          >
            <option value='PENDING'>{t('admin.status.PENDING')}</option>
            <option value='APPROVED'>{t('admin.status.APPROVED')}</option>
            <option value='REJECTED'>{t('admin.status.REJECTED')}</option>
            <option value=''>{t('admin.common.all')}</option>
          </Select>
        </div>
      </div>

      {reviewsQuery.isLoading ? (
        <DataTable loading columns={columns} rows={[]} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={pagedRows}
            rowKey={(row) => row.id}
            empty={<EmptyState icon='💬' title={t('admin.reviews.empty')} />}
            sort={sort}
            onSortToggle={onSortToggle}
            rowProps={() => ({ 'data-testid': 'review-row' })}
          />
          <div className='admin-pagination'>
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPage(1);
                setPageSize(n);
              }}
              label={t('admin.common.pageSize')}
            />
            <span>
              {t('admin.common.pageOf', { page: safePage, total: totalPages })} —{' '}
              {t('admin.common.total', { count: rows.length })}
            </span>
            {/* Pagination primitive client mode (FI-395 review-G2) — tự ẩn totalPages ≤ 1. */}
            <Pagination
              page={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              label={t('admin.common.pagination')}
              prevLabel={t('admin.common.prev')}
              nextLabel={t('admin.common.next')}
            />
          </div>
        </>
      )}
    </div>
  );
}
