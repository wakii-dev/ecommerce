/**
 * Đăng ký @font-face Be Vietnam Pro bằng JS FontFace API (SF-1 FI-391 — hand-off §1.6).
 *
 * VÌ SAO KHÔNG @font-face trong tokens.css: Vite dev KHÔNG rebase url() trong
 * css module của package dùng chung qua MF (@module-federation/vite) — browser
 * resolve './assets/fonts/…' theo document origin → spa-fallback trả HTML →
 * face error (verified 2026-09-09). `?url` import đi qua module graph nên Vite
 * trả đúng /@fs/ URL (dev) và hashed asset (build) ở CẢ HAI biên MF.
 *
 * Import ở cả 2 biên (FI-368 T11): main.tsx (standalone) + bootstrap.tsx (host).
 * Server-safe: guard document/FontFace — Next RSC import không làm gì.
 */

// latin subset — đủ ASCII + ký hiệu phổ thông
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
// vietnamese subset — dấu tiếng Việt
const VIET_RANGE = 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB';

import latin400 from '../assets/fonts/be-vietnam-pro-400-latin.woff2?url';
import viet400 from '../assets/fonts/be-vietnam-pro-400-vietnamese.woff2?url';
import latin500 from '../assets/fonts/be-vietnam-pro-500-latin.woff2?url';
import viet500 from '../assets/fonts/be-vietnam-pro-500-vietnamese.woff2?url';
import latin600 from '../assets/fonts/be-vietnam-pro-600-latin.woff2?url';
import viet600 from '../assets/fonts/be-vietnam-pro-600-vietnamese.woff2?url';
import latin700 from '../assets/fonts/be-vietnam-pro-700-latin.woff2?url';
import viet700 from '../assets/fonts/be-vietnam-pro-700-vietnamese.woff2?url';
import latin800 from '../assets/fonts/be-vietnam-pro-800-latin.woff2?url';
import viet800 from '../assets/fonts/be-vietnam-pro-800-vietnamese.woff2?url';

// jsdom/Node không có FontFace — im lặng no-op (font là chuyện browser).
if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
  for (const [weight, url, range] of [
    ['400', latin400, LATIN_RANGE],
    ['400', viet400, VIET_RANGE],
    ['500', latin500, LATIN_RANGE],
    ['500', viet500, VIET_RANGE],
    ['600', latin600, LATIN_RANGE],
    ['600', viet600, VIET_RANGE],
    ['700', latin700, LATIN_RANGE],
    ['700', viet700, VIET_RANGE],
    ['800', latin800, LATIN_RANGE],
    ['800', viet800, VIET_RANGE]
  ] as const) {
    const face = new FontFace('Be Vietnam Pro', `url(${url})`, {
      weight,
      style: 'normal',
      display: 'swap',
      unicodeRange: range
    });
    void face.load().then((loaded) => document.fonts.add(loaded)).catch(() => {
      // font fail (mạng/asset) — text vẫn render fallback, không chặn app
    });
  }
}
