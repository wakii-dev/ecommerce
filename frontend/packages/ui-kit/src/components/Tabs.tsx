import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled — truyền value + onInput để tự quản lý active tab */
  value?: string;
  onInput?: (key: string) => void;
  /** Uncontrolled — key mặc định (mặc định: items[0]) */
  defaultKey?: string;
  className?: string;
}

/**
 * Tabs với roving tabindex + keyboard ←→ (ARIA tabs pattern).
 * Controlled hoặc uncontrolled.
 */
export function Tabs({ items, value, onInput, defaultKey, className }: TabsProps) {
  const isControlled = value !== undefined;
  const [innerKey, setInnerKey] = useState<string | undefined>(
    defaultKey ?? items[0]?.key
  );
  const activeKey = isControlled ? value : innerKey;
  const activeItem = items.find((item) => item.key === activeKey);
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());

  const select = (key: string) => {
    if (!isControlled) setInnerKey(key);
    onInput?.(key);
  };

  const handleListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;

    const currentIdx = enabled.findIndex((item) => item.key === activeKey);
    const nextIdx =
      e.key === 'ArrowRight'
        ? (currentIdx + 1) % enabled.length
        : (currentIdx - 1 + enabled.length) % enabled.length;
    const next = enabled[nextIdx];
    if (!next) return;

    e.preventDefault();
    select(next.key);
    btnRefs.current.get(next.key)?.focus();
  };

  return (
    <div className={['uk-tabs', className ?? null].filter(Boolean).join(' ')}>
      <div
        className="uk-tabs__list"
        role="tablist"
        onKeyDown={handleListKeyDown}
      >
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              ref={(el) => {
                if (el) btnRefs.current.set(item.key, el);
                else btnRefs.current.delete(item.key);
              }}
              type="button"
              role="tab"
              id={`uk-tab-${item.key}`}
              aria-selected={isActive}
              aria-controls={`uk-tab-panel-${item.key}`}
              className={isActive ? 'uk-tab uk-tab--active' : 'uk-tab'}
              disabled={item.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {activeItem ? (
        <div
          className="uk-tabs__panel"
          role="tabpanel"
          id={`uk-tab-panel-${activeItem.key}`}
          aria-labelledby={`uk-tab-${activeItem.key}`}
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}
