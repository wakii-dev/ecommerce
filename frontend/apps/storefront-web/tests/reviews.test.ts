import { describe, expect, it } from 'vitest';

import { breakdownPercentages, buildReviewPayload } from '../lib/reviews-api';

/**
 * FE helpers SF-8 (Task 12): payload builder + breakdown width % — pure fns,
 * không đụng network/DOM (vitest run ngoài browser).
 */

describe('buildReviewPayload', () => {
  it('giữ rating + content, title rỗng → OMIT', () => {
    expect(buildReviewPayload({ rating: 5, title: '   ', content: ' Tốt ' })).toEqual({
      rating: 5,
      content: 'Tốt',
    });
  });

  it('title có nội dung → giữ nguyên sau trim', () => {
    expect(buildReviewPayload({ rating: 3, title: ' Ổn ', content: 'x' })).toEqual({
      rating: 3,
      title: 'Ổn',
      content: 'x',
    });
  });
});

describe('breakdownPercentages', () => {
  it('đủ key "5".."1" theo thứ tự, thiếu key → 0', () => {
    const rows = breakdownPercentages({ '5': 6, '3': 2 });
    expect(rows.map((r) => r.star)).toEqual(['5', '4', '3', '2', '1']);
    expect(rows.find((r) => r.star === '4')?.count).toBe(0);
  });

  it('width % chuẩn hóa theo sao nhiều nhất', () => {
    const rows = breakdownPercentages({ '5': 4, '4': 2, '1': 1 });
    expect(rows.find((r) => r.star === '5')?.percent).toBe(100);
    expect(rows.find((r) => r.star === '4')?.percent).toBe(50);
    expect(rows.find((r) => r.star === '1')?.percent).toBe(25);
  });

  it('breakdown rỗng → mọi count 0, percent 0 (max guard không chia 0)', () => {
    const rows = breakdownPercentages({});
    expect(rows.every((r) => r.count === 0 && r.percent === 0)).toBe(true);
  });
});
