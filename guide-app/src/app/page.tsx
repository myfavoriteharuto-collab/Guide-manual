'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getFavorites } from '@/lib/storage';

interface Category {
  id: string;
  name: string;
}

interface FavProduct {
  id: string;
  name: string;
  model_number: string;
  price: string;
  image_url: string;
  category_id: string | null;
}

interface SearchResult {
  id: string;
  name: string;
  model_number: string;
  maker: string;
  price: string;
  image_url: string;
  categories: { name: string } | null;
}

export default function HomePage() {
  const [categories,     setCategories]     = useState<Category[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [favProducts,    setFavProducts]    = useState<FavProduct[]>([]);
  const [favOpen,        setFavOpen]        = useState(true);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<SearchResult[]>([]);
  const [searching,      setSearching]      = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .eq('is_hidden', false)
      .order('name')
      .then(({ data }) => {
        if (data) setCategories(data as Category[]);
        setLoading(false);
      });

    const ids = getFavorites();
    if (ids.length > 0) {
      supabase
        .from('products')
        .select('id, name, model_number, price, image_url, category_id')
        .in('id', ids)
        .then(({ data }) => {
          if (data) setFavProducts(data as FavProduct[]);
        });
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); setSearching(false); return; }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, model_number, maker, price, image_url, categories(name)')
        .or(`name.ilike.%${q}%,model_number.ilike.%${q}%,maker.ilike.%${q}%`)
        .limit(20);
      setSearchResults((data ?? []) as unknown as SearchResult[]);
      setSearching(false);
    }, 300);
  }, [searchQuery]);

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900">

      {/* ヘッダー */}
      <header className="bg-slate-900 text-white px-5 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-xl font-black tracking-tight flex-1">商品紹介ガイド</h1>
        </div>
        {/* 検索欄 */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="製品名・型番・メーカーで検索"
            className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:bg-white/20 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* 検索結果 */}
      {searchQuery.trim().length >= 2 && (
        <div className="p-5 space-y-2">
          {searching ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-400 font-medium">「{searchQuery}」に一致する商品が見つかりませんでした</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 font-medium">{searchResults.length} 件ヒット</p>
              {searchResults.map(p => (
                <Link
                  key={p.id}
                  href={`/products/${p.id}`}
                  className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-3 hover:border-blue-300 active:scale-[0.98] transition-all"
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-xl object-contain bg-slate-50 border border-slate-100 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 text-sm leading-snug truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{p.model_number}{p.maker ? ` · ${p.maker}` : ''}</p>
                    {p.categories?.name && (
                      <span className="inline-block text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 mt-1 font-medium">{p.categories.name}</span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-700">{p.price}</p>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      )}

      {/* お気に入りセクション（検索中は非表示） */}
      {favProducts.length > 0 && !searchQuery.trim() && (
        <div className="px-5 pt-5">
          <button
            onClick={() => setFavOpen(o => !o)}
            className="flex items-center gap-2 w-full text-left mb-3"
          >
            <span className="text-red-500 text-base">♥</span>
            <span className="text-sm font-bold text-slate-700">お気に入り</span>
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{favProducts.length}件</span>
            <span className="ml-auto text-slate-300 text-xs">{favOpen ? '▲' : '▼'}</span>
          </button>

          {favOpen && (
            <div className="space-y-2 mb-2">
              {favProducts.map(p => (
                <Link
                  key={p.id}
                  href={`/products/${p.id}`}
                  className="flex items-center gap-3 bg-white rounded-2xl border border-red-100 p-3 hover:border-red-300 active:scale-[0.98] transition-all"
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-xl object-contain bg-slate-50 border border-slate-100 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 text-sm leading-snug truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{p.model_number}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-700">{p.price}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="border-t border-slate-100 mb-0" />
        </div>
      )}

      {/* カテゴリグリッド（検索中は非表示） */}
      {!searchQuery.trim() && (
        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-24"><LoadingSpinner /></div>
          ) : categories.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-slate-400 text-lg font-medium">商品が登録されていません</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {categories.map(cat => (
                <Link
                  key={cat.id}
                  href={`/categories/${cat.id}`}
                  className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md hover:border-blue-200 active:scale-95 transition-all"
                >
                  <p className="font-bold text-slate-800 text-base leading-snug">{cat.name}</p>
                  <p className="text-xs text-blue-600 font-medium mt-3">商品を見る →</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

    </main>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-10 w-10 text-blue-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
