// lib/productForm.ts — state form sản phẩm + mapping pure sang ProductWrite
// (contract) và ngược lại từ ProductAdminView. Test node được (không React).

import type { CatalogClient } from '@ecommerce/contracts';
import type { AdminProductView } from './adminTypes';
import { slugify, truncateForSeo } from './productPayload';

/** ProductWrite derive từ contract (args flat — body là object). */
export type ProductWritePayload = Parameters<CatalogClient['adminCreateProduct']>[0];

export interface VariantRowState {
  nameVi: string;
  nameEn: string;
  /** Text "color=đỏ, size=XL" — parse ở buildProductWrite. */
  optionsText: string;
  priceDelta: string;
  stock: string;
}

export interface ImageRowState {
  url: string;
  alt: string;
}

export interface ProductFormState {
  nameVi: string;
  nameEn: string;
  slugVi: string;
  slugEn: string;
  descriptionVi: string;
  descriptionEn: string;
  brand: string;
  categoryId: string;
  official: boolean;
  seoTitleVi: string;
  seoTitleEn: string;
  seoDescVi: string;
  seoDescEn: string;
  price: string;
  comparePrice: string;
  /** datetime-local value ("yyyy-MM-ddTHH:mm") — rỗng = không flash sale. */
  flashSaleEndsAt: string;
  variants: VariantRowState[];
  images: ImageRowState[];
  status: 'DRAFT' | 'PUBLISHED';
}

export function emptyProductForm(): ProductFormState {
  return {
    nameVi: '',
    nameEn: '',
    slugVi: '',
    slugEn: '',
    descriptionVi: '',
    descriptionEn: '',
    brand: '',
    categoryId: '',
    official: false,
    seoTitleVi: '',
    seoTitleEn: '',
    seoDescVi: '',
    seoDescEn: '',
    price: '',
    comparePrice: '',
    flashSaleEndsAt: '',
    variants: [],
    images: [],
    status: 'DRAFT'
  };
}

// ── Options text ↔ Record ──────────────────────────────────────────────────

/**
 * "color=đỏ, size=XL" → {color:'đỏ', size:'XL'}. Rỗng → {}.
 * Sai cú pháp (thiếu '=', key/giá trị rỗng) → null (caller báo lỗi row).
 */
export function parseOptionsText(text: string): Record<string, string> | null {
  const trimmed = text.trim();
  if (trimmed === '') return {};
  const out: Record<string, string> = {};
  for (const part of trimmed.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) return null;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === '' || value === '') return null;
    out[key] = value;
  }
  return out;
}

