'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [sent,     setSent]     = useState(false);

  const isSuperAdmin = email.trim() === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) router.replace('/');
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isSuperAdmin) {
      // スーパー管理者はパスワードでログイン
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError('メールアドレスまたはパスワードが正しくありません');
        setLoading(false);
      }
    } else {
      // その他の管理者はマジックリンクでログイン
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: 'https://guide-admin.vercel.app/login',
        },
      });
      if (error) {
        setError(error.message === 'Signups not allowed for otp'
          ? 'このメールアドレスは登録されていません'
          : error.message);
        setLoading(false);
      } else {
        setSent(true);
        setLoading(false);
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">ガイド</h1>
            <p className="text-sm text-slate-500 mt-1">管理者ログイン</p>
          </div>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-800">メールを送信しました</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                {email} にログインリンクを送りました。<br />
                メールのリンクをクリックしてログインしてください。
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="text-xs text-blue-600 hover:underline"
              >
                別のメールアドレスで試す
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">メールアドレス</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {isSuperAdmin && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">パスワード</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              )}

              {!isSuperAdmin && email.trim() && (
                <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                  ログインリンクをメールで送信します
                </p>
              )}

              {error && (
                <p className="text-sm text-red-600 font-medium bg-red-50 rounded-xl p-3 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors mt-2"
              >
                {loading ? '送信中...' : isSuperAdmin ? 'ログイン' : 'ログインリンクを送る'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
