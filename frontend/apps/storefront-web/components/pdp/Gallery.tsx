'use client';

import { useState } from 'react';
import type { MouseEvent } from 'react';

import type { Locale } from '../../lib/format';
import { tParams } from '../../lib/i18n';

/**
 * Gallery PDP (direction §2.5, plan Task 13): ảnh chính aspect 1/1 (url rỗng
 * → gradient theo danh mục + emoji), flag -% góc trên-trái nền primary, thumbs
 * 72×72 active border primary. 1 ảnh → không render thumbs.
 * Zoom-lens §2.3: chỉ khi ảnh thật — mousemove set --mx/--my (px trong ảnh),
 * css scale 1.18 + lens (gate hover+pointer:fine — placeholder không zoom).
 * URL rỗng/ảnh placeholder seed /media/** → <img> thường (protocol SF-4,
 * <Image> khi ảnh thật — cùng quyết định ProductCardView).
 * T12: aria-label thumbs vi/en (trước đây hardcode vi cả 2 locale).
 */

/** Set --mx/--my (px trong ảnh) trên wrapper — transform-origin + lens theo con trỏ. */
function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--mx', `${Math.round(event.clientX - rect.left)}px`);
  event.currentTarget.style.setProperty('--my', `${Math.round(event.clientY - rect.top)}px`);
}

export interface GalleryProps {
  images: ReadonlyArray<{ url?: string; alt?: string }>;
  name: string;
  /** Gradient CSS theo danh mục (categoryGradient) — nền placeholder. */
  gradient: string;
  /** Emoji đi kèm placeholder (categoryEmoji). */
  emoji: string;
  /** % giảm giá (chỉ hiện flag khi có). */
  percent?: number;
  /** Locale cho aria-label thumbs (T12 — i18n). */
  locale: Locale;
}

export default function Gallery({ images, name, gradient, emoji, percent, locale }: GalleryProps) {
  const [active, setActive] = useState(0);
  const current = images[Math.min(active, Math.max(0, images.length - 1))];
  const hasImage = Boolean(current?.url);

  return (
    <div className="pdp-gallery">
      <div
        className={`pdp-gallery-main${hasImage ? ' pdp-gallery-main--zoom' : ''}`}
        style={hasImage ? undefined : { background: gradient }}
        onMouseMove={hasImage ? handleMouseMove : undefined}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- placeholder seed /media/**, <Image> khi ảnh thật (SF-4 protocol)
          <img src={current?.url} alt={current?.alt ?? name} />
        ) : (
          <span className="pdp-gallery-emoji" aria-hidden="true">
            {emoji}
          </span>
        )}
        {percent !== undefined ? <span className="pdp-gallery-flag">-{percent}%</span> : null}
      </div>

      {images.length > 1 ? (
        <div className="pdp-gallery-thumbs" role="tablist" aria-label={tParams(locale, 'pdp.galleryThumbs', { name })}>
          {images.slice(0, 4).map((image, index) => (
            <button
              key={`${image.url ?? 'ph'}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={tParams(locale, 'pdp.galleryImage', { name, n: index + 1 })}
              className={`pdp-thumb${index === active ? ' pdp-thumb--active' : ''}`}
              style={image.url ? undefined : { background: gradient }}
              onClick={() => setActive(index)}
            >
              {image.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- xem trên
                <img src={image.url} alt="" loading="lazy" />
              ) : (
                <span aria-hidden="true">{emoji}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