export function optionsToText(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

// ── datetime-local ↔ ISO ───────────────────────────────────────────────────

export function localDateTimeToIso(value: string): string | undefined {
  if (value === '') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function isoToLocalDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── View → Form (edit round-trip) ──────────────────────────────────────────

export function viewToForm(view: AdminProductView): ProductFormState {
  const base = emptyProductForm();
  return {
    ...base,
    nameVi: view.nameI18n.vi,
    nameEn: view.nameI18n.en,
    slugVi: view.slugVi,
    slugEn: view.slugEn,
    descriptionVi: view.descriptionI18n.vi,
    descriptionEn: view.descriptionI18n.en,
    brand: view.brand ?? '',
    categoryId: view.categoryId,
    official: view.tags.includes('Chính hãng'),
    seoTitleVi: view.seoTitleI18n?.vi ?? '',
    seoTitleEn: view.seoTitleI18n?.en ?? '',
    seoDescVi: view.seoDescriptionI18n?.vi ?? '',
    seoDescEn: view.seoDescriptionI18n?.en ?? '',
    price: String(view.price),
    comparePrice: view.comparePrice !== undefined ? String(view.comparePrice) : '',
    flashSaleEndsAt: isoToLocalDateTime(view.flashSaleEndsAt),
    // View không trả nameI18n gốc của variant (Variant chỉ có name resolved) —
    // dùng resolved làm vi; en để trống (server fallback vi — D17).
    variants: (view.variants ?? []).map((v) => ({
      nameVi: v.name,
      nameEn: '',
      optionsText: optionsToText(v.options),
      priceDelta: v.priceDelta !== undefined ? String(v.priceDelta) : '',
      stock: String(v.stock)
    })),
    images: [...(view.images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((img) => ({ url: img.url, alt: img.alt ?? '' })),
    status: view.status
  };
}

// ── Form → ProductWrite ────────────────────────────────────────────────────

export interface BuildResult {
  payload: ProductWritePayload | null;
  /** Thông báo lỗi theo thứ tự field — hiển thị dạng list, không toast khi rỗng. */
  errors: string[];
}

export function buildProductWrite(state: ProductFormState): BuildResult {
  const errors: string[] = [];
  const nameVi = state.nameVi.trim();
  const price = Number(state.price);

  if (nameVi === '') errors.push('nameVi');
  if (state.categoryId === '') errors.push('categoryId');
  if (state.price.trim() === '' || Number.isNaN(price) || price < 0) errors.push('price');

  const parsedVariants: Array<{
    nameI18n: { vi: string; en: string };
    options: Record<string, string>;
    priceDelta?: number;
    stock: number;
  }> = [];
  state.variants.forEach((row, i) => {
    const options = parseOptionsText(row.optionsText);
    if (options === null) {
      errors.push(`variant-${i}`);
      return;
    }
    const stock = Number(row.stock);
    parsedVariants.push({
      nameI18n: { vi: row.nameVi.trim(), en: row.nameEn.trim() },
      options,
      priceDelta: row.priceDelta.trim() !== '' ? Number(row.priceDelta) : undefined,
      stock: Number.isNaN(stock) || row.stock.trim() === '' ? 0 : stock
    });
  });

  if (errors.length > 0) return { payload: null, errors };

  const slugVi = state.slugVi.trim() || slugify(nameVi);
  const slugEn = state.slugEn.trim() || slugify(state.nameEn.trim() || nameVi);
  if (slugVi === '' || slugEn === '') errors.push('slug');

  const seoTitle = {
    vi: state.seoTitleVi.trim() || null,
    en: state.seoTitleEn.trim() || null
  };
  const seoDesc = {
    vi: state.seoDescVi.trim() || null,
    en: state.seoDescEn.trim() || null
  };

  if (errors.length > 0) return { payload: null, errors };

  const payload: ProductWritePayload = {
    nameI18n: { vi: nameVi, en: state.nameEn.trim() },
    descriptionI18n: { vi: state.descriptionVi.trim(), en: state.descriptionEn.trim() },
    seoTitleI18n: seoTitle.vi === null && seoTitle.en === null ? undefined : seoTitle,
    seoDescriptionI18n: seoDesc.vi === null && seoDesc.en === null ? undefined : seoDesc,
    slugVi,
    slugEn,
    brand: state.brand.trim() || undefined,
    price,
    comparePrice: state.comparePrice.trim() !== '' ? Number(state.comparePrice) : undefined,
    flashSaleEndsAt: localDateTimeToIso(state.flashSaleEndsAt),
    tags: state.official ? ['Chính hãng'] : [],
    categoryId: state.categoryId,
    images: state.images
      .filter((img) => img.url.trim() !== '')
      .map((img, i) => ({ url: img.url.trim(), alt: img.alt.trim() || undefined, position: i })),
    variants: parsedVariants,
    status: state.status
  };
  return { payload, errors: [] };
}

/** Placeholder SEO tự sinh (D16/D17 — chỉ hiển thị gợi ý, không ghi vào payload). */
export function seoPlaceholders(state: ProductFormState): { title: string; description: string } {
  return {
    title: state.nameVi.trim(),
    description: truncateForSeo(state.descriptionVi)
  };
}
