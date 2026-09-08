// SF-4 (FI-394 T2) — auth flows: validate realtime on-blur + password toggle
// + submit-rỗng KHÔNG gọi API. globals:false → RTL không auto-cleanup —
// cleanup() afterEach + mockClear (pattern accountLayout.test.tsx T1).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import { login } from '../api';

vi.mock('../bootstrap', () => ({ appNavigate: vi.fn() }));

// oauthProviders pending mãi — OAuthButtons không set state sau khi test kết
// thúc (tránh act warning); login spy để assert không bị gọi khi form rỗng.
vi.mock('../api', () => ({
  login: vi.fn(),
  oauthProviders: vi.fn(() => new Promise<{ google: boolean; facebook: boolean }>(() => {}))
}));

const fetchMock = vi.fn();

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.mocked(login).mockClear();
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
