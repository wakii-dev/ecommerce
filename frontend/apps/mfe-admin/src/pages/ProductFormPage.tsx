import { EmptyState } from '@ecommerce/ui-kit';
import type { ReactElement } from 'react';

export interface ProductFormPageProps {
  /** Có id → edit; không → tạo mới. */
  id?: string;
}

// Placeholder — thay ở Task 5 (SF-7 plan).
export default function ProductFormPage({ id }: ProductFormPageProps): ReactElement {
  return <EmptyState title={id ? `Edit ${id}` : 'New product'} />;
}
