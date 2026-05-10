'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service Worker の登録失敗は無視（PWA機能が使えないだけ）
      });
    }
  }, []);

  return null;
}
