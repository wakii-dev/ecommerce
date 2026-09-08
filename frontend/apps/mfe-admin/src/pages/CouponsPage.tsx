import { useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiErrorClient } from '@ecommerce/contracts';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, Card, Input, Modal, Select, useToast } from '@ecommerce/ui-kit';
import { DataTable } from '../components/DataTable';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { useClientSort } from '../lib/tableSort';
import type { SortAccessor } from '../lib/tableSort';
import { formatDateTime, formatVnd } from '../lib/format';
import {
  adminCreateCoupon,
  adminDeleteCoupon,
  adminListCoupons,
  adminToggleCoupon,
  adminUpdateCoupon
} from '../lib/adminCoupons';
import {
  buildCouponWrite,
  couponToForm,
  emptyCouponForm,
  type AdminCouponView,
  type CouponFieldError,
  type CouponFormState
} from '../lib/couponForm';

/**
 * Coupon CRUD LIVE (FI-369 SF-2 — amendment A3): tạo/sửa/toggle/xóa qua admin
 * API thật — thay màn READ-ONLY (public list + note) của SF-10. Lỗi 409/400/
 * 422 surface qua toast kèm problem+json detail (pattern CategoriesPage).
 * N4: xóa mã có lịch sử reservation → BE chặn 409 → toggle off thay thế.
 */
type CouponRow = AdminCouponView;

const ERR_KEYS: Record<CouponFieldError, string> = {
  code: 'admin.coupons.errCode',
  value: 'admin.coupons.errValue',
  minOrderValue: 'admin.coupons.errMinOrder',
  window: 'admin.coupons.errWindow',
  usageLimit: 'admin.coupons.errLimit'
};

