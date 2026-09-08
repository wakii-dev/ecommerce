import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { initI18n } from '@ecommerce/i18n';
import MiniCartDrawer from './MiniCartDrawer';

/**
 * SSR smoke (FI-393 T3) — mfe-checkout KHÔNG có @testing-library (dep freeze):
 * verify logic-level qua renderToStaticMarkup. Drawer đóng → useOverlay chưa
 * có container + open=false → render null, KHÔNG được gọi createPortal
 * (createPortal trong server render ném lỗi — đây chính là guard).
 */
describe('MiniCartDrawer', () => {
  it('open=false → markup rỗng (không portal lúc SSR, không crash)', async () => {
    await initI18n();
    const html = renderToStaticMarkup(
      <MiniCartDrawer open={false} onClose={() => undefined} />
    );
    expect(html).toBe('');
  });
});
