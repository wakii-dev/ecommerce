import { useEffect } from 'react';
import type { ReactElement } from 'react';
// Import TĨNH module federation (vite MF handle) — file này chỉ được nạp khi
// route /skeleton kích hoạt lazy load từ App.tsx.
import Page from 'skeleton/Page';
import HeaderWidget from 'skeleton/HeaderWidget';
import { HeaderSlots } from '../header/HeaderSlots';

interface RemotePageProps {
  /** Báo App bump re-render sau khi registry đổi (widget vào/thoát header). */
  onRegistryChange?: () => void;
}

// Điểm gặp nhau của harness: module Page render từ remote; HeaderWidget do
// SHELL nạp rồi tự ĐĂNG KÝ vào slot 'right' — Header.tsx không hề biết remote
// tồn tại. Remote KHÔNG tự gọi HeaderSlots (registry là của host).
export default function RemotePage({ onRegistryChange }: RemotePageProps): ReactElement {
  useEffect(() => {
    HeaderSlots.register('right', 'skeleton-demo', HeaderWidget);
    onRegistryChange?.();
    return () => {
      HeaderSlots.unregister('right', 'skeleton-demo');
      onRegistryChange?.();
    };
  }, [onRegistryChange]);

  return <Page />;
}
