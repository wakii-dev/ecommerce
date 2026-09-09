import type { ReactElement, ReactNode } from 'react';
import { UiKitDemo } from '@ecommerce/ui-kit/demo';
import { CartBadge, Footer, LocaleSwitcher, SiteHeader, ThemeToggle } from '@ecommerce/chrome';

/** Demo block wrapper — nhãn + viền tokens-only, chỉ phục vụ showcase. */
function DemoBlock({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        border: '1px solid var(--c-border)'
      }}
    >
      <strong>{label}</strong>
      {children}
    </div>
  );
}

/**
 * Route `/ui-kit` — demo ui-kit (trên, component `@ecommerce/ui-kit/demo`
 * READ-ONLY) + Chrome showcase (SF-1 FI-398, plan T14): render demo các mảnh
 * chrome từ `@ecommerce/chrome` + badge-from-remote evidence — header THẬT
 * phía trên trang đăng ký badge bởi mfe-checkout (singleton 1 instance
 * chrome, ACCEPTANCE 2). Styles inline tokens-only (KHÔNG hex — convention).
 */
export default function UiKitDemoPage(): ReactElement {
  return (
    <>
      <UiKitDemo />
      <section
        data-testid="chrome-showcase"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}
      >
        <div>
          <h2>Chrome showcase (SF-1 FI-398)</h2>
          <p>
            Header dưới đây là render THỨ 2 của SiteHeader (demo — không thay
            header thật của app phía trên). Badge giỏ thật do mfe-checkout đăng
            ký hiển thị trên header thật.
          </p>
        </div>

        <DemoBlock label="SiteHeader — props.slots + row2 (registry merge SAU props)">
          <div style={{ border: '1px solid var(--c-border)' }}>
            <SiteHeader
              slots={{
                left: [
                  () => (
                    <a href="#" onClick={(e) => e.preventDefault()}>
                      Demo Left
                    </a>
                  )
                ]
              }}
              row2={<span>demo row2</span>}
            />
          </div>
        </DemoBlock>

        <DemoBlock label="CartBadge — stub fetchCart → count 3">
          <CartBadge fetchCart={async () => ({ items: [{ qty: 3 }] })} />
          <p>
            Badge THẬT đăng ký bởi mfe-checkout đang hiển thị trên header phía
            trên (badge-from-remote evidence — 1 instance chrome).
          </p>
        </DemoBlock>

        <DemoBlock label="ThemeToggle — key canonical ecommerce.theme (boot script 1 nguồn)">
          <ThemeToggle />
        </DemoBlock>

        <DemoBlock label="LocaleSwitcher — shell-model (i18n lang + localStorage, KHÔNG URL-locale)">
          <LocaleSwitcher />
        </DemoBlock>

        <DemoBlock label="Footer — chrome-owned (giống footer app non-admin)">
          <Footer />
        </DemoBlock>
      </section>
    </>
  );
}
