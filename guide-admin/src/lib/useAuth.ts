'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

export function useAuth() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // URLハッシュにトークンがある場合（マジックリンク・招待）はリダイレクトしない
    const hasToken = window.location.hash.includes('access_token');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setLoading(false);
      if (!session && !hasToken) router.replace('/login');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return { session, loading };
}
