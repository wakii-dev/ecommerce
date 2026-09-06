'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown flash sale (direction §3) — format hh:mm:ss, hộp 36×36 nền
 * #212121 (token --c-text) chữ --c-accent, tabular-nums 18px/800, tick 1s.
 *
 * Hydration-safe: render placeholder `--` đến khi mounted rồi mới tick
 * (SSR render Date.now() khác client hydration render → tránh mismatch text);
 * hết hạn (hoặc endsAt parse NaN) → return null — block ẩn.
 */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function remaining(endsAt: string, now: number): { h: string; m: string; s: string } | null {
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return null;
  const diffSeconds = Math.floor((end - now) / 1000);
  if (diffSeconds <= 0) return null;
  return {
    h: pad2(Math.floor(diffSeconds / 3600)),
    m: pad2(Math.floor((diffSeconds % 3600) / 60)),
    s: pad2(diffSeconds % 60),
  };
}

export default function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Chưa mounted (SSR + lần hydrate đầu) → placeholder, không đoán mốc.
  if (now === null) {
    return (
      <span className="countdown" role="timer" aria-label="Đếm ngược flash sale">
        <span className="countdown-box">--</span>
        <span className="countdown-sep" aria-hidden="true">
          :
        </span>
        <span className="countdown-box">--</span>
        <span className="countdown-sep" aria-hidden="true">
          :
        </span>
        <span className="countdown-box">--</span>
      </span>
    );
  }

  const parts = remaining(endsAt, now);
  if (!parts) return null;

  return (
    <span className="countdown" role="timer" aria-label="Đếm ngược flash sale">
      <span className="countdown-box">{parts.h}</span>
      <span className="countdown-sep" aria-hidden="true">
        :
      </span>
      <span className="countdown-box">{parts.m}</span>
      <span className="countdown-sep" aria-hidden="true">
        :
      </span>
      <span className="countdown-box">{parts.s}</span>
    </span>
  );
}
