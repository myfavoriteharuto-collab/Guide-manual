'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import AdminNav from '@/components/AdminNav';

type FilterKey = 'all' | 'last7' | 'last30' | 'noImage';

interface Product {
  id: string;
  name: string;
  model_number: string;
  maker: string;
  image_url: string;
  created_at: string;
  categoryName: string;
}

export default function DashboardPage() {
  const { session, loading } = useAuth();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [fetching, setFetching]       = useState(true);
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [expanded, setExpanded]       = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session]);

  async function loadData() {
    setFetching(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, model_number, maker, image_url, created_at, categories(name)')
      .order('created_at', { ascending: false });

    if (data) {
      setAllProducts(data.map(p => ({
        id:           p.id,
        name:         p.name,
        model_number: p.model_number,
        maker:        p.maker,
        image_url:    p.image_url ?? '',
        created_at:   p.created_at,
        categoryName: (p.categories as unknown as { name: string } | null)?.name ?? '未分類',
      })));
    }
    setFetching(false);
  }

  // フィルター適用
  const filtered = useMemo(() => {
    const now = new Date();
    const d7  = new Date(now); d7.setDate(d7.getDate() - 7);
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

    switch (filter) {
      case 'last7':   return allProducts.filter(p => new Date(p.created_at) >= d7);
      case 'last30':  return allProducts.filter(p => new Date(p.created_at) >= d30);
      case 'noImage': return allProducts.filter(p => !p.image_url);
      default:        return allProducts;
    }
  }, [allProducts, filter]);

  // カテゴリ別集計
  const byCategory = useMemo(() => {
    const map: Record<string, Product[]> = {};
    for (const p of filtered) {
      if (!map[p.categoryName]) map[p.categoryName] = [];
      map[p.categoryName].push(p);
    }
    return Object.entries(map)
      .map(([name, products]) => ({ name, count: products.length, products }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // 各フィルターの件数
  const now  = new Date();
  const d7   = new Date(now); d7.setDate(d7.getDate() - 7);
  const d30  = new Date(now); d30.setDate(d30.getDate() - 30);
  const counts = {
    all:     allProducts.length,
    last7:   allProducts.filter(p => new Date(p.created_at) >= d7).length,
    last30:  allProducts.filter(p => new Date(p.created_at) >= d30).length,
    noImage: allProducts.filter(p => !p.image_url).length,
  };

  const filterLabel: Record<FilterKey, string> = {
    all:     'すべての商品',
    last7:   '過去7日間に追加',
    last30:  '過去30日間に追加',
    noImage: '画像なしの商品',
  };

  if (loading) return <LoadingScreen />;

  return (
    <>
      <AdminNav session={session} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">

          <h1 className="text-2xl font-black tracking-tight">ダッシュボード</h1>

          {fetching ? (
            <div className="flex justify-center py-20"><LoadingSpinner /></div>
          ) : (
            <>
              {/* ── サマリーカード（クリックでフィルター） ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="登録商品数"  value={counts.all}     unit="件"     color="blue"   active={filter === 'all'}     onClick={() => { setFilter('all');     setExpanded(null); }} />
                <StatCard label="過去7日間"   value={counts.last7}   unit="件追加"  color="green"  active={filter === 'last7'}   onClick={() => { setFilter('last7');   setExpanded(null); }} />
                <StatCard label="過去30日間"  value={counts.last30}  unit="件追加"  color="indigo" active={filter === 'last30'}  onClick={() => { setFilter('last30');  setExpanded(null); }} />
                <StatCard label="画像なし"    value={counts.noImage} unit="件"     color="amber"  active={filter === 'noImage'} onClick={() => { setFilter('noImage'); setExpanded(null); }} />
              </div>

              {/* 現在のフィルター表示 */}
              <p className="text-sm text-slate-500">
                <span className="font-bold text-slate-700">{filterLabel[filter]}</span> を表示中 — {filtered.length} 件
              </p>

              {/* ── カテゴリ別（アコーディオン） ── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">カテゴリ別登録数</h2>
                {filtered.length === 0 ? (
                  <p className="text-sm text-slate-400">該当する商品がありません</p>
                ) : (
                  <div className="space-y-2">
                    {byCategory.map(({ name, count, products }) => (
                      <div key={name} className="rounded-xl border border-slate-100 overflow-hidden">
                        <button
                          onClick={() => setExpanded(expanded === name ? null : name)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-bold text-slate-700 flex items-center gap-2">
                              {name}
                              <span className="text-slate-400 text-xs font-normal">{expanded === name ? '▲' : '▼'}</span>
                            </span>
                            <span className="text-slate-500 font-bold">{count} 件</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${filtered.length > 0 ? (count / filtered.length) * 100 : 0}%` }}
                            />
                          </div>
                        </button>

                        {expanded === name && (
                          <div className="border-t border-slate-100 divide-y divide-slate-100">
                            {products.map(p => (
                              <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-blue-50 transition-colors">
                                {p.image_url ? (
                                  <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-200 shrink-0" />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0 flex items-center justify-center text-slate-400 text-xs">no img</div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                                  <p className="text-xs text-slate-400">{p.maker} · {p.model_number || '—'}</p>
                                </div>
                                <Link
                                  href={`/products/${p.id}`}
                                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors shrink-0"
                                >
                                  編集
                                </Link>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </>
          )}

        </div>
      </main>
    </>
  );
}

function StatCard({ label, value, unit, color, active, onClick }: {
  label: string; value: number; unit: string;
  color: 'blue' | 'green' | 'indigo' | 'amber';
  active: boolean; onClick: () => void;
}) {
  const colors = {
    blue:   { base: 'text-blue-700',   active: 'bg-blue-600 text-white border-blue-600',   inactive: 'bg-blue-50 border-slate-200 hover:border-blue-400' },
    green:  { base: 'text-green-700',  active: 'bg-green-600 text-white border-green-600',  inactive: 'bg-green-50 border-slate-200 hover:border-green-400' },
    indigo: { base: 'text-indigo-700', active: 'bg-indigo-600 text-white border-indigo-600', inactive: 'bg-indigo-50 border-slate-200 hover:border-indigo-400' },
    amber:  { base: 'text-amber-700',  active: 'bg-amber-500 text-white border-amber-500',  inactive: 'bg-amber-50 border-slate-200 hover:border-amber-400' },
  };
  const c = colors[color];
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 shadow-sm p-5 text-left w-full transition-all ${active ? c.active : `${c.inactive} ${c.base}`}`}
    >
      <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">{label}</p>
      <p className="text-3xl font-black">{value}</p>
      <p className="text-xs font-medium opacity-70 mt-0.5">{unit}</p>
    </button>
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
