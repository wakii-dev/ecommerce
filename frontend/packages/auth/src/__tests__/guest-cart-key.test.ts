import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * FI-399 — guest cart token consistency (binary, pack §7): localStorage key
 * `ecommerce.guest_cart_token` phải là CÙNG 1 literal từ cả 2 app (storefront
 * AddToCart + checkout cartApi) — 1 origin đọc/ghi chung. 2 app KHÔNG import
 * chéo được (mfe-checkout không phụ thuộc storefront-web) → kiểm bằng extract
 * literal từ source của cả 2 + simulate 2 app-context cùng 1 storage.
 */
const here = dirname(fileURLToPath(import.meta.url));
const checkoutCartApi = resolve(here, '../../../../apps/mfe-checkout/src/lib/cartApi.ts');
const storefrontAddToCart = resolve(here, '../../../../apps/storefront-web/components/pdp/AddToCart.tsx');

function extractKeyLiteral(source: string): string | null {
  // P2 (FI-399 review round-2): lược dòng COMMENT (//, *, /*) trước khi match —
  // regex cũ ăn cả key literal NẰM TRONG comment (AddToCart.tsx:16) → binary
  // lock vẫn xanh dù key THẬT ở code (AddToCart.tsx:128) trôi.
  const codeOnly = source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
  const m = /['"`]ecommerce\.guest_cart_token['"`]/.exec(codeOnly);
  return m ? 'ecommerce.guest_cart_token' : null;
}

describe('guest cart token — same-key cross-app (binary)', () => {
  it('key literal ĐỒNG NHẤT ở cartApi (checkout) và AddToCart (storefront)', () => {
    const cartApi = readFileSync(checkoutCartApi, 'utf8');
    const addToCart = readFileSync(storefrontAddToCart, 'utf8');
    const fromCheckout = extractKeyLiteral(cartApi);
    const fromStorefront = extractKeyLiteral(addToCart);
    expect(fromCheckout, 'cartApi phải dùng literal ecommerce.guest_cart_token').toBe('ecommerce.guest_cart_token');
    expect(fromStorefront, 'AddToCart phải dùng cùng literal').toBe(fromCheckout);
  });

  it('2 app-context cùng 1 storage → ghi/đọc roundtrip cùng key', () => {
    const backing = new Map<string, string>();
    const storageAppA = {
      setItem: (k: string, v: string) => void backing.set(k, v),
      getItem: (k: string) => backing.get(k) ?? null
    };
    const storageAppB = { ...storageAppA }; // cùng origin = cùng backing store
    const KEY = 'ecommerce.guest_cart_token';

    storageAppA.setItem(KEY, 'token-abc');
    expect(storageAppB.getItem(KEY), 'app B đọc đúng token app A ghi — cùng origin/key').toBe('token-abc');
    storageAppB.setItem(KEY, 'token-def');
    expect(storageAppA.getItem(KEY)).toBe('token-def');
  });
});
