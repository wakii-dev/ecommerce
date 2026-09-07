/**
 * Live chat embed cho shell (SF-15): env VITE_LIVECHAT_LICENSE_ID có → inject
 * script Tawk-style 1 lần lúc boot; không → im lặng hoàn toàn (không lỗi).
 * Gọi từ main.tsx — guard flag chặn double-inject.
 */
export function injectLiveChat(): void {
  const licenseId = import.meta.env.VITE_LIVECHAT_LICENSE_ID as string | undefined;
  if (!licenseId) return;
  const w = window as typeof window & { __shopvnChatInjected?: boolean };
  if (w.__shopvnChatInjected) return;
  w.__shopvnChatInjected = true;

  const script = document.createElement('script');
  script.src = `https://embed.tawk.to/${licenseId}/default`;
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.body.appendChild(script);
}
