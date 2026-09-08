// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CopyButton from '../components/coupons/CopyButton';
import { ToastProvider } from '../components/ui-kit';

/**
 * FI-392 review nhóm C P1-4: CopyButton honesty — copy THÀNH CÔNG mới được
 * hiện "Đã copy" + toast; clipboard chặn/fallback execCommand nổ → KHÔNG
 * đổi trạng thái, KHÔNG toast (không nói dối user — doc component).
 * locale 'vi': nhãn nút 'Sao chép' → 'Đã copy' (lib/i18n miền `coupons`).
 */

function renderCopyButton() {
  return render(
    createElement(ToastProvider, null, createElement(CopyButton, { code: 'SAVE10K', locale: 'vi' })),
  );
}

function mockClipboard(writeText: (code: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

function stubExecCommand(impl: () => never) {
  const execCommand = vi.fn(impl);
  document.execCommand = execCommand as unknown as typeof document.execCommand;
  return execCommand;
}

afterEach(() => {
  // gỡ mock instance-prop shadow prototype getter của jsdom
  Reflect.deleteProperty(window.navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
  vi.restoreAllMocks();
});

describe('CopyButton — honesty', () => {
  it('copy success → nút "Đã copy" + toast success đúng 1 lần, không fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const execCommand = stubExecCommand(() => {
      throw new Error('fallback không được gọi khi clipboard xong');
    });
    renderCopyButton();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Đã copy' })).toBeTruthy();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(execCommand).not.toHaveBeenCalled();

    const toasts = document.querySelectorAll('.uk-toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.className).toContain('uk-toast--success');
    expect(toasts[0]?.textContent).toContain('Đã copy');
  });

  it('copy fail (clipboard reject + execCommand throw) → giữ "Sao chép", KHÔNG toast', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard blocked'));
    mockClipboard(writeText);
    const execCommand = stubExecCommand(() => {
      throw new Error('execCommand blocked');
    });
    renderCopyButton();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
    });

    // clipboard reject → rơi fallback execCommand('copy') — cũng nổ
    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sao chép' }).textContent).toBe('Sao chép');
    expect(screen.queryByRole('button', { name: 'Đã copy' })).toBeNull();
    expect(document.querySelectorAll('.uk-toast')).toHaveLength(0);
  });
});