export default function CouponsPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<CouponFormState | null>(null);
  // edit mode = code khóa (PK) + submit đi PUT; create = code trống ban đầu
  const [editing, setEditing] = useState(false);
  const [formErrors, setFormErrors] = useState<CouponFieldError[]>([]);
  // Mã chờ confirm xóa (null = modal đóng — FI-368 T8 pattern)
  const [deleting, setDeleting] = useState<string | null>(null);

  const couponsQuery = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: adminListCoupons
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
  };

  const errDetail = (error: unknown): string =>
    error instanceof ApiErrorClient && error.detail ? ` — ${error.detail}` : '';

  const saveMutation = useMutation({
    mutationFn: (state: CouponFormState) => {
      const built = buildCouponWrite(state);
      if (built.payload === null) throw new Error('invalid form state');
      return editing
        ? adminUpdateCoupon(state.code, built.payload)
        : adminCreateCoupon(built.payload);
    },
    onSuccess: () => {
      invalidate();
      toast.toast(editing ? t('admin.coupons.updated') : t('admin.coupons.created'), {
        variant: 'success'
      });
      setForm(null);
      setFormErrors([]);
    },
    onError: (error) => {
      toast.toast(`${t('admin.common.error')}${errDetail(error)}`, { variant: 'danger' });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ code }: { code: string }) => adminToggleCoupon(code),
    onSuccess: () => {
      invalidate();
      toast.toast(t('admin.coupons.toggled'), { variant: 'success' });
    },
    onError: (error) => {
      toast.toast(`${t('admin.common.error')}${errDetail(error)}`, { variant: 'danger' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (code: string) => adminDeleteCoupon(code),
    onSuccess: () => {
      invalidate();
      toast.toast(t('admin.common.deleted'), { variant: 'success' });
    },
    onError: (error) => {
      // 409: đang RESERVED hoặc đã có lịch sử → N4 chặn xóa cứng, toggle off thay thế
      toast.toast(`${t('admin.coupons.deleteBlocked')}${errDetail(error)}`, { variant: 'danger' });
    }
  });

  const openCreate = (): void => {
    setEditing(false);
    setForm(emptyCouponForm());
    setFormErrors([]);
  };

  const openEdit = (row: CouponRow): void => {
    setEditing(true);
    setForm(couponToForm(row));
    setFormErrors([]);
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!form) return;
    const built = buildCouponWrite(form);
    setFormErrors(built.errors);
    if (built.errors.length === 0) saveMutation.mutate(form);
  };

  const rows = couponsQuery.data ?? [];

  // Load-all → sort client (useClientSort) rồi slice trang hiện tại
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sort, sortedRows, toggleSort } = useClientSort<CouponRow>(rows);
  const onSortToggle = (key: string, accessor: SortAccessor<CouponRow>): void => {
    setPage(1);
    toggleSort(key, accessor);
  };
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [sortedRows, page, pageSize]
  );

  const columns = [
    {
      key: 'code',
      header: t('admin.coupons.code'),
      sortValue: (row: CouponRow) => row.code,
      render: (row: CouponRow) => (
        <div>
          <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{row.code}</div>
          {row.description !== '' && <div className='admin-hint'>{row.description}</div>}
        </div>
      )
    },
    {
      key: 'type',
      header: t('admin.coupons.type'),
      render: (row: CouponRow) =>
        row.type === 'PERCENT' ? (
          <Badge variant='warning'>{t('admin.coupons.percent')}</Badge>
        ) : (
          <Badge variant='neutral'>{t('admin.coupons.fixed')}</Badge>
        )
    },
    {
      key: 'value',
      header: t('admin.coupons.value'),
      align: 'right' as const,
      sortValue: (row: CouponRow) => row.value,
      render: (row: CouponRow) => (row.type === 'PERCENT' ? `${row.value}%` : formatVnd(row.value))
    },
    {
      key: 'min',
      header: t('admin.coupons.minOrder'),
      align: 'right' as const,
      render: (row: CouponRow) =>
        row.minOrderValue !== undefined ? formatVnd(row.minOrderValue) : '—'
    },
    {
      key: 'window',
      header: `${t('admin.coupons.startsAt')} → ${t('admin.coupons.endsAt')}`,
      render: (row: CouponRow) => (
        <span style={{ fontSize: 13 }}>
          {row.startsAt ? formatDateTime(row.startsAt) : '—'}
          {' → '}
          {row.endsAt ? formatDateTime(row.endsAt) : '—'}
        </span>
      )
    },
    {
      key: 'usage',
      header: t('admin.coupons.usage'),
      align: 'right' as const,
      render: (row: CouponRow) => (
        <span data-testid={`coupon-usage-${row.code}`}>
          {row.usageLimit !== undefined
            ? t('admin.coupons.usageOf', { used: row.usedCount, limit: row.usageLimit })
            : `${row.usedCount}/∞`}
        </span>
      )
    },
    {
      key: 'status',
      header: t('admin.common.status'),
      sortValue: (row: CouponRow) => (row.active ? 1 : 0),
      render: (row: CouponRow) => (
        <Button
          size='sm'
          variant={row.active ? 'primary' : 'secondary'}
          disabled={toggleMutation.isPending}
          data-testid={`coupon-toggle-${row.code}`}
          onClick={() => toggleMutation.mutate({ code: row.code })}
        >
          {row.active ? t('admin.coupons.active') : t('admin.coupons.inactive')}
        </Button>
      )
    },
    {
      key: 'actions',
      header: t('admin.common.actions'),
      render: (row: CouponRow) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size='sm' variant='secondary' onClick={() => openEdit(row)}>
            {t('admin.common.edit')}
          </Button>
          <Button
            size='sm'
            variant='danger'
            data-testid={`coupon-delete-${row.code}`}
            onClick={() => setDeleting(row.code)}
          >
            {t('admin.common.delete')}
          </Button>
        </div>
      )
    }
  ];

  return (
    <div>
      <div className='admin-page-head'>
        <h1>{t('admin.coupons.title')}</h1>
        <div className='admin-page-head__actions'>
          <Button data-testid='coupon-create-btn' onClick={openCreate}>
            {t('admin.coupons.new')}
          </Button>
        </div>
      </div>

      {form !== null && (
        <Card style={{ marginBottom: 24 }}>
          <form onSubmit={onSubmit}>
            <div className='admin-form-grid'>
              <div className='admin-form-field'>
                <label htmlFor='coupon-code'>{t('admin.coupons.code')}</label>
                <Input
                  id='coupon-code'
                  required
                  disabled={editing}
                  value={form.code}
                  onChange={(e) => setForm((f) => (f ? { ...f, code: e.target.value.toUpperCase() } : f))}
                />
                {editing && <span className='admin-hint'>{t('admin.coupons.codeLocked')}</span>}
              </div>
              <div className='admin-form-field'>
                <label htmlFor='coupon-type'>{t('admin.coupons.type')}</label>
                <Select
                  id='coupon-type'
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, type: e.target.value as 'PERCENT' | 'FIXED' } : f))
                  }
                >
                  <option value='PERCENT'>{t('admin.coupons.percent')}</option>
                  <option value='FIXED'>{t('admin.coupons.fixed')}</option>
                </Select>
              </div>
              <div className='admin-form-field'>
                <label htmlFor='coupon-value'>{t('admin.coupons.value')}</label>
                <Input
                  id='coupon-value'
                  required
                  type='number'
                  value={form.value}
                  onChange={(e) => setForm((f) => (f ? { ...f, value: e.target.value } : f))}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='coupon-min'>{t('admin.coupons.minOrder')}</label>
                <Input
                  id='coupon-min'
                  type='number'
                  value={form.minOrderValue}
                  onChange={(e) => setForm((f) => (f ? { ...f, minOrderValue: e.target.value } : f))}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='coupon-starts'>{t('admin.coupons.startsAt')}</label>
                <Input
                  id='coupon-starts'
                  type='datetime-local'
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => (f ? { ...f, startsAt: e.target.value } : f))}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='coupon-ends'>{t('admin.coupons.endsAt')}</label>
                <Input
                  id='coupon-ends'
                  type='datetime-local'
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => (f ? { ...f, endsAt: e.target.value } : f))}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='coupon-limit'>{t('admin.coupons.usage')}</label>
                <Input
                  id='coupon-limit'
                  type='number'
                  placeholder='∞'
                  value={form.usageLimit}
                  onChange={(e) => setForm((f) => (f ? { ...f, usageLimit: e.target.value } : f))}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='coupon-active'>{t('admin.coupons.active')}</label>
                <Select
                  id='coupon-active'
                  value={form.active ? '1' : '0'}
                  onChange={(e) => setForm((f) => (f ? { ...f, active: e.target.value === '1' } : f))}
                >
                  <option value='1'>{t('admin.common.yes')}</option>
                  <option value='0'>{t('admin.common.no')}</option>
                </Select>
              </div>
              <div className='admin-form-field admin-form-field--full'>
                <label htmlFor='coupon-desc'>{t('admin.coupons.description')}</label>
                <Input
                  id='coupon-desc'
                  value={form.description}
                  onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
                />
              </div>
            </div>
            {formErrors.length > 0 && (
              <ul
                className='admin-error-text'
                data-testid='coupon-form-errors'
                style={{ margin: '8px 0 0' }}
              >
                {formErrors.map((err) => (
                  <li key={err}>{t(ERR_KEYS[err])}</li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button type='button' variant='ghost' onClick={() => setForm(null)}>
                {t('admin.common.cancel')}
              </Button>
              <Button type='submit' data-testid='coupon-submit-btn' disabled={saveMutation.isPending}>
                {editing ? t('admin.common.save') : t('admin.coupons.new')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {couponsQuery.isLoading ? (
        <DataTable loading columns={columns} rows={[]} />
      ) : couponsQuery.isError ? (
        <p className='admin-error-text'>{t('admin.common.loadFail')}</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={pagedRows}
            rowKey={(row) => row.code}
            empty={t('admin.coupons.empty')}
            sort={sort}
            onSortToggle={onSortToggle}
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
              {t('admin.common.pageOf', { page, total: totalPages })} —{' '}
              {t('admin.common.total', { count: rows.length })}
            </span>
          </div>
        </>
      )}

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title={t('admin.common.delete')}>
        <p>{t('admin.common.confirmDelete')}</p>
        <p style={{ fontWeight: 700 }}>{deleting}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant='ghost' onClick={() => setDeleting(null)}>
            {t('admin.common.no')}
          </Button>
          <Button
            variant='danger'
            onClick={() => {
              if (deleting) deleteMutation.mutate(deleting);
              setDeleting(null);
            }}
          >
            {t('admin.common.yes')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
