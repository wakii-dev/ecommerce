// lib/productPayload.ts — pure helpers list/form sản phẩm (test node).

/**
 * "Áo Thun Nam Nữ Đẹp" → "ao-thun-nam-nu-dep" — bỏ dấu tiếng Việt (NFD),
 * đ→d, ký tự khác [a-z0-9] thành '-', trim '-' 2 đầu.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Shape tối thiểu của node cây — CategoryAdmin (live) thỏa mãn structural. */
export interface CategoryNodeLike {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  children?: readonly CategoryNodeLike[];
}

export interface FlatCategory {
  id: string;
  name: string;
  slug: string;
  /** 0 = gốc. */
  depth: number;
  parentId?: string | null;
}

/** Phẳng hóa cây danh mục depth-first (thứ tự cha trước con) — select parent/category. */
export function flattenCategories(
  tree: readonly CategoryNodeLike[],
  depth = 0,
  out: FlatCategory[] = []
): FlatCategory[] {
  for (const node of tree) {
    out.push({
      id: node.id,
      name: node.name,
      slug: node.slug,
      depth,
      parentId: node.parentId ?? null
    });
    if (node.children && node.children.length > 0) {
      flattenCategories(node.children, depth + 1, out);
    }
  }
  return out;
}

/** Indent hiển thị select — "Danh mục cha > Con". */
export function indentLabel(cat: FlatCategory): string {
  return `${'— '.repeat(cat.depth)}${cat.name}`;
}

/** Giá trị i18n an toàn khi đọc từ server: null/undefined → "". */
export function i18nTextOrNull(value: { vi: string | null; en: string | null } | null | undefined): {
  vi: string;
  en: string;
} {
  return { vi: value?.vi ?? '', en: value?.en ?? '' };
}

/** Cắt mô tả làm placeholder SEO description (160 ký tự, không cắt giữa từ nếu tránh được). */
export function truncateForSeo(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
