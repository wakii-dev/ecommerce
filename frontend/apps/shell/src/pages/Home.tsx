import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { Link } from '../router';

/** Route `/` — shell thuần, không chạm remote nào. */
export default function Home(): ReactElement {
  const { t } = useT();
  return (
    <section>
      <h1>{t('nav.home')}</h1>
      <p>Shell thuần (MF host) — harness SF-2, chưa nạp remote nào ở route này.</p>
      <ul>
        <li>
          <Link to="/skeleton">/skeleton — nạp remote &quot;skeleton/Page&quot; qua Module Federation</Link>
        </li>
        <li>
          <Link to="/ui-kit">/ui-kit — demo @ecommerce/ui-kit (2 theme)</Link>
        </li>
      </ul>
    </section>
  );
}
