import { describe, expect, it } from 'vitest';

import { isTabKey } from '../components/pdp/PdpTabs';

/**
 * FI-392 review nhóm C P1-4: helper parse hash của PdpTabs deep-link
 * (`#tab-desc|info|reviews`) — hợp lệ mới activate tab + scroll tới panel.
 */
describe('PdpTabs isTabKey — parse location.hash', () => {
  it.each(['tab-desc', 'tab-info', 'tab-reviews'])('%s → true', (key) => {
    expect(isTabKey(key)).toBe(true);
  });

  it.each(['#tab-desc', '', 'random', 'tab-desc '])('%j → false', (key) => {
    expect(isTabKey(key)).toBe(false);
  });

  it('undefined → false (runtime guard)', () => {
    expect(isTabKey(undefined as unknown as string)).toBe(false);
  });
});
