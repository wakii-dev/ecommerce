import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, Card, Input, Modal, Select, Skeleton, Table, useToast } from '@ecommerce/ui-kit';
import { stubApi } from '../lib/api';
import { formatDateTime, formatVnd } from '../lib/format';
import { isoToLocalDateTime, localDateTimeToIso } from '../lib/productForm';
import type { CouponType, StubCoupon, StubCouponInput } from '../lib/types';

interface FormState {
  id?: string;
  code: string;
  type: CouponType;
  value: string;
  minOrderValue: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  active: boolean;
  description: string;
}

const EMPTY: FormState = {
  code: '',
  type: 'PERCENT',
  value: '',
  minOrderValue: '',
  startsAt: '',
  endsAt: '',
  usageLimit: '100',
  active: true,
  description: ''
};

function toForm(coupon: StubCoupon): FormState {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: String(coupon.value),
    minOrderValue: coupon.minOrderValue !== undefined ? String(coupon.minOrderValue) : '',
    startsAt: isoToLocalDateTime(coupon.startsAt),
    endsAt: isoToLocalDateTime(coupon.endsAt),
    usageLimit: String(coupon.usageLimit),
    active: coupon.active,
    description: coupon.description
  };
}

function toInput(form: FormState): StubCouponInput {
  const startsIso = localDateTimeToIso(form.startsAt);
  const endsIso = localDateTimeToIso(form.endsAt);
  return {
    code: form.code.trim().toUpperCase(),
    type: form.type,
    value: Number(form.value),
    minOrderValue: form.minOrderValue !== '' ? Number(form.minOrderValue) : undefined,
    startsAt: startsIso,
    endsAt: endsIso,
    usageLimit: Number(form.usageLimit) || 0,
    active: form.active,
    description: form.description.trim()
  };
}

export default function CouponsPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);

  const couponsQuery = useQuery({
    queryKey: ['stub-coupons'],
    queryFn: () => stubApi().listCoupons()
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['stub-coupons'] });
  };

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const input = toInput(state);
      return state.id
        ? stubApi().updateCoupon(state.id, input)
        : stubApi().createCoupon(input);
    },
    onSuccess: (_data, state) => {
      invalidate();
      toast.toast(state.id ? t('admin.coupons.updated') : t('admin.coupons.created'), { variant: 'success' });
      setForm(null);
    },
    onError: (error) => toast.toast(String(error), { variant: 'danger' })
  });

  const toggle = useMutation({
    mutationFn: (id: string) => stubApi().toggleCoupon(id),
    onSuccess: () => {
      invalidate();
      toast.toast(t('admin.coupons.toggled'), { variant: 'success' });
    }
  });

  const remove = useMutation({
    mutationFn: (id: string) => stubApi().deleteCoupon(id),
    onSuccess: () => {
      invalidate();
      toast.toast(t('admin.common.deleted'), { variant: 'success' });
    }
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (form) save.mutate(form);
  };

  const rows = couponsQuery.data ?? [];

  const columns = [
    {
      key: 'code',
      header: t('admin.coupons.code'),
      render: (row: StubCoupon) => (
        <div>
          <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{row.code}</div>
          {row.description !== '' && <div className='admin-hint'>{row.description}</div>}
        </div>
      )
    },
    {
      key: 'type',
      header: t('admin.coupons.type'),
      render: (row: StubCoupon) =>
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
      render: (row: StubCoupon) =>
        row.type === 'PERCENT' ? `${row.value}%` : formatVnd(row.value)
    },
    {
      key: 'window',
      header: `${t('admin.coupons.startsAt')} → ${t('admin.coupons.endsAt')}`,
      render: (row: StubCoupon) => (
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
      render: (row: StubCoupon) =>
        t('admin.coupons.usageOf', { used: row.usedCount, limit: row.usageLimit })
    },
    {
      key: 'active',
      header: t('admin.coupons.active'),
      render: (row: StubCoupon) => (
        <Button size='sm' variant={row.active ? 'primary' : 'secondary'} onClick={() => toggle.mutate(row.id)}>
          {row.active ? 'ON' : 'OFF'}
        </Button>
      )
    },
    {
      key: 'actions',
      header: t('admin.common.actions'),
      render: (row: StubCoupon) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size='sm' variant='secondary' onClick={() => setForm(toForm(row))}>
            {t('admin.common.edit')}
          </Button>
          <Button size='sm' variant='danger' onClick={() => remove.mutate(row.id)}>
            {t('admin.common.delete')}
          </Button>
        </div>
      )
    }
  ];

  return (
    <div>
      <div className='admin-page-head'>
        <h1>
          {t('admin.coupons.title')} <span className='admin-badge-mock'>{t('admin.common.mock')}</span>
        </h1>
        <div className='admin-page-head__actions'>
          <Button onClick={() => setForm({ ...EMPTY })}>{t('admin.coupons.new')}</Button>
        </div>
      </div>

      {couponsQuery.isLoading ? (
        <Skeleton variant='rect' height={200} />
      ) : (
        <Card>
          <Table columns={columns} rows={rows} rowKey={(row) => row.id} empty={t('admin.coupons.empty')} />
        </Card>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? t('admin.coupons.edit') : t('admin.coupons.new')}
      >
        {form !== null && (
          <form onSubmit={onSubmit}>
            <div className='admin-form-grid'>
              <div className='admin-form-field'>
                <label htmlFor='cp-code'>{t('admin.coupons.code')} *</label>
                <Input
                  id='cp-code'
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cp-type'>{t('admin.coupons.type')}</label>
                <Select
                  id='cp-type'
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as CouponType })}
                >
                  <option value='PERCENT'>{t('admin.coupons.percent')}</option>
                  <option value='FIXED'>{t('admin.coupons.fixed')}</option>
                </Select>
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cp-value'>{t('admin.coupons.value')} *</label>
                <Input
                  id='cp-value'
                  type='number'
                  min={form.type === 'PERCENT' ? 1 : 1000}
                  max={form.type === 'PERCENT' ? 100 : undefined}
                  required
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cp-min'>{t('admin.coupons.minOrder')}</label>
                <Input
                  id='cp-min'
                  type='number'
                  min={0}
                  value={form.minOrderValue}
                  onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cp-start'>{t('admin.coupons.startsAt')}</label>
                <Input
                  id='cp-start'
                  type='datetime-local'
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cp-end'>{t('admin.coupons.endsAt')}</label>
                <Input
                  id='cp-end'
                  type='datetime-local'
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cp-limit'>{t('admin.coupons.usage')}</label>
                <Input
                  id='cp-limit'
                  type='number'
                  min={1}
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                />
              </div>
              <div className='admin-form-field admin-form-field--full'>
                <label htmlFor='cp-desc'>{t('admin.coupons.description')}</label>
                <Input
                  id='cp-desc'
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className='admin-form-field admin-form-field--full'>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type='checkbox'
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  {t('admin.coupons.active')}
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button type='button' variant='ghost' onClick={() => setForm(null)}>
                {t('admin.common.cancel')}
              </Button>
              <Button type='submit' disabled={save.isPending}>
                {t('admin.common.save')}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
