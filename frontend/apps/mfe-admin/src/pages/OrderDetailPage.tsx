import { EmptyState } from '@ecommerce/ui-kit';
import type { ReactElement } from 'react';

export interface OrderDetailPageProps {
  id: string;
}

// Placeholder — thay ở Task 7 (SF-7 plan).
export default function OrderDetailPage({ id }: OrderDetailPageProps): ReactElement {
  return <EmptyState title={`Order ${id}`} />;
}
