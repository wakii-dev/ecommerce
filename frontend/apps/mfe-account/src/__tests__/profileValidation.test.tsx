// SF-4 (FI-394 T4) — AccountPage profile: validate realtime on-blur
// (fullName bắt buộc, phone optional format vi) + submit gọi updateProfile
// đúng payload + role badge tint. Globals:false → cleanup afterEach
// (pattern authValidation.test.tsx T2). TwoFactorSection render THẬT
// (enabled=false → nhánh idle) nhưng không thao tác.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import AccountPage from '../pages/AccountPage';
import { fetchProfile, updateProfile } from '../api';

vi.mock('../bootstrap', () => ({
  appNavigate: vi.fn(),
  authReady: Promise.resolve(true)
}));

vi.mock('@ecommerce/auth', () => ({
  authStore: { isAuthenticated: vi.fn(() => true) },
  useAuth: vi.fn(() => ({ user: { email: 'x@y.vn', roles: ['CUSTOMER'] } }))
}));

vi.mock('../api', () => ({
  fetchProfile: vi.fn(),
  updateProfile: vi.fn(),
  // TwoFactorSection import 3 helper này — render thật nhưng test không đụng.
  setup2fa: vi.fn(),
  enable2fa: vi.fn(),
  disable2fa: vi.fn()
}));

const PROFILE = {
  id: 'u-1',
  email: 'x@y.vn',
  fullName: 'Nguyen Van A',
  phone: null,
  roles: ['CUSTOMER'],
  twoFactorEnabled: false
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.mocked(fetchProfile).mockResolvedValue({ ...PROFILE });
  vi.mocked(updateProfile).mockClear();
});

beforeAll(async () => {
  await initI18n();
});

/** Render + chờ prefill xong (authReady → fetchProfile → set state) để tránh
 *  effect ghi đè giá trị mình vừa gõ giữa test. */
async function renderPrefilled(): Promise<void> {
  render(<AccountPage />);
  await screen.findByLabelText('Họ tên');
  await waitFor(() => {
    expect((screen.getByLabelText('Họ tên') as HTMLInputElement).value).toBe('Nguyen Van A');
  });
}

describe('AccountPage — profile validate realtime on-blur', () => {
  it('blur họ tên rỗng → error inline; nhập lại → mất', async () => {
    await renderPrefilled();
    const fullName = screen.getByLabelText('Họ tên') as HTMLInputElement;
    fireEvent.change(fullName, { target: { value: '' } });
    fireEvent.blur(fullName);
    expect(screen.getByText('Vui lòng nhập họ tên')).toBeTruthy();
    fireEvent.change(fullName, { target: { value: 'Tran Thi B' } });
    expect(screen.queryByText('Vui lòng nhập họ tên')).toBeNull();
  });

  it('blur phone "abc" → error phoneInvalid; xóa rỗng → hợp lệ (optional)', async () => {
    await renderPrefilled();
    const phone = screen.getByLabelText('Số điện thoại') as HTMLInputElement;
    expect(phone.getAttribute('inputmode')).toBe('tel');
    fireEvent.change(phone, { target: { value: 'abc' } });
    fireEvent.blur(phone);
    expect(screen.getByText('Số điện thoại không hợp lệ')).toBeTruthy();
    fireEvent.change(phone, { target: { value: '' } });
    expect(screen.queryByText('Số điện thoại không hợp lệ')).toBeNull();
  });

  it('phone rỗng + blur → KHÔNG error (optional field)', async () => {
    await renderPrefilled();
    fireEvent.blur(screen.getByLabelText('Số điện thoại'));
    expect(screen.queryByText('Số điện thoại không hợp lệ')).toBeNull();
  });

  it('submit hợp lệ (phone có giá trị) → updateProfile payload { fullName, phone }', async () => {
    vi.mocked(updateProfile).mockResolvedValue({ ...PROFILE });
    await renderPrefilled();
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith({ fullName: 'Nguyen Van A', phone: '0901234567' });
  });

  it('submit hợp lệ (phone rỗng) → updateProfile payload phone: null', async () => {
    vi.mocked(updateProfile).mockResolvedValue({ ...PROFILE });
    await renderPrefilled();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith({ fullName: 'Nguyen Van A', phone: null });
  });

  it('role CUSTOMER → badge "Khách hàng" (không raw role)', async () => {
    await renderPrefilled();
    expect(screen.getByText('Khách hàng')).toBeTruthy();
    expect(screen.queryByText('CUSTOMER')).toBeNull();
  });
});
