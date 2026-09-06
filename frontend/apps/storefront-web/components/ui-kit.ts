/**
 * Server-safe re-exports của ui-kit primitives cho SERVER components.
 *
 * KHÔNG import barrel `@ecommerce/ui-kit` từ server component: barrel kéo
 * cả Tabs/Modal/Drawer/Toast (dùng useRef/useState, chưa đánh dấu 'use
 * client' trong ui-kit source) vào graph RSC → Next 14 lỗi compile
 * "It only works in a Client Component". StarRating (readOnly) + EmptyState
 * thuần React — deep-import trực tiếp source (transpilePackages đã cover).
 *
 * Khi ui-kit thêm 'use client' cho các component stateful → xóa wrapper này,
 * import barrel lại như thường.
 */
export { StarRating } from '../../../packages/ui-kit/src/components/StarRating';
export { EmptyState } from '../../../packages/ui-kit/src/components/EmptyState';
