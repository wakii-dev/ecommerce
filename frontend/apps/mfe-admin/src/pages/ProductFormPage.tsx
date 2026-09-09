import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiErrorClient, type CatalogClient } from '@ecommerce/contracts';
import { authStore } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { Button, Card, Icon, Input, Select, Skeleton, Tabs, useToast } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { catalogApi } from '../lib/api';
import {
  buildProductWrite,
  emptyProductForm,
  seoPlaceholders,
  viewToForm,
  type ProductFormState
} from '../lib/productForm';
import { flattenCategories, indentLabel, slugify } from '../lib/productPayload';

export interface ProductFormPageProps {
  /** Có id → edit; không → tạo mới. */
  id?: string;
}

const STOREFRONT_URL: string =
  (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:3000';

export default function ProductFormPage({ id }: ProductFormPageProps): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  const [tab, setTab] = useState('info');
  const [subTab, setSubTab] = useState<'vi' | 'en'>('vi');
  const [form, setForm] = useState<ProductFormState>(emptyProductForm);
  const [errors, setErrors] = useState<string[]>([]);
  // Slug auto-gen chỉ chạy khi user CHƯA sửa slug tay (mỗi ngôn ngữ 1 flag).
  const slugViTouched = useRef(false);
  const slugEnTouched = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detailQuery = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => catalogApi().adminGetProduct({ id: id ?? '' }),
    enabled: isEdit
  });
  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => catalogApi().adminListCategories({})
  });

  useEffect(() => {
    if (isEdit && detailQuery.data) {
      setForm(viewToForm(detailQuery.data));
      // Stock thật từ inventory (admin view không trả stock — luôn 0; FI-397
      // demo follow-up). Fail im lặng → giữ giá trị view.
      const ids = (detailQuery.data.variants ?? [])
        .map((v) => v.id)
        .filter((x): x is string => Boolean(x));
      if (ids.length === 0) return;
      void authStore
        .fetch(`/api/inventory/availability?variantIds=${ids.join(',')}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Array<{ variantId: string; available: number }>) => {
          setForm((f) => ({
            ...f,
            variants: f.variants.map((row, i) => {
              const vid = ids[i];
              const match = rows.find((x) => x.variantId === vid);
              return match ? { ...row, stock: String(match.available) } : row;
            })
          }));
        })
        .catch(() => undefined);
    }
  }, [isEdit, detailQuery.data]);

  const patch = (partial: Partial<ProductFormState>): void =>
    setForm((f) => ({ ...f, ...partial }));

  const save = useMutation({
    mutationFn: async (payload: Parameters<CatalogClient['adminCreateProduct']>[0]) => {
      const saved = isEdit
        ? await catalogApi().adminUpdateProduct({ id: id ?? '', ...payload })
        : await catalogApi().adminCreateProduct(payload);
      // Sync stock variant → inventory (catalog PUT bỏ qua stock — inventory
      // sở hữu tồn kho; FI-397 demo follow-up). Match variant đã save theo
      // thứ tự payload (backend replace-all giữ thứ tự) + fallback theo tên.
      const savedVariants = saved.variants ?? [];
      await Promise.all(
        (payload.variants ?? []).map(async (row, i) => {
          const vid =
            savedVariants[i]?.id ??
            savedVariants.find((s) => s.name === row.nameI18n?.vi)?.id;
          if (!vid) return; // backend không trả id → không đoán (honesty-pass)
          await authStore.fetch('/api/inventory/admin/stocks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              variantId: vid,
              quantity: Number(row.stock) || 0,
              productName: payload.nameI18n?.vi
            })
          });
        })
      );
      return saved;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-product', id] });
      if (!isEdit && created.status === 'PUBLISHED') {
        // ACCEPTANCE: tạo product publish → link xem ngay trên storefront (vi + en).
        const urlVi = `${STOREFRONT_URL}/p/${created.slug}`;
        const urlEn = `${STOREFRONT_URL}/en/p/${created.slugEn}`;
        toast.toast(
          <>
            {t('admin.products.created')} —{' '}
            <a href={urlVi} target='_blank' rel='noreferrer'>
              {t('admin.products.seeStorefront')}
            </a>{' '}
            ·{' '}
            <a href={urlEn} target='_blank' rel='noreferrer'>
              {t('admin.products.seeStorefrontEn')}
            </a>
          </>,
          { variant: 'success', duration: 8000 }
        );
      } else {
        toast.toast(isEdit ? t('admin.products.updated') : t('admin.products.created'), {
          variant: 'success'
        });
      }
      appNavigate('/admin/products');
    },
    onError: (error) => {
      const detail = error instanceof ApiErrorClient && error.detail ? ` — ${error.detail}` : '';
      toast.toast(`${t('admin.common.error')}${detail}`, { variant: 'danger' });
    }
  });

  // SF-13 A3: upload ảnh MinIO → URL /media/products/<uuid> gắn vào list (chắp thêm).
  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      // Runtime client nhận Blob → FormData field `image` (contracts/client.ts
      // isBlob); generated OpArgs type multipart = {body?: unknown} nên cast
      // signature qua boundary — runtime VẪN flat arg (multipart đúng contract).
      const res = await (
        catalogApi() as unknown as {
          uploadAdminImage: (args: { image: File }) => Promise<{ url: string }>;
        }
      ).uploadAdminImage({ image: file });
      return res.url;
    },
    onSuccess: (url) => {
      setForm((f) => ({ ...f, images: [...f.images, { url, alt: '' }] }));
      toast.toast(t('admin.products.imageUploaded'), { variant: 'success' });
    },
    onError: (error) => {
      const detail = error instanceof ApiErrorClient && error.detail ? ` — ${error.detail}` : '';
      toast.toast(`${t('admin.common.error')}${detail}`, { variant: 'danger' });
    }
  });

  // Status truyền trực tiếp (không qua state) — tránh stale closure khi bấm
  const onSubmit = (status: 'DRAFT' | 'PUBLISHED'): void => {
    // Publish/Draft ngay trong 1 tick.
    const result = buildProductWrite({ ...form, status });
    setErrors(result.errors);
    if (result.payload) save.mutate(result.payload);
  };

  if (isEdit && detailQuery.isLoading) {
    return <Skeleton variant='rect' height={320} />;
  }
  if (isEdit && detailQuery.isError) {
    return <p className='admin-error-text'>{t('admin.common.loadFail')}</p>;
  }

  const categories = flattenCategories(categoriesQuery.data ?? []);
  const seoHint = seoPlaceholders(form);
  const hasError = (field: string): boolean => errors.includes(field);

  const subTabs = (
    <Tabs
      items={[
        { key: 'vi', label: t('admin.products.subTabVi') },
        { key: 'en', label: t('admin.products.subTabEn') }
      ]}
      value={subTab}
      onInput={(key) => setSubTab(key as 'vi' | 'en')}
    />
  );

  const nameValue = subTab === 'vi' ? form.nameVi : form.nameEn;
  const seoTitleValue = subTab === 'vi' ? form.seoTitleVi : form.seoTitleEn;
  const seoDescValue = subTab === 'vi' ? form.seoDescVi : form.seoDescEn;

  return (
    <div>
      <div className='admin-page-head'>
        <h1>{isEdit ? t('admin.common.edit') : t('admin.products.new')}</h1>
        <div className='admin-page-head__actions'>
          <Button variant='ghost' onClick={() => appNavigate('/admin/products')}>
            ← {t('admin.common.cancel')}
          </Button>
          <Button variant='secondary' disabled={save.isPending} onClick={() => onSubmit('DRAFT')}>
            {t('admin.products.draft')}
          </Button>
          <Button disabled={save.isPending} onClick={() => onSubmit('PUBLISHED')}>
            {t('admin.products.publish')}
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <p className='admin-error-text'>{t('admin.common.error')} ({errors.join(', ')})</p>
      )}

      <Card>
        <Tabs
          items={[
            { key: 'info', label: t('admin.products.tabInfo') },
            { key: 'seo', label: t('admin.products.tabSeo') },
            { key: 'price', label: t('admin.products.tabPrice') },
            { key: 'variants', label: t('admin.products.tabVariants') },
            { key: 'images', label: t('admin.products.tabImages') }
          ]}
          value={tab}
          onInput={setTab}
        />

        <div style={{ marginTop: 20 }}>
          {tab === 'info' && (
            <div className='admin-form-grid'>
              <div className='admin-form-field admin-form-field--full'>
                {subTabs}
              </div>
              <div className='admin-form-field'>
                <label htmlFor='p-name'>{subTab === 'vi' ? t('admin.products.name') : t('admin.products.nameEn')}</label>
                <Input
                  id='p-name'
                  value={nameValue}
                  required={subTab === 'vi'}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (subTab === 'vi') {
                      patch({
                        nameVi: value,
                        slugVi: slugViTouched.current ? form.slugVi : slugify(value),
                        slugEn: slugEnTouched.current ? form.slugEn : slugify(value)
                      });
                    } else {
                      patch({
                        nameEn: value,
                        slugEn: slugEnTouched.current ? form.slugEn : slugify(value)
                      });
                    }
                  }}
                />
              </div>
              {subTab === 'vi' ? (
                <div className='admin-form-field'>
                  <label htmlFor='p-desc'>{t('admin.products.description')}</label>
                  <textarea
                    id='p-desc'
                    className='uk-input'
                    rows={4}
                    value={form.descriptionVi}
                    onChange={(e) => patch({ descriptionVi: e.target.value })}
                  />
                </div>
              ) : (
                <div className='admin-form-field'>
                  <label htmlFor='p-desc-en'>{t('admin.products.descriptionEn')}</label>
                  <textarea
                    id='p-desc-en'
                    className='uk-input'
                    rows={4}
                    value={form.descriptionEn}
                    onChange={(e) => patch({ descriptionEn: e.target.value })}
                  />
                </div>
              )}
              <div className='admin-form-field'>
                <label htmlFor='p-slug-vi'>{t('admin.products.slugVi')}</label>
                <Input
                  id='p-slug-vi'
                  value={form.slugVi}
                  onChange={(e) => {
                    slugViTouched.current = true;
                    patch({ slugVi: e.target.value });
                  }}
                />
                <span className='admin-hint'>{t('admin.products.slugAuto')}</span>
              </div>
              <div className='admin-form-field'>
                <label htmlFor='p-slug-en'>{t('admin.products.slugEn')}</label>
                <Input
                  id='p-slug-en'
                  value={form.slugEn}
                  onChange={(e) => {
                    slugEnTouched.current = true;
                    patch({ slugEn: e.target.value });
                  }}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='p-brand'>{t('admin.products.brand')}</label>
                <Input
                  id='p-brand'
                  value={form.brand}
                  onChange={(e) => patch({ brand: e.target.value })}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='p-category'>{t('admin.products.category')}</label>
                <Select
                  id='p-category'
                  required
                  value={form.categoryId}
                  onChange={(e) => patch({ categoryId: e.target.value })}
                >
                  <option value=''>{t('admin.common.all')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {indentLabel(c)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className='admin-form-field admin-form-field--full'>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type='checkbox'
                    checked={form.official}
                    onChange={(e) => patch({ official: e.target.checked })}
                  />
                  {t('admin.products.official')}
                </label>
                <span className='admin-hint'>tags: "Chính hãng"</span>
              </div>
            </div>
          )}

          {tab === 'seo' && (
            <div className='admin-form-grid'>
              <div className='admin-form-field admin-form-field--full'>{subTabs}</div>
              <div className='admin-form-field admin-form-field--full'>
                <label htmlFor='p-seo-title'>{t('admin.products.seoTitle')}</label>
                <Input
                  id='p-seo-title'
                  value={seoTitleValue}
                  placeholder={seoHint.title || t('admin.products.seoTitlePh')}
                  onChange={(e) =>
                    subTab === 'vi'
                      ? patch({ seoTitleVi: e.target.value })
                      : patch({ seoTitleEn: e.target.value })
                  }
                />
              </div>
              <div className='admin-form-field admin-form-field--full'>
                <label htmlFor='p-seo-desc'>{t('admin.products.seoDesc')}</label>
                <textarea
                  id='p-seo-desc'
                  className='uk-input'
                  rows={3}
                  value={seoDescValue}
                  placeholder={seoHint.description || t('admin.products.seoDescPh')}
                  onChange={(e) =>
                    subTab === 'vi'
                      ? patch({ seoDescVi: e.target.value })
                      : patch({ seoDescEn: e.target.value })
                  }
                />
                <span className='admin-hint'>{subTab === 'vi' ? t('admin.products.seoTitlePh') : t('admin.products.seoDescPh')}</span>
              </div>
            </div>
          )}

          {tab === 'price' && (
            <div className='admin-form-grid'>
              <div className='admin-form-field'>
                <label htmlFor='p-price'>{t('admin.products.price')} *</label>
                <Input
                  id='p-price'
                  type='number'
                  min={0}
                  required
                  value={form.price}
                  aria-invalid={hasError('price')}
                  onChange={(e) => patch({ price: e.target.value })}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='p-compare'>{t('admin.products.comparePrice')}</label>
                {/* aria-invalid qua guard finite FI-368 T8 ("1e999" → chặn) */}
                <Input
                  id='p-compare'
                  type='number'
                  min={0}
                  value={form.comparePrice}
                  aria-invalid={hasError('comparePrice')}
                  onChange={(e) => patch({ comparePrice: e.target.value })}
                />
                {Number(form.comparePrice) > 0 &&
                  Number(form.price) > 0 &&
                  Number(form.comparePrice) <= Number(form.price) && (
                    <span className='admin-error-text'>{t('admin.products.comparePriceWarn')}</span>
                  )}
              </div>
              <div className='admin-form-field'>
                <label htmlFor='p-flash'>{t('admin.products.flashEndsAt')}</label>
                <Input
                  id='p-flash'
                  type='datetime-local'
                  value={form.flashSaleEndsAt}
                  onChange={(e) => patch({ flashSaleEndsAt: e.target.value })}
                />
              </div>
            </div>
          )}

          {tab === 'variants' && (
            <div>
              {form.variants.map((row, i) => (
                <div key={i} className='admin-variant-row'>
                  <div className='admin-form-field'>
                    <label>{t('admin.products.variantName')}</label>
                    <Input
                      value={row.nameVi}
                      onChange={(e) =>
                        patch({
                          variants: form.variants.map((r, j) =>
                            j === i ? { ...r, nameVi: e.target.value } : r
                          )
                        })
                      }
                    />
                  </div>
                  <div className='admin-form-field'>
                    <label>{t('admin.products.variantNameEn')}</label>
                    <Input
                      value={row.nameEn}
                      onChange={(e) =>
                        patch({
                          variants: form.variants.map((r, j) =>
                            j === i ? { ...r, nameEn: e.target.value } : r
                          )
                        })
                      }
                    />
                  </div>
                  <div className='admin-form-field'>
                    <label>{t('admin.products.options')}</label>
                    <Input
                      placeholder={t('admin.products.optionsPh')}
                      value={row.optionsText}
                      aria-invalid={hasError(`variant-${i}`)}
                      onChange={(e) =>
                        patch({
                          variants: form.variants.map((r, j) =>
                            j === i ? { ...r, optionsText: e.target.value } : r
                          )
                        })
                      }
                    />
                    {hasError(`variant-${i}`) && (
                      <span className='admin-error-text'>{t('admin.products.optionsInvalid')}</span>
                    )}
                  </div>
                  <div className='admin-form-field'>
                    <label>{t('admin.products.priceDelta')}</label>
                    <Input
                      type='number'
                      value={row.priceDelta}
                      onChange={(e) =>
                        patch({
                          variants: form.variants.map((r, j) =>
                            j === i ? { ...r, priceDelta: e.target.value } : r
                          )
                        })
                      }
                    />
                  </div>
                  <div className='admin-form-field'>
                    <label>{t('admin.products.stock')}</label>
                    <Input
                      type='number'
                      min={0}
                      value={row.stock}
                      onChange={(e) =>
                        patch({
                          variants: form.variants.map((r, j) =>
                            j === i ? { ...r, stock: e.target.value } : r
                          )
                        })
                      }
                    />
                  </div>
                  <Button
                    size='sm'
                    variant='danger'
                    onClick={() => patch({ variants: form.variants.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                variant='secondary'
                onClick={() =>
                  patch({
                    variants: [
                      ...form.variants,
                      { nameVi: '', nameEn: '', optionsText: '', priceDelta: '', stock: '0' }
                    ]
                  })
                }
              >
                + {t('admin.products.addVariant')}
              </Button>
            </div>
          )}

          {tab === 'images' && (
            <div>
              {form.images.map((row, i) => (
                <div key={i} className='admin-variant-row'>
                  {row.url !== '' && (
                    <img
                      src={row.url}
                      alt={row.alt || 'preview'}
                      width={56}
                      height={56}
                      style={{ objectFit: 'cover', borderRadius: 8 }}
                    />
                  )}
                  <div className='admin-form-field'>
                    <label>{t('admin.products.imageUrl')}</label>
                    <Input
                      value={row.url}
                      onChange={(e) =>
                        patch({
                          images: form.images.map((r, j) =>
                            j === i ? { ...r, url: e.target.value } : r
                          )
                        })
                      }
                    />
                  </div>
                  <div className='admin-form-field'>
                    <label>{t('admin.products.imageAlt')}</label>
                    <Input
                      value={row.alt}
                      onChange={(e) =>
                        patch({
                          images: form.images.map((r, j) =>
                            j === i ? { ...r, alt: e.target.value } : r
                          )
                        })
                      }
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Button
                      size='sm'
                      variant='secondary'
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...form.images];
                        const [moved] = next.splice(i, 1);
                        if (moved) next.splice(i - 1, 0, moved);
                        patch({ images: next });
                      }}
                    >
                      ↑ {t('admin.products.moveUp')}
                    </Button>
                    <Button
                      size='sm'
                      variant='secondary'
                      disabled={i === form.images.length - 1}
                      onClick={() => {
                        const next = [...form.images];
                        const [moved] = next.splice(i, 1);
                        if (moved) next.splice(i + 1, 0, moved);
                        patch({ images: next });
                      }}
                    >
                      ↓ {t('admin.products.moveDown')}
                    </Button>
                  </div>
                  <Button
                    size='sm'
                    variant='danger'
                    onClick={() => patch({ images: form.images.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant='secondary'
                  onClick={() => patch({ images: [...form.images, { url: '', alt: '' }] })}
                >
                  + {t('admin.products.addImage')}
                </Button>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/jpeg,image/png,image/webp'
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage.mutate(file);
                    e.target.value = '';
                  }}
                />
                {/* Dropzone-STYLE visual (FI-395 T6) — KHÔNG đổi logic: cùng
                    input[type=file] ẩn ở trên, cùng click flow, cùng testid
                    'upload-image' (e2e setInputFiles + tr hasText phụ thuộc). */}
                <button
                  type='button'
                  className='admin-upload-dropzone'
                  disabled={uploadImage.isPending}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid='upload-image'
                >
                  <Icon name='plus' size={18} />
                  <span>
                    {uploadImage.isPending
                      ? t('admin.products.uploadingImage')
                      : t('admin.products.uploadImage')}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

