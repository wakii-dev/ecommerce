// SF-4 (FI-394 T2) — auth flows: validate realtime on-blur + password toggle
// + submit-rỗng KHÔNG gọi API. globals:false → RTL không auto-cleanup —
// cleanup() afterEach + mockClear (pattern accountLayout.test.tsx T1).
// Review-G1 (FI-394): thêm unit test Forgot/Reset/TwoFactor (trước đó 0 test).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import TwoFactorPage from '../pages/TwoFactorPage';
import { TWOFA_CHALLENGE_KEY, login, verify2fa } from '../api';

vi.mock('../bootstrap', () => ({ appNavigate: vi.fn() }));

// oauthProviders pending mãi — OAuthButtons không set state sau khi test kết
// thúc (tránh act warning); login spy để assert không bị gọi khi form rỗng.
// TWOFA_CHALLENGE_KEY mock GIỮ giá trị thật (api.ts) — test set sessionStorage
// đúng key mà trang đọc.
vi.mock('../api', () => ({
  login: vi.fn(),
  oauthProviders: vi.fn(() => new Promise<{ google: boolean; facebook: boolean }>(() => {})),
  TWOFA_CHALLENGE_KEY: 'ecommerce.2fa.challenge',
  verify2fa: vi.fn()
}));

const fetchMock = vi.fn();

afterEach(() => {
  cleanup();
  // Reset URL — test Reset đổi location.search (token đọc 1 lần lúc render);
  // các test sau không được thấy ?token cũ (safeNextPath đọc location.search).
  window.history.replaceState(null, '', '/');
});

