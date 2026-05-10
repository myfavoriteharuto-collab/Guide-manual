'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import AdminNav from '@/components/AdminNav';
import { useRouter } from 'next/navigation';

const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export default function UsersPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [fetching, setFetching]   = useState(true);
  const [email, setEmail]         = useState('');
  const [adding, setAdding]       = useState(false);
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);
  const [message, setMessage]     = useState('');
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!session) return;
    if (session.user.email !== SUPER_ADMIN_EMAIL) {
      router.replace('/dashboard');
      return;
    }
    loadUsers();
  }, [session]);

  async function loadUsers() {
    setFetching(true);
    const res = await fetch('/api/users');
    const json = await res.json();
    if (res.ok) setUsers(json.users as AdminUser[]);
    setFetching(false);
  }

  async function handleAddUser() {
    if (!email.trim()) return;
    setAdding(true);
    setError('');
    setMessage('');

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? '追加に失敗しました');
    } else {
      setMessage(`${email} にログインリンクを送りました（届かない場合は時間をおいて再送してください）`);
      setEmail('');
      await loadUsers();
    }
    setAdding(false);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? '削除に失敗しました');
    } else {
      await loadUsers();
    }
    setDeleteId(null);
    setDeleting(false);
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <AdminNav session={session} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">

          <div>
            <h1 className="text-2xl font-black tracking-tight">ユーザー管理</h1>
            <p className="text-sm text-slate-500 mt-0.5">管理者アカウントの招待・削除ができます</p>
          </div>

          {/* ユーザー追加フォーム */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-700">新しい管理者を追加</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              メールアドレスにログインリンクを送信します。<br />
              リンクをクリックするとすぐに管理画面にアクセスできます。
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); setMessage(''); }}
                onKeyDown={e => e.key === 'Enter' && !adding && handleAddUser()}
                placeholder="example@example.com"
                className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={handleAddUser}
                disabled={adding || !email.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {adding ? '送信中...' : 'ログインリンクを送る'}
              </button>
            </div>

            {message && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-sm text-green-700 font-medium">✓ {message}</p>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}
          </div>

          {/* ユーザー一覧 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-700">登録済みユーザー</h2>
            {fetching ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : users.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">ユーザーが登録されていません</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map(user => (
                  <div key={user.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{user.email}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        登録: {new Date(user.created_at).toLocaleDateString('ja-JP')}
                        {user.last_sign_in_at && (
                          <span className="ml-2">最終ログイン: {new Date(user.last_sign_in_at).toLocaleDateString('ja-JP')}</span>
                        )}
                        {!user.last_sign_in_at && (
                          <span className="ml-2 text-amber-500">未ログイン（招待中）</span>
                        )}
                      </p>
                    </div>
                    {/* 自分自身は削除不可 */}
                    {user.email !== session?.user?.email && (
                      deleteId === user.id ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={deleting}
                            className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {deleting ? '削除中' : '削除確認'}
                          </button>
                          <button
                            onClick={() => setDeleteId(null)}
                            className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteId(user.id)}
                          className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-red-100 hover:text-red-600 transition-colors shrink-0"
                        >
                          削除
                        </button>
                      )
                    )}
                    {user.email === session?.user?.email && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-bold shrink-0">自分</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </>
  );
}

function LoadingScreen() {
  return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
