import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiErrorClient } from '@ecommerce/contracts';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, EmptyState, Input, Modal, Pagination, Select, useToast } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { downloadAdminFile } from '../lib/download';
import { DataTable } from '../components/DataTable';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { catalogApi } from '../lib/api';
import { formatVnd } from '../lib/format';
import { flattenCategories, indentLabel } from '../lib/productPayload';

function statusBadge(status: string, t: (k: string) => string): ReactElement {
  return status === 'PUBLISHED' ? (
    <Badge variant='success'>{t('admin.status.PUBLISHED')}</Badge>
  ) : (
    <Badge variant='neutral'>{t('admin.status.DRAFT')}</Badge>
  );
}

export default function ProductsListPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'DRAFT' | 'PUBLISHED'>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null);

  const productsQuery = useQuery({
    queryKey: ['admin-products', { page, pageSize, q, status }],
    queryFn: () =>
      catalogApi().adminListProducts({
        page,
        size: pageSize,
        q: q || undefined,
        status: status || undefined
      })
  });
  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => catalogApi().adminListCategories({})
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => catalogApi().adminDeleteProduct({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast.toast(t('admin.products.deactivated'), { variant: 'success' });
      setDeactivating(null);
    },
    onError: (error) => {
      const detail = error instanceof ApiErrorClient && error.detail ? ` — ${error.detail}` : '';
      toast.toast(`${t('admin.common.error')}${detail}`, { variant: 'danger' });
    }
  });

  const categories = useMemo(
    () => flattenCategories(categoriesQuery.data ?? []),
    [categoriesQuery.data]
  );

  // Filter category là CLIENT-SIDE trên trang hiện tại (contract adminListProducts
  // chỉ có q/status/page/size — pack chốt client filter).
  const rows = useMemo(() => {
    const items = productsQuery.data?.items ?? [];
    if (!categoryFilter) return items;
    return items.filter((item) => item.categoryId === categoryFilter);
  }, [productsQuery.data, categoryFilter]);

  const total = productsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns = [
    {
      key: 'image',
      header: t('admin.common.image'),
      render: (row: (typeof rows)[number]) => (
        <img
          src={row.image?.url}
          alt={row.image?.alt ?? row.name}
          width={44}
          height={44}
          style={{ objectFit: 'cover', borderRadius: 8 }}
        />
      )
    },
    {
      key: 'name',
      header: t('admin.products.title'),
      sortValue: (row: (typeof rows)[number]) => row.name,
      render: (row: (typeof rows)[number]) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.name}</div>
          <div className='admin-hint'>
            /{row.slug} · /en/{row.slugEn}
          </div>
        </div>
      )
    },
    {
      key: 'price',
      header: t('admin.products.price'),
      align: 'right' as const,
      sortValue: (row: (typeof rows)[number]) => row.price,
      render: (row: (typeof rows)[number]) => formatVnd(row.price)
    },
    {
      key: 'category',
      header: t('admin.products.category'),
      sortValue: (row: (typeof rows)[number]) =>
        categories.find((c) => c.id === row.categoryId)?.name ?? row.categoryId,
      render: (row: (typeof rows)[number]) =>
        categories.find((c) => c.id === row.categoryId)?.name ?? row.categoryId
    },
    {
      key: 'status',
      header: t('admin.common.status'),
      sortValue: (row: (typeof rows)[number]) => row.status,
      render: (row: (typeof rows)[number]) => statusBadge(row.status, t)
    },
    {
      key: 'actions',
      header: t('admin.common.actions'),
      render: (row: (typeof rows)[number]) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size='sm' variant='secondary' onClick={() => appNavigate(`/admin/products/${row.id}`)}>
            {t('admin.common.edit')}
          </Button>
          <Button
            size='sm'
            variant='danger'
            onClick={() => setDeactivating({ id: row.id, name: row.name })}
          >
            {t('admin.products.deactivate')}
          </Button>
        </div>
      )
    }
  ];

  return (
    <div>
      <div className='admin-page-head'>
        <h1>{t('admin.products.title')}</h1>
        <div className='admin-page-head__actions'>
          <Button
            variant='secondary'
            onClick={() => void downloadAdminFile('/api/catalog/admin/products/export.csv', 'products.csv')}
            data-testid='products-export-csv'
          >
            {t('admin.products.exportCsv')}
          </Button>
          <Button onClick={() => appNavigate('/admin/products/new')}>{t('admin.products.new')}</Button>
        </div>
      </div>

      <div className='admin-filters'>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(qInput.trim());
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t('admin.common.searchPh')}
            aria-label={t('admin.common.search')}
            style={{ width: 260 }}
          />
          <Button variant='secondary' type='submit'>
            {t('admin.common.search')}
          </Button>
        </form>
        <Select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as '' | 'DRAFT' | 'PUBLISHED');
          }}
          aria-label={t('admin.common.status')}
        >
          <option value=''>{t('admin.common.all')}</option>
          <option value='PUBLISHED'>{t('admin.status.PUBLISHED')}</option>
          <option value='DRAFT'>{t('admin.status.DRAFT')}</option>
        </Select>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label={t('admin.products.category')}
        >
          <option value=''>{t('admin.products.category')}: {t('admin.common.all')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {indentLabel(c)}
            </option>
          ))}
        </Select>
        <PageSizeSelect
          value={pageSize}
          onChange={(n) => {
            setPage(1);
            setPageSize(n);
          }}
          label={t('admin.common.pageSize')}
        />
      </div>

      {productsQuery.isLoading ? (
        <DataTable loading columns={columns} rows={[]} />
      ) : productsQuery.isError ? (
        <p className='admin-error-text'>{t('admin.common.loadFail')}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={<EmptyState title={t('admin.products.empty')} />}
          caption={`${t('admin.common.total', { count: total })} — ${t('admin.common.pageOf', {
            page,
            total: totalPages
          })}`}
        />
      )}

      <div className='admin-pagination'>
        {/* Pagination primitive client mode (FI-395 T4) — thay nút Trước/Sau.
            Tự ẩn khi totalPages ≤ 1; dòng pageOf giữ để hiện tổng bản ghi. */}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => setPage(p)}
          label={t('admin.common.pagination')}
          prevLabel={t('admin.common.prev')}
          nextLabel={t('admin.common.next')}
        />
        <span>
          {t('admin.common.pageOf', { page, total: totalPages })}
        </span>
      </div>

      <Modal
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        title={t('admin.products.deactivate')}
      >
        <p>{t('admin.products.deactivateConfirm')}</p>
        {deactivating !== null && <p style={{ fontWeight: 700 }}>{deactivating.name}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant='ghost' onClick={() => setDeactivating(null)}>
            {t('admin.common.no')}
          </Button>
          <Button
            variant='danger'
            disabled={deactivate.isPending}
            onClick={() => deactivating && deactivate.mutate(deactivating.id)}
          >
            {t('admin.products.deactivate')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
