'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { localePath, type Locale } from '../../lib/format';
import { HERO_SLIDES, t } from '../../lib/i18n';

/**
 * Hero carousel (direction §2.2.1) — 3 slide gradient 120deg §1.8 (ken-burns
 * glow qua .hero-slide::before trong app.css), kicker + title 44px/800 + CTA
 * "Mua ngay" (nền --c-accent chữ đen 800) → /c/dien-tu; ribbon trắng xoay
 * -8deg; arrows tròn 38px trắng alpha .92; dots 9px (active 22px); track
 * translateX var(--dur-carousel) ease.
 *
 * A11y autoplay (§3.3): auto-rotate 6s — pause khi hover/focus-within section
 * (clear interval, resume khi rời) + nút pause/play thật (aria-label vi/en +
 * aria-pressed = autoplay đang tạm dừng bởi user). prefers-reduced-motion →
 * KHÔNG auto-rotate vĩnh viễn (chỉ arrows/dots; nút play disabled).
 * T12: slides + copy hero nằm trong lib/i18n (HERO_SLIDES + miền `hero`).
 */

const ROTATE_MS = 6000;

export default function HeroCarousel({ locale }: { locale: Locale }) {
  const slides = HERO_SLIDES[locale];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [motionReduced, setMotionReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMotionReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Auto-rotate 6s — dừng khi user pause, hover/focus section, hoặc reduced-motion.
  useEffect(() => {
    if (paused || hovered || motionReduced) return undefined;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, hovered, motionReduced, slides.length]);

  const ctaHref = localePath('/c/dien-tu', locale);

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Khuyến mãi nổi bật"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className="hero-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide, slideIndex) => (
          <div
            key={slide.gradient}
            className="hero-slide"
            style={{ background: slide.gradient }}
            aria-hidden={slideIndex !== index}
          >
            <p className="hero-kicker">{slide.kicker}</p>
            <h2 className="hero-title">{slide.title}</h2>
            <Link className="hero-cta" href={ctaHref} tabIndex={slideIndex === index ? undefined : -1}>
              {t(locale, 'hero.cta')}
            </Link>
            <span className="hero-ribbon" aria-hidden="true">
              {slide.ribbon}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="hero-arrow hero-arrow--prev"
        aria-label={locale === 'en' ? 'Previous slide' : 'Slide trước'}
        onClick={() => setIndex((current) => (current - 1 + slides.length) % slides.length)}
      >
        ‹
      </button>
      <button
        type="button"
        className="hero-arrow hero-arrow--next"
        aria-label={locale === 'en' ? 'Next slide' : 'Slide sau'}
        onClick={() => setIndex((current) => (current + 1) % slides.length)}
      >
        ›
      </button>
      <div className="hero-dots">
        {slides.map((slide, slideIndex) => (
          <button
            key={slide.gradient}
            type="button"
            className={slideIndex === index ? 'hero-dot is-active' : 'hero-dot'}
            aria-label={locale === 'en' ? `Go to slide ${slideIndex + 1}` : `Chuyển đến slide ${slideIndex + 1}`}
            aria-current={slideIndex === index}
            onClick={() => setIndex(slideIndex)}
          />
        ))}
      </div>
      <button
        type="button"
        className="hero-pause"
        aria-label={t(locale, 'hero.pause')}
        aria-pressed={paused}
        disabled={motionReduced}
        onClick={() => setPaused((current) => !current)}
      >
        {paused ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 1.5v9l7-4.5z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z" fill="currentColor" />
          </svg>
        )}
      </button>
    </section>
  );
}
