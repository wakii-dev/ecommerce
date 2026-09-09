import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tabs } from '../Tabs';
import type { TabItem } from '../Tabs';

/**
 * Khóa hành vi keyboard HIỆN CÓ của Tabs (roving tabindex + Arrow ←→) —
 * FI-391 T14 regression lock, KHÔNG định nghĩa behavior mới. Home/End hiện
 * KHÔNG được handle → có chủ ý không assert.
 */
afterEach(cleanup);

const THREE_TABS: TabItem[] = [
  { key: 'one', label: 'Một', content: <p>Nội dung một</p> },
  { key: 'two', label: 'Hai', content: <p>Nội dung hai</p> },
  { key: 'three', label: 'Ba', content: <p>Nội dung ba</p> }
];

function tab(name: string) {
  return screen.getByRole('tab', { name });
}

function tablist() {
  return screen.getByRole('tablist');
}

describe('Tabs — keyboard roving tabindex (3 tab enabled)', () => {
  it('ArrowRight từ tab 1 → tab 2 selected + focus; ArrowLeft → về tab 1', () => {
    render(<Tabs items={THREE_TABS} defaultKey="one" />);

    tab('Một').focus();
    fireEvent.keyDown(tablist(), { key: 'ArrowRight' });
    expect(tab('Hai').getAttribute('aria-selected')).toBe('true');
    expect(tab('Một').getAttribute('aria-selected')).toBe('false');
    expect(document.activeElement).toBe(tab('Hai'));

    fireEvent.keyDown(tablist(), { key: 'ArrowLeft' });
    expect(tab('Một').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Một'));
  });

  it('wrap: ArrowLeft tại tab đầu → tab CUỐI selected + focus', () => {
    render(<Tabs items={THREE_TABS} defaultKey="one" />);

    tab('Một').focus();
    fireEvent.keyDown(tablist(), { key: 'ArrowLeft' });
    expect(tab('Ba').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Ba'));
  });

  it('wrap: ArrowRight tại tab cuối → về tab đầu', () => {
    render(<Tabs items={THREE_TABS} defaultKey="three" />);

    tab('Ba').focus();
    fireEvent.keyDown(tablist(), { key: 'ArrowRight' });
    expect(tab('Một').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Một'));
  });

  it('roving tabindex: chỉ tab active tabIndex=0, còn lại -1', () => {
    render(<Tabs items={THREE_TABS} defaultKey="one" />);

    expect(tab('Một').getAttribute('tabindex')).toBe('0');
    expect(tab('Hai').getAttribute('tabindex')).toBe('-1');
    expect(tab('Ba').getAttribute('tabindex')).toBe('-1');
  });
});

describe('Tabs — disabled bị skip qua', () => {
  const WITH_DISABLED: TabItem[] = [
    { key: 'one', label: 'Một', content: <p>Nội dung một</p> },
    { key: 'two', label: 'Hai', content: <p>Nội dung hai</p>, disabled: true },
    { key: 'three', label: 'Ba', content: <p>Nội dung ba</p> }
  ];

  it('ArrowRight từ tab 1 → nhảy QUA disabled tới tab cuối', () => {
    render(<Tabs items={WITH_DISABLED} defaultKey="one" />);

    tab('Một').focus();
    fireEvent.keyDown(tablist(), { key: 'ArrowRight' });
    expect(tab('Ba').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Ba'));
    expect(tab('Hai').getAttribute('aria-selected')).toBe('false');
    expect(tab('Hai').hasAttribute('disabled')).toBe(true);
  });

  it('ArrowLeft từ tab cuối → về tab đầu (vẫn skip disabled)', () => {
    render(<Tabs items={WITH_DISABLED} defaultKey="three" />);

    tab('Ba').focus();
    fireEvent.keyDown(tablist(), { key: 'ArrowLeft' });
    expect(tab('Một').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Một'));
  });
});
