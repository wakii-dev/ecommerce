'use client';

import { useEffect } from 'react';

/**
 * Live chat embed (SF-15): env NEXT_PUBLIC_LIVECHAT_LICENSE_ID có → inject
 * script Tawk-style `embed.tawk.to/{propertyId}/default`; không → KHÔNG load
 * gì (không lỗi, không DOM rác). Không tự viết chat engine (boundary pack).
 * Guard window flag — React StrictMode double-effect không inject 2 lần.
 */
export default function LiveChat(): null {
  useEffect(() => {
    const licenseId = process.env.NEXT_PUBLIC_LIVECHAT_LICENSE_ID;
    if (!licenseId) return;
    const w = window as typeof window & { __shopvnChatInjected?: boolean };
    if (w.__shopvnChatInjected) return;
    w.__shopvnChatInjected = true;

    const script = document.createElement('script');
    script.src = `https://embed.tawk.to/${licenseId}/default`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
  }, []);
  return null;
}