beforeEach(() => {
  vi.mocked(login).mockClear();
  vi.mocked(verify2fa).mockClear();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

beforeAll(async () => {
  await initI18n();
});

describe('LoginPage — validate realtime on-blur + toggle', () => {
  it('blur email rỗng → error inline hiện', () => {
    render(<LoginPage />);
    fireEvent.blur(screen.getByLabelText('Email'));
    expect(screen.getByText('Email không hợp lệ')).toBeTruthy();
  });

  it('nhập email hợp lệ + blur → error biến mất', () => {
    render(<LoginPage />);
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.blur(email); // rỗng → lỗi
    expect(screen.getByText('Email không hợp lệ')).toBeTruthy();
    fireEvent.change(email, { target: { value: 'ban@example.com' } });
    // field đã chạm → onChange re-validate → lỗi biến mất ngay
    expect(screen.queryByText('Email không hợp lệ')).toBeNull();
    fireEvent.blur(email); // blur lại vẫn sạch
    expect(screen.queryByText('Email không hợp lệ')).toBeNull();
  });

  it('blur mật khẩu <8 ký tự → error; đổi ≥8 → mất', () => {
    render(<LoginPage />);
    const pw = screen.getByLabelText('Mật khẩu') as HTMLInputElement;
    fireEvent.change(pw, { target: { value: 'ngan' } });
    fireEvent.blur(pw);
    expect(screen.getByText('Mật khẩu tối thiểu 8 ký tự')).toBeTruthy();
    fireEvent.change(pw, { target: { value: 'du-8-ky-tu' } });
    expect(screen.queryByText('Mật khẩu tối thiểu 8 ký tự')).toBeNull();
  });

  it('toggle mật khẩu → input type password↔text + aria-pressed đổi', () => {
    render(<LoginPage />);
    expect((screen.getByLabelText('Mật khẩu') as HTMLInputElement).type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect((screen.getByLabelText('Mật khẩu') as HTMLInputElement).type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect((screen.getByLabelText('Mật khẩu') as HTMLInputElement).type).toBe('password');
    expect(screen.getByRole('button', { name: 'Hiện mật khẩu' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('submit form rỗng → 2 error inline + KHÔNG gọi API (login + fetch)', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Email không hợp lệ')).toBeTruthy();
    expect(screen.getByText('Mật khẩu tối thiểu 8 ký tự')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('RegisterPage — validate realtime on-blur', () => {
  it('blur họ tên rỗng → error inline hiện; nhập hợp lệ + blur → mất', () => {
    render(<RegisterPage />);
    const fullName = screen.getByLabelText('Họ tên') as HTMLInputElement;
    fireEvent.blur(fullName);
    expect(screen.getByText('Vui lòng nhập họ tên')).toBeTruthy();
    fireEvent.change(fullName, { target: { value: 'Nguyen Van A' } });
    expect(screen.queryByText('Vui lòng nhập họ tên')).toBeNull();
    fireEvent.blur(fullName);
    expect(screen.queryByText('Vui lòng nhập họ tên')).toBeNull();
  });

  it('submit form rỗng → 3 error inline + KHÔNG gọi API', () => {
    render(<RegisterPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(screen.getByText('Vui lòng nhập họ tên')).toBeTruthy();
    expect(screen.getByText('Email không hợp lệ')).toBeTruthy();
    expect(screen.getByText('Mật khẩu tối thiểu 8 ký tự')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordPage — token từ query param + validate on-blur', () => {
  it('token trong URL → form render; blur mật khẩu <8 → error inline; submit ngắn → KHÔNG gọi fetch', () => {
    // Token đọc MỘT lần qua useState initializer từ window.location.search —
    // set URL TRƯỚC render (afterEach đã reset lại '/').
    window.history.replaceState(null, '', '/reset-password?token=tok123');
    render(<ResetPasswordPage />);
    const pw = screen.getByTestId('reset-password-input') as HTMLInputElement;
    fireEvent.change(pw, { target: { value: 'ngan' } });
    fireEvent.blur(pw);
    expect(screen.getByText('Mật khẩu tối thiểu 8 ký tự')).toBeTruthy();
    fireEvent.click(screen.getByTestId('reset-submit'));
    expect(screen.getByText('Mật khẩu tối thiểu 8 ký tự')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('TwoFactorPage — challenge sessionStorage + validate mã', () => {
  it('nhập "abc" blur → fieldError hiện; submit → KHÔNG gọi verify2fa', () => {
    // Challenge set TRƯỚC render — thiếu thì useEffect redirect /login ngay.
    sessionStorage.setItem(TWOFA_CHALLENGE_KEY, 'tok');
    render(<TwoFactorPage />);
    const code = screen.getByLabelText('Mã xác thực');
    fireEvent.change(code, { target: { value: 'abc' } });
    fireEvent.blur(code);
    expect(screen.getByText('Nhập mã 6 số (app authenticator) hoặc mã dự phòng')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(screen.getByText('Nhập mã 6 số (app authenticator) hoặc mã dự phòng')).toBeTruthy();
    expect(verify2fa).not.toHaveBeenCalled();
  });

  it('nhập "123456" submit → verify2fa gọi với (challenge, code)', async () => {
    sessionStorage.setItem(TWOFA_CHALLENGE_KEY, 'tok');
    vi.mocked(verify2fa).mockResolvedValue(undefined);
    render(<TwoFactorPage />);
    fireEvent.change(screen.getByLabelText('Mã xác thực'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(verify2fa).toHaveBeenCalledTimes(1));
    expect(verify2fa).toHaveBeenCalledWith('tok', '123456');
  });
});

describe('ForgotPasswordPage — validate email + submit', () => {
  it('blur email sai định dạng → error inline', () => {
    render(<ForgotPasswordPage />);
    const email = screen.getByLabelText('Email');
    fireEvent.change(email, { target: { value: 'khong-hop-le' } });
    fireEvent.blur(email);
    expect(screen.getByText('Email không hợp lệ')).toBeTruthy();
  });

  it('submit email hợp lệ → fetch gọi đúng 1 lần; 202 → banner gửi thành công', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    render(<ForgotPasswordPage />);
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'ban@example.com' } });
    fireEvent.click(screen.getByTestId('forgot-submit'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('forgot-sent')).toBeTruthy();
  });
});
