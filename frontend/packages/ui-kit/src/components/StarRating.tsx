import type { MouseEvent } from 'react';

export type StarFill = 'full' | 'half' | 'empty';

export interface StarRatingProps {
  /** Giá trị hiện tại (hỗ trợ nửa sao: 0.5 bước) */
  value: number;
  max?: number;
  /** Cho phép chọn — không truyền = chỉ hiển thị (readOnly) */
  onInput?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}

function fillFor(star: number, value: number): StarFill {
  if (value >= star) return 'full';
  if (value >= star - 0.5) return 'half';
  return 'empty';
}

export function StarRating({
  value,
  max = 5,
  onInput,
  size = 'md',
  className,
  ariaLabel
}: StarRatingProps) {
  const interactive = typeof onInput === 'function';

  const handleClick = (star: number, e: MouseEvent<HTMLButtonElement>) => {
    // click nửa trái sao → i - 0.5, nửa phải → i
    let next = star;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0 && e.clientX - rect.left < rect.width / 2) {
      next = star - 0.5;
    }
    onInput?.(Math.max(0.5, Math.min(next, max)));
  };

  return (
    <span
      className={[
        'uk-stars',
        `uk-stars--${size}`,
        className ?? null
      ]
        .filter(Boolean)
        .join(' ')}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={
        ariaLabel ?? `Đánh giá ${value} trên ${max} sao`
      }
    >
      {Array.from({ length: max }, (_, i) => {
        const star = i + 1;
        const fill = fillFor(star, value);
        const starCls = `uk-star uk-star--${fill}`;
        return interactive ? (
          <button
            key={star}
            type="button"
            className={starCls}
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} sao`}
            onClick={(e) => handleClick(star, e)}
          >
            ★
          </button>
        ) : (
          <span key={star} className={starCls} aria-hidden="true">
            ★
          </span>
        );
      })}
    </span>
  );
}
