'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import AdminNav from '@/components/AdminNav';

interface BlockedDomain {
  id: string;
  domain: string;
  reason: string;
}

export default function SettingsPage() {
  const { session, loading } = useAuth();

  const [blocked,          setBlocked]          = useState<BlockedDomain[]>([]);
  const [fetching,         setFetching]         = useState(true);
  const [newDomain,        setNewDomain]        = useState('');
  const [newReason,        setNewReason]        = useState('');
  const [saving,           setSaving]           = useState(false);
  const [deleteId,         setDeleteId]         = useState<string | null>(null);
  const [error,            setError]            = useState('');

  useEffect(() => {
    if (!session) return;
    loadBlocked();
  }, [session]);

  async function loadBlocked() {
    setFetching(true);
    const { data } = await supabase.from('blocked_domains').select('id, domain, reason').order('domain');
    setBlocked(data ? (data as BlockedDomain[]) : []);
    setFetching(false);
  }

  function normalizeDomain(input: string): string {
    try {
      const url = new URL(input.includes('://') ? input : `https://${input}`);
      return url.hostname;
    } catch {
      return input.trim().toLowerCase();
    }
  }

  async function handleAdd() {
    const domain = normalizeDomain(newDomain);
    if (!domain) return;
    if (blocked.some(d => d.domain === domain)) {
      setError('そのドメインはすでに登録されています');
      return;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('blocked_domains').insert({ domain, reason: newReason.trim() });
    if (err) {
      setError('追加に失敗しました: ' + err.message);
    } else {
      setNewDomain('');
      setNewReason('');
      await loadBlocked();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('blocked_domains').delete().eq('id', id);
    setDeleteId(null);
    await loadBlocked();
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <AdminNav session={session!} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">

          <div>
            <h1 className="text-2xl font-black tracking-tight">設定</h1>
            <p className="text-sm text-slate-500 mt-0.5">AI検索から除外するドメインを管理します</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-700">ブロックドメイン一覧</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              ここに登録したドメインは、AI検索（Serper）のURL候補から除外されます。サブドメインも自動で除外されます。
            </p>

            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDomain}
                  onChange={e => { setNewDomain(e.target.value); setError(''); }}
                  placeholder="例: kakaku.com"
                  className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400 transition-colors"
                />
                <input
                  type="text"
                  value={newReason}
                  onChange={e => setNewReason(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !saving && handleAdd()}
                  placeholder="理由（省略可）"
                  className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400 transition-colors"
                />
                <button
                  onClick={handleAdd}
                  disabled={saving || !newDomain.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? '追加中...' : '追加'}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

            {fetching ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : blocked.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">ブロックドメインは登録されていません</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {blocked.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-2.5 px-1">
                    <div>
                      <span className="text-sm font-mono text-red-700">{d.domain}</span>
                      {d.reason && (
                        <span className="ml-2 text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{d.reason}</span>
                      )}
                    </div>
                    {deleteId === d.id ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleDelete(d.id)} className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors">削除確認</button>
                        <button onClick={() => setDeleteId(null)} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors">取消</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteId(d.id)} className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-red-100 hover:text-red-600 transition-colors">削除</button>
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
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
