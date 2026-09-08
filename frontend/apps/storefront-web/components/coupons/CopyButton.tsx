'use client';

import { useEffect, useRef, useState } from 'react';

import { useToast } from '../ui-kit';
import type { Locale } from '../../lib/format';

/**
 * Nút "Copy" mã coupon (Task 14): navigator.clipboard + fallback execCommand
 * (iframe/http không-secure context); trạng thái "Đã copy" 1.5s rồi hồi.
 * Copy thành công → toast pop (direction §4 — không alert); clipboard chặn →
 * KHÔNG hiện "Đã copy"/toast (honesty — không nói dối user).
 */

async function copyText(code: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(code);
      return;
    } catch {
      // rơi xuống fallback legacy bên dưới.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = code;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function CopyButton({ code, locale }: { code: string; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function onCopy() {
    try {
      await copyText(code);
    } catch {
      return; // clipboard chặn — không hiện "Đã copy" nói dối user.
    }
    setCopied(true);
    toast(locale === 'en' ? 'Copied!' : 'Đã copy', { variant: 'success' });
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="coupon-copy" onClick={onCopy}>
      {copied ? (locale === 'en' ? 'Copied!' : 'Đã copy') : locale === 'en' ? 'Copy' : 'Sao chép'}
    </button>
  );
}
