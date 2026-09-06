import type { ReactElement } from 'react';
import { UiKitDemo } from '@ecommerce/ui-kit/demo';

/** Route `/ui-kit` — demo ui-kit, tự chứa theme switcher (storefront ↔ admin). */
export default function UiKitDemoPage(): ReactElement {
  return <UiKitDemo />;
}
