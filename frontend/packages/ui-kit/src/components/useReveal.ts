import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export interface RevealOptions {
  /** Tỉ lệ phần tử phải hiện ra để kích hoạt (mặc định 0.12 — hand-off §3.2) */
  threshold?: number;
  /** Trễ transition trước khi reveal (ms) — dùng cho stagger tuần tự */
  delayMs?: number;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Scroll-reveal progressive enhancement — KHÔNG CSS-default-hidden:
 *
 * - Class `uk-reveal uk-reveal--pending` chỉ được hook THÊM BẰNG JS khi mọi
 *   điều kiện OK, nên SSR / no-JS → nội dung vẫn hiện sẵn (không trắng trang).
 * - `IntersectionObserver` undefined → no-op (browser cũ).
 * - `prefers-reduced-motion: reduce` → no-op (hook chặn 1; css global chặn
 *   thêm lần 2 — belt-and-suspenders).
 * - Observe với `threshold`; intersect LẦN ĐẦU → bỏ `--pending` + unobserve
 *   (reveal đúng 1 lần). Cleanup disconnect khi unmount.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options?: RevealOptions
): RefObject<T> {
  const ref = useRef<T | null>(null);
  const { threshold = 0.12, delayMs } = options ?? {};

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia(REDUCED_MOTION_QUERY).matches
    ) {
      return;
    }

    el.classList.add('uk-reveal', 'uk-reveal--pending');
    if (delayMs !== undefined) {
      el.style.transitionDelay = `${delayMs}ms`;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!el.classList.contains('uk-reveal--pending')) return; // reveal 1 lần
          el.classList.remove('uk-reveal--pending');
          observer.unobserve(el);
          break;
        }
      },
      { threshold }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [threshold, delayMs]);

  return ref;
}
