/**
 * cartApi (SF-6) — fetch wrapper same-origin `/api/cart/**` khớp
 * contracts/openapi/cart.yaml. KHÔNG dùng generated client: cartSchema.d.ts
 * (packages/contracts READ-ONLY) chưa reflect amendment A1 (variantId vẫn
 * `required`) — fetch thuần + types tay theo YAML freeze là nguồn sự thật.
 * Mọi mutation xong → dispatch `ecommerce:cart-changed` để CartBadge + các
 * listener (cùng window — PDP qua gateway cũng nhận được) refresh.
 */

export const CART_CHANGED_EVENT = 'ecommerce:cart-changed';

/** Key localStorage giữ token giỏ GUEST — nguồn cho POST /cart/merge khi login
 *  (cookie httpOnly không đọc được từ JS; token lấy từ response Cart.cartToken).
 *  Literal KHÔNG được đổi — AddToCart (storefront-web) ghi cùng key này. */
export const GUEST_CART_TOKEN_KEY = 'ecommerce.guest_cart_token';

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  slug?: string;
  name?: string;
  image?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  unavailable: boolean;
}

export interface Cart {
  cartToken?: string | null;
  items: CartItem[];
  subtotal: number;
}

/** Số lượng badge = Σ qty (chuẩn Tiki — không phải số dòng). */
export function cartCount(cart: Cart | null): number {
  return cart ? cart.items.reduce((sum, item) => sum + item.qty, 0) : 0;
}

export function notifyCartChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
  } catch {
    // non-DOM env (vitest node) — im lặng
  }
}

export function rememberGuestToken(cart: Cart): void {
  if (cart.cartToken) {
    try {
      window.localStorage.setItem(GUEST_CART_TOKEN_KEY, cart.cartToken);
    } catch {
      // storage đầy/private mode — merge-on-login sẽ dùng cookie leniency phía server
    }
  }
}

export function forgetGuestToken(): void {
  try {
    window.localStorage.removeItem(GUEST_CART_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function readGuestToken(): string | null {
  try {
    return window.localStorage.getItem(GUEST_CART_TOKEN_KEY);
  } catch {
    return null;
  }
}

export class CartApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CartApiError';
    this.status = status;
  }
}

async function parse(res: Response): Promise<Cart> {
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail?: unknown }).detail ?? `cart ${res.status}`)
        : `cart ${res.status}`;
    throw new CartApiError(res.status, detail);
  }
  return body as Cart;
}

/** GET /api/cart — guest chưa có giỏ → 404 → trả null (badge coi là 0). */
export async function fetchCart(): Promise<Cart | null> {
  const res = await fetch('/api/cart', { credentials: 'same-origin' });
  if (res.status === 404) return null;
  return parse(res);
}

/** POST /api/cart — cấp giỏ guest (Set-Cookie). */
export async function createCart(): Promise<Cart> {
  return parse(await fetch('/api/cart', { method: 'POST', credentials: 'same-origin' }));
}

/** POST /api/cart/items?slug= — auto-create khi guest mới; slug là HINT enrich
 *  (REQUIREMENT-GAP FI-310: catalog không có id-lookup). */
export async function addCartItem(input: {
  productId: string;
  variantId?: string;
  qty: number;
  slug?: string;
  allowOos?: boolean;
}): Promise<Cart> {
  const params = input.slug ? `?slug=${encodeURIComponent(input.slug)}` : '';
  const cart = await parse(
    await fetch(`/api/cart/items${params}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: input.productId,
        ...(input.variantId ? { variantId: input.variantId } : {}), // A1: OMIT khi null
        qty: input.qty,
        ...(input.allowOos ? { allowOos: true } : {})
      })
    })
  );
  rememberGuestToken(cart);
  notifyCartChanged();
  return cart;
}

export async function updateCartItem(itemId: string, qty: number): Promise<Cart> {
  const cart = await parse(
    await fetch(`/api/cart/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty })
    })
  );
  notifyCartChanged();
  return cart;
}

export async function removeCartItem(itemId: string): Promise<Cart> {
  const cart = await parse(
    await fetch(`/api/cart/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    })
  );
  notifyCartChanged();
  return cart;
}

/** POST /api/cart/merge — JWT tự gắn qua authStore.fetch (singleton federation).
 *  404 (giỏ guest hết hạn) → clear token im lặng, KHÔNG lỗi user. */
export async function mergeGuestCart(
  doFetch: typeof fetch,
  cartToken: string
): Promise<Cart | null> {
  const res = await doFetch('/api/cart/merge', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartToken })
  });
  if (res.status === 404) {
    forgetGuestToken();
    return null;
  }
  const cart = await parse(res);
  forgetGuestToken();
  notifyCartChanged();
  return cart;
}
