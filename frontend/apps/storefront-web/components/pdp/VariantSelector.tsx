'use client';

import { useEffect, useState } from 'react';

import { collectOptions, pickVariant, type PdpVariant } from '../../lib/pdp';

/**
 * VariantSelector PDP (plan Task 13): swatch tròn 38px cho màu (active: viền
 * primary + ring primary-tint) + chip min 46×38 cho size (active primary
 * tint). State selection {color, size} NỘI BỘ — tự pick lựa đầu trên mount
 * CHỈ khi dimension có >1 option; đổi chọn → báo variantId lên trên qua
 * onChange (null = combo không có variant khớp).
 */

export interface VariantSelectorProps {
  variants: readonly PdpVariant[];
  /** Nhãn song ngữ (vd "Màu"). */
  colorLabel: string;
  sizeLabel: string;
  onChange: (variantId: string | null) => void;
}

export default function VariantSelector({ variants, colorLabel, sizeLabel, onChange }: VariantSelectorProps) {
  const colors = collectOptions(variants, 'color');
  const sizes = collectOptions(variants, 'size');
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);

  // Auto-pick lựa đầu CHỈ khi dimension có >1 option (đơn option → để trống,
  // không giả lập lựa chọn người dùng).
  useEffect(() => {
    if (colors.length > 1) setColor(colors[0] ?? null);
    if (sizes.length > 1) setSize(sizes[0] ?? null);
    // Chạy 1 lần trên mount — danh sách options của 1 product là bất biến.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = pickVariant(variants, { color, size });

  useEffect(() => {
    onChange(selected?.id ?? null);
    // onChange từ cha (ổn định theo ngữ cảnh render); báo lên mỗi lần match đổi.
  }, [selected, onChange]);

  if (colors.length === 0 && sizes.length === 0) return null;

  return (
    <div className="pdp-variants">
      {colors.length > 0 ? (
        <div className="pdp-variant-group">
          <span className="pdp-variant-label">
            {colorLabel}: <strong>{color ?? '—'}</strong>
          </span>
          <div className="pdp-swatches">
            {colors.map((value) => (
              <button
                key={value}
                type="button"
                className={`pdp-swatch${color === value ? ' pdp-swatch--active' : ''}`}
                style={swatchColor(value)}
                aria-pressed={color === value}
                aria-label={`${colorLabel}: ${value}`}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {sizes.length > 0 ? (
        <div className="pdp-variant-group">
          <span className="pdp-variant-label">
            {sizeLabel}: <strong>{size ?? '—'}</strong>
          </span>
          <div className="pdp-chips">
            {sizes.map((value) => (
              <button
                key={value}
                type="button"
                className={`pdp-chip${size === value ? ' pdp-chip--active' : ''}`}
                aria-pressed={size === value}
                onClick={() => setSize(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Màu swatch từ TÊN option (vi/en seed) — map tên quen thuộc sang hex; tên lạ
 * → gradient中性 xám. Variant-level màu chi tiết (direction §1.8 thumbnail
 * theo màu variant) là refinement có ảnh thật — seed chỉ có tên text.
 */
const SWATCH_HEX: ReadonlyArray<readonly [RegExp, string]> = [
  [/đ[eê]n|den|black/i, '#1a1a1a'],
  [/tr[ăa]ng|white/i, '#ffffff'],
  [/navy|xanh\s*du[uơ]ng|blue/i, '#22355c'],
  [/đ[ôo]|đ[ôo]?\s*|red/i, '#d0011b'],
  [/v[àa]ng|yellow/i, '#f2b90c'],
  [/\bbe\b|cream/i, '#d9c7a7'],
  [/xanh\s*l[áa]|green/i, '#1f7a45'],
  [/h[ôo]ng|pink/i, '#f4a7b9'],
];

function swatchColor(name: string): { background: string } {
  for (const [pattern, hex] of SWATCH_HEX) {
    if (pattern.test(name)) return { background: hex };
  }
  return { background: 'linear-gradient(140deg, #E0E0E0, #BDBDBD)' };
}
