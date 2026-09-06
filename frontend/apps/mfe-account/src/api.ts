// mfe-account/src/api.ts — mỏng, chuyển tiếp từ packages/auth (singleton federation).
// Giữ 1 điểm import để sau này SF-8/9/12 thêm slice riêng (orders/wishlist/affiliate).
export {
  login,
  register,
  logout,
  updateProfile,
  fetchProfile
} from '@ecommerce/auth';
export type { RegisterInput, CredentialsInput, ProfileInput, MeProfile } from '@ecommerce/auth';
