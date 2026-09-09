import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { HeaderSlots, SiteHeader } from '../index';
import { renderWithProviders } from './setup';

/**
 * SiteHeader render tests (FI-398 T4, spec §3.2): registry component xuất
 * hiện; merge order props TRƯỚC registry SAU; row2 node render; aria-label
 * = 'Trang chủ' (pin giá trị nav.home cũ — P2 critic).
 *
 * i18n: renderWithProviders (setup T13 — P1 critic) initI18n + bọc
 * I18nextProvider instance thật → useT() dịch thật. Registry module-global →
 * mỗi case dùng id riêng + unregister sạch sau mỗi test.
 */
afterEach(() => {
  HeaderSlots.unregister('left', 'test-item');
  HeaderSlots.unregister('right', 'test-item');
});

function StaticLink(): ReactElement {
  return <a href="/registry">Registry link</a>;
}

describe('SiteHeader', () => {
  it('render header scaffolding + aria-label "Trang chủ" (t chrome.header.aria)', async () => {
    const { container } = await renderWithProviders(<SiteHeader />);
    const header = container.querySelector('header.chrome-header');
    expect(header).not.toBeNull();
    expect(header?.getAttribute('aria-label')).toBe('Trang chủ');
    expect(container.querySelectorAll('.chrome-header__row1 [data-slot]')).toHaveLength(3);
  });

  it('component đăng ký registry xuất hiện trong slot đúng', async () => {
    HeaderSlots.register('left', 'test-item', StaticLink);
    const { container } = await renderWithProviders(<SiteHeader />);
    const left = container.querySelector(".chrome-header__row1 [data-slot='left']");
    expect(left?.querySelector('a[href="/registry"]')).not.toBeNull();
    expect(screen.getByText('Registry link')).toBeTruthy();
  });

  it('merge order: props.slots[left] TRƯỚC registry SAU (P2 critic)', async () => {
    HeaderSlots.register('left', 'test-item', StaticLink);
    function PropsLink(): ReactElement {
      return <a href="/props">Props link</a>;
    }
    const { container } = await renderWithProviders(<SiteHeader slots={{ left: [PropsLink] }} />);
    const links = container.querySelectorAll(".chrome-header__row1 [data-slot='left'] a");
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute('href')).toBe('/props'); // props TRƯỚC
    expect(links[1]!.getAttribute('href')).toBe('/registry'); // registry SAU
  });

  it('props.slots render cả khi registry RỖNG (server-render deterministic)', async () => {
    function PropsLink(): ReactElement {
      return <a href="/props">Props link</a>;
    }
    const { container } = await renderWithProviders(<SiteHeader slots={{ right: [PropsLink] }} />);
    const right = container.querySelector(".chrome-header__row1 [data-slot='right']");
    expect(right?.querySelector('a[href="/props"]')).not.toBeNull();
  });

  it('row2 node render vào .chrome-header__row2; không truyền → không có row2', async () => {
    const withRow2 = await renderWithProviders(
      <SiteHeader row2={<nav data-testid="row2-nav">mini nav</nav>} />
    );
    expect(withRow2.getByTestId('row2-nav')).toBeTruthy();
    expect(withRow2.container.querySelector('.chrome-header__row2')).not.toBeNull();

    const withoutRow2 = await renderWithProviders(<SiteHeader />);
    expect(withoutRow2.container.querySelector('.chrome-header__row2')).toBeNull();
  });

  it('className props merge vào chrome-header', async () => {
    const { container } = await renderWithProviders(<SiteHeader className="extra-class" />);
    expect(container.querySelector('header.chrome-header')?.className).toBe(
      'chrome-header extra-class'
    );
  });
});
