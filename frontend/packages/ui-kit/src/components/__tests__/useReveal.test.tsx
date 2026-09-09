import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useReveal } from '../useReveal';

/**
 * Test useReveal (FI-391 T13) — jsdom (vitest.config.ts). Mock
 * IntersectionObserver (class giả capture callback + spies) + matchMedia để
 * khóa hành vi progressive enhancement: pending chỉ thêm khi IO + motion OK,
 * intersect đầu → bỏ pending + unobserve.
 */

type FakeEntry = { isIntersecting: boolean };
type FakeCallback = (entries: FakeEntry[]) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: FakeCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: FakeCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
}

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

function Harness({ delayMs }: { delayMs?: number }) {
  const ref = useReveal<HTMLDivElement>({ delayMs });
  return <div ref={ref}>Nội dung reveal</div>;
}

function renderHarness(delayMs?: number) {
  const { container } = render(<Harness delayMs={delayMs} />);
  return container.firstElementChild as HTMLElement;
}

/** Observer instance vừa được hook tạo — fail rõ ràng nếu hook no-op */
function firstObserver(): FakeIntersectionObserver {
  const observer = FakeIntersectionObserver.instances[0];
  if (!observer) throw new Error('useReveal đã không tạo IntersectionObserver');
  return observer;
}

afterEach(() => {
  cleanup();
  FakeIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
});

describe('useReveal — progressive enhancement', () => {
  it('IO + motion OK → gắn uk-reveal uk-reveal--pending + observe', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    mockMatchMedia(false);

    const el = renderHarness();
    expect(el.classList.contains('uk-reveal')).toBe(true);
    expect(el.classList.contains('uk-reveal--pending')).toBe(true);

    const observer = firstObserver();
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledWith(el);
  });

  it('intersect (isIntersecting:true) → bỏ --pending + unobserve; chưa intersect → giữ', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    mockMatchMedia(false);

    const el = renderHarness();
    const observer = firstObserver();

    // Chưa cuộn tới → pending còn nguyên
    observer.callback([{ isIntersecting: false }]);
    expect(el.classList.contains('uk-reveal--pending')).toBe(true);
    expect(observer.unobserve).not.toHaveBeenCalled();

    // Lần intersect đầu → bỏ pending, unobserve đúng 1 lần
    observer.callback([{ isIntersecting: true }]);
    expect(el.classList.contains('uk-reveal--pending')).toBe(false);
    expect(el.classList.contains('uk-reveal')).toBe(true);
    expect(observer.unobserve).toHaveBeenCalledTimes(1);
    expect(observer.unobserve).toHaveBeenCalledWith(el);

    // Intersect lần nữa → không gọi thêm (đã unobserve, reveal 1 lần)
    observer.callback([{ isIntersecting: true }]);
    expect(observer.unobserve).toHaveBeenCalledTimes(1);
  });

  it('prefers-reduced-motion: reduce → KHÔNG gắn class, không observe', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    mockMatchMedia(true);

    const el = renderHarness();
    expect(el.classList.contains('uk-reveal')).toBe(false);
    expect(el.classList.contains('uk-reveal--pending')).toBe(false);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it('IntersectionObserver undefined → không class, không crash', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    mockMatchMedia(false);

    const el = renderHarness();
    expect(el.classList.contains('uk-reveal')).toBe(false);
    expect(el.classList.contains('uk-reveal--pending')).toBe(false);
  });

  it('delayMs → style.transitionDelay ms (stagger)', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    mockMatchMedia(false);

    const el = renderHarness(140);
    expect(el.style.transitionDelay).toBe('140ms');
  });
});
