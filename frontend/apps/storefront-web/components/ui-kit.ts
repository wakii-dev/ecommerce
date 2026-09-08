/**
 * Re-exports ui-kit primitives (deep-import trực tiếp source —
 * transpilePackages đã cover).
 *
 * Tất cả primitives đã được SF-1 (FI-391) đánh dấu 'use client' đầy đủ, nên
 * cả server lẫn client component đều import an toàn từ đây. Vẫn deep-import
 * thay vì barrel `@ecommerce/ui-kit`: barrel kéo cả Modal/Drawer/... vào
 * graph của mọi consumer — deep-import chỉ nạp đúng primitive cần dùng.
 */
export { StarRating } from '../../../packages/ui-kit/src/components/StarRating';
export { Price } from '../../../packages/ui-kit/src/components/Price';
export { EmptyState } from '../../../packages/ui-kit/src/components/EmptyState';
export { Icon } from '../../../packages/ui-kit/src/components/Icon';
export { Skeleton } from '../../../packages/ui-kit/src/components/Skeleton';
export { ProductCardSkeleton } from '../../../packages/ui-kit/src/components/skeletons';
export { Tabs } from '../../../packages/ui-kit/src/components/Tabs';
export { Modal } from '../../../packages/ui-kit/src/components/Modal';
export {
  ToastProvider,
  useToast,
} from '../../../packages/ui-kit/src/components/Toast';
