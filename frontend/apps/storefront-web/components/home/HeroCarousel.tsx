'use client';

import { useEffect, useState } from 'react';

import { localePath, type Locale } from '../../lib/format';

/**
 * Hero carousel (direction §2.2.1) — 3 slide gradient 120deg §1.8, kicker +
 * title 44px/800 + CTA "Mua ngay" (nền --c-accent chữ đen 800) → /c/dien-tu;
 * ribbon trắng xoay -8deg; arrows tròn 38px trắng alpha .92; dots 9px
 * (active 22px); track translateX .45s; auto-rotate 5s, clear interval khi
 * unmount.
 */

interface HeroSlide {
  gradient: string;
  kicker: string;
  title: string;
  ribbon: string;
}

const SLIDES: Record<Locale, HeroSlide[]> = {
  vi: [
    { gradient: 'var(--grad-hero-1)', kicker: 'Siêu sale cuối tuần', title: 'Giảm đến 50% Điện Tử', ribbon: '50% OFF' },
    { gradient: 'var(--grad-hero-2)', kicker: 'Chính hãng 100%', title: 'Công nghệ giá tốt mỗi ngày', ribbon: 'HOT' },
    { gradient: 'var(--grad-hero-3)', kicker: 'Freeship toàn quốc', title: 'Thời trang & Làm đẹp', ribbon: 'NEW' },
  ],
  en: [
    { gradient: 'var(--grad-hero-1)', kicker: 'Weekend mega sale', title: 'Up to 50% off Electronics', ribbon: '50% OFF' },
    { gradient: 'var(--grad-hero-2)', kicker: '100% official', title: 'Great tech deals every day', ribbon: 'HOT' },
    { gradient: 'var(--grad-hero-3)', kicker: 'Free shipping nationwide', title: 'Fashion & Beauty', ribbon: 'NEW' },
  ],
};

const CTA_LABEL: Record<Locale, string> = { vi: 'Mua ngay', en: 'Shop now' };
const ROTATE_MS = 5000;

export default function HeroCarousel({ locale }: { locale: Locale }) {
  const slides = SLIDES[locale];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  const ctaHref = localePath('/c/dien-tu', locale);

  return (
    <section className="hero" aria-roledescription="carousel" aria-label="Khuyến mãi nổi bật">
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
            <a className="hero-cta" href={ctaHref} tabIndex={slideIndex === index ? undefined : -1}>
              {CTA_LABEL[locale]}
            </a>
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
    </section>
  );
}
