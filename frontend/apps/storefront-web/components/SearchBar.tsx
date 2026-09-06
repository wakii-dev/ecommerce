'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { formatVnd, localePath, type Locale } from '../lib/format';
import { moveActive, suggestUrl } from '../lib/search';

/**
 * SearchBar client (Task 14 — thay stub Task 10): viền 2px primary + dropdown
 * suggest theo direction §2.1. Focus + gõ ≥1 ký tự → debounce 250ms gọi
 * suggest (relative `/api/...` qua Next rewrites proxy → gateway, same-origin
 * không CORS); AbortController hủy request cũ mỗi keystroke. Dropdown đóng:
 * mousedown ngoài wrapper / blur ra ngoài / Escape. Enter (không chọn item)
 * → localePath('/search') + ?q= (giữ locale); ArrowUp/Down chọn item
 * (aria-activedescendant). Form GET cùng path (no-JS fallback).
 */

const PLACEHOLDER: Record<Locale, string> = {
  vi: 'Tìm sản phẩm, thương hiệu...',
  en: 'Search products, brands...',
};

const COPY: Record<Locale, { products: string; categories: string; hot: string; search: string }> = {
  vi: { products: 'Sản phẩm', categories: 'Danh mục', hot: 'ĐANG HOT', search: 'Tìm kiếm' },
  en: { products: 'Products', categories: 'Categories', hot: 'HOT', search: 'Search' },
};

/** Subset ProductCard + SuggestResponse của contracts (mà dropdown cần). */
interface SuggestProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  flashSaleEndsAt?: string;
}

interface SuggestCategory {
  slug: string;
  name: string;
}

interface SuggestData {
  products: SuggestProduct[];
  categories: SuggestCategory[];
}

const EMPTY_SUGGEST: SuggestData = { products: [], categories: [] };

/** Item phẳng cho keyboard nav — products trước, categories sau. */
interface FlatItem {
  id: string;
  href: string;
}

export default function SearchBar({ locale }: { locale: Locale }) {
  const router = useRouter();
  const placeholder = PLACEHOLDER[locale];
  const copy = COPY[locale];

  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suggest, setSuggest] = useState<SuggestData>(EMPTY_SUGGEST);
  const [active, setActive] = useState(-1);

  // Debounce 250ms + abort mỗi keystroke/cleanup (plan Task 14).
  useEffect(() => {
    if (!open) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setSuggest(EMPTY_SUGGEST);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(suggestUrl(trimmed, locale), { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((json: SuggestData | null) => {
          if (controller.signal.aborted || !json) return;
          setSuggest({ products: json.products ?? [], categories: json.categories ?? [] });
          setActive(-1);
        })
        .catch(() => {
          // abort/network — dropdown giữ trạng thái cũ, không crash.
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, locale]);

  // Đóng khi mousedown NGOÀI wrapper — guard để click trên item (trong wrap)
  // không đóng trước khi navigate.
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event: MouseEvent) => {
      if (wrapRef.current && event.target instanceof Node && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const items = useMemo<FlatItem[]>(
    () => [
      ...suggest.products.map((product) => ({ id: `p-${product.id}`, href: localePath(`/p/${product.slug}`, locale) })),
      ...suggest.categories.map((category) => ({
        id: `c-${category.slug}`,
        href: localePath(`/c/${category.slug}`, locale),
      })),
    ],
    [suggest, locale],
  );

  const shown = open && items.length > 0;
  const productCount = suggest.products.length;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => moveActive(current, 1, items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => moveActive(current, -1, items.length));
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const target =
      active >= 0 && items[active] !== undefined
        ? items[active].href
        : `${localePath('/search', locale)}?q=${encodeURIComponent(query.trim())}`;
    setOpen(false);
    router.push(target);
  }

  function onBlur(event: React.FocusEvent) {
    // relatedTarget null (click vùng chết) hoặc ngoài wrap → đóng.
    if (wrapRef.current && !(event.relatedTarget instanceof Node && wrapRef.current.contains(event.relatedTarget))) {
      setOpen(false);
    }
  }

  return (
    <div className="search-wrap" ref={wrapRef} onBlur={onBlur}>
      <form className="search-form" action={localePath('/search', locale)} method="get" role="search" onSubmit={onSubmit}>
        <input
          className="search-input"
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={shown}
          aria-controls={shown ? listId : undefined}
          aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
        />
        <button className="search-btn" type="submit" aria-label={copy.search}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </button>
      </form>

      {shown ? (
        <div className="search-suggest">
          <ul id={listId} role="listbox" aria-label={copy.products}>
            {productCount > 0 ? <li className="search-group-title">{copy.products}</li> : null}
            {suggest.products.map((product, index) => (
              <li key={product.id} role="none">
                <a
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={`search-item${index === active ? ' is-active' : ''}`}
                  href={localePath(`/p/${product.slug}`, locale)}
                  onMouseEnter={() => setActive(index)}
                >
                  <span className="search-item-name">{product.name}</span>
                  {product.flashSaleEndsAt ? <span className="search-item-hot">{copy.hot}</span> : null}
                  <span className="search-item-price">{formatVnd(product.price)}</span>
                </a>
              </li>
            ))}
            {suggest.categories.length > 0 ? <li className="search-group-title">{copy.categories}</li> : null}
            {suggest.categories.map((category, index) => {
              const flatIndex = productCount + index;
              return (
                <li key={category.slug} role="none">
                  <a
                    id={`${listId}-${flatIndex}`}
                    role="option"
                    aria-selected={flatIndex === active}
                    className={`search-item${flatIndex === active ? ' is-active' : ''}`}
                    href={localePath(`/c/${category.slug}`, locale)}
                    onMouseEnter={() => setActive(flatIndex)}
                  >
                    <span className="search-item-name">{category.name}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
