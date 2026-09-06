import { useState } from 'react';
import type { ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, Card, Select, Skeleton, StarRating, useToast } from '@ecommerce/ui-kit';
import { stubApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { MOCK_PRODUCT_NAMES } from '../lib/adminStub';
import type { ModerationStatus, StubReview } from '../lib/types';

function productName(productId: string): string {
  return MOCK_PRODUCT_NAMES[productId] ?? productId;
}

export default function ReviewsPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ModerationStatus | ''>('PENDING');

  const reviewsQuery = useQuery({
    queryKey: ['stub-reviews'],
    queryFn: () => stubApi().listReviews()
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['stub-reviews'] });
  };

  const moderate = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      action === 'approve' ? stubApi().approveReview(id) : stubApi().rejectReview(id),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.toast(
        vars.action === 'approve' ? t('admin.reviews.approved') : t('admin.reviews.rejected'),
        { variant: 'success' }
      );
    },
    onError: (error) => toast.toast(String(error), { variant: 'danger' })
  });

  const rows = (reviewsQuery.data ?? []).filter(
    (r) => status === '' || r.status === status
  );

  return (
    <div>
      <div className='admin-page-head'>
        <h1>
          {t('admin.reviews.title')} <span className='admin-badge-mock'>{t('admin.common.mock')}</span>
        </h1>
        <div className='admin-page-head__actions'>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ModerationStatus | '')}
            aria-label={t('admin.common.status')}
          >
            <option value='PENDING'>{t('admin.status.PENDING')}</option>
            <option value='APPROVED'>{t('admin.status.APPROVED')}</option>
            <option value='REJECTED'>{t('admin.status.REJECTED')}</option>
            <option value=''>{t('admin.common.all')}</option>
          </Select>
        </div>
      </div>

      {reviewsQuery.isLoading ? (
        <Skeleton variant='rect' height={200} />
      ) : rows.length === 0 ? (
        <Card>
          <p className='admin-hint'>{t('admin.reviews.empty')}</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((review: StubReview) => (
            <Card key={review.id} data-testid='review-row'>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StarRating value={review.rating} />
                    <strong>{productName(review.productId)}</strong>
                    {review.verifiedPurchase && (
                      <Badge variant='success'>{t('admin.reviews.verified')}</Badge>
                    )}
                    {review.status !== 'PENDING' && (
                      <Badge variant={review.status === 'APPROVED' ? 'primary' : 'danger'}>
                        {t(`admin.status.${review.status}`)}
                      </Badge>
                    )}
                  </div>
                  <div className='admin-hint' style={{ margin: '4px 0' }}>
                    {t('admin.reviews.user')}: {review.userName} · {formatDateTime(review.createdAt)}
                  </div>
                  {review.title !== undefined && review.title !== '' && (
                    <div style={{ fontWeight: 600, margin: '4px 0' }}>{review.title}</div>
                  )}
                  <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{review.content}</p>
                </div>
                {review.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Button
                      onClick={() => moderate.mutate({ id: review.id, action: 'approve' })}
                      disabled={moderate.isPending}
                    >
                      ✓ {t('admin.reviews.approve')}
                    </Button>
                    <Button
                      variant='danger'
                      onClick={() => moderate.mutate({ id: review.id, action: 'reject' })}
                      disabled={moderate.isPending}
                    >
                      ✕ {t('admin.reviews.reject')}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
