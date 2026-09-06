import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Render-prop: nhận error để fallback UI tự quyết định hiển thị gì */
  fallback: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Bắt lỗi render / lazy-import của subtree (VD: remote down → dynamic import
 * reject) để shell không unmount cả root → trắng trang. KHÔNG retry import
 * tại chỗ — React lazy cache promise đã reject, retry thật = reload trang.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Harness: log console là đủ; app thật thay bằng error reporting.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error !== null) return this.props.fallback(error);
    return this.props.children;
  }
}
