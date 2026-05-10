'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DiagnosisWizard from '@/components/DiagnosisWizard';
import { getSavedCompare, setSavedCompare, getFavorites } from '@/lib/storage';

interface Category { id: string; name: string; }

interface Product {
  id: string;
  name: string;
  model_number: string;
  maker: string;
  price: string;
  image_url: string;
}

const MAX_COMPARE = 5;

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [category,       setCategory]       = useState<Category | null>(null);
  const [products,       setProducts]       = useState<Product[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [compareIds,     setCompareIds]     = useState<Set<string>>(() => new Set(getSavedCompare(id)));
  const [showWizard,     setShowWizard]     = useState(false);
  const [favIds,         setFavIds]         = useState<Set<string>>(() => new Set(getFavorites()));
  const [favOpen,        setFavOpen]        = useState(true);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceInput,     setPriceInput]     = useState('');
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const [{ data: cat }, { data: prods }] = await Promise.all([
        supabase.from('categories').select('id, name').eq('id', id).single(),
        supabase
          .from('products')
          .select('id, name, model_number, maker, price, image_url')
          .eq('category_id', id)
          .order('sort_order', { ascending: true }),
      ]);
      if (cat) setCategory(cat as Category);
      if (prods) {
        setProducts(prods as Product[]);
        // sessionStorage から価格上書きを復元
        const overrides: Record<string, string> = {};
        for (const p of prods as Product[]) {
          const v = sessionStorage.getItem(`price_override_${p.id}`);
          if (v) overrides[p.id] = v;
        }
        setPriceOverrides(overrides);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const filtered = products.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.model_number.toLowerCase().includes(q) ||
      p.maker.toLowerCase().includes(q)
    );
  });

  function toggleCompare(productId: string) {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else if (next.size < MAX_COMPARE) {
        next.add(productId);
      }
      setSavedCompare(id, [...next]);
      return next;
    });
  }

  function startCompare() {
    router.push(`/compare?ids=${[...compareIds].join(',')}`);
  }

  function savePrice(productId: string) {
    const val = priceInput.trim();
    sessionStorage.setItem(`price_override_${productId}`, val);
    setPriceOverrides(prev => ({ ...prev, [productId]: val }));
    setEditingPriceId(null);
  }

  function startEditPrice(e: React.MouseEvent, productId: string) {
    e.preventDefault();
    e.stopPropagation();
    setPriceInput(priceOverrides[productId] ?? '');
    setEditingPriceId(productId);
  }

  return (
    <main className={`min-h-screen bg-slate-50 font-sans text-slate-900 ${compareIds.size > 0 ? 'pb-24' : ''}`}>

      {/* ヘッダー */}
      <header className="bg-slate-900 text-white px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="text-slate-300 hover:text-white text-sm transition-colors shrink-0"
          >
            ← 戻る
          </button>
          <h1 className="text-lg font-bold truncate">
            {category ? category.name : '読み込み中...'}
          </h1>
        </div>
      </header>

      {/* ウィザードモーダル */}
      {showWizard && (
        <DiagnosisWizard
          categoryId={id}
          onClose={() => setShowWizard(false)}
          onStartCompare={ids => {
            const next = new Set(ids.slice(0, MAX_COMPARE));
            setCompareIds(next);
            setSavedCompare(id, [...next]);
          }}
        />
      )}

      {/* ウィザードボタン */}
      {!loading && products.length > 0 && (
        <div className="px-5 pt-4">
          <button
            onClick={() => setShowWizard(true)}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span>🔍</span>
            お客様と一緒に商品を探す
          </button>
        </div>
      )}

      {/* 検索フィルター */}
      {!loading && products.length > 0 && (
        <div className="px-5 pt-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="製品名・型番・メーカーで絞り込み"
            className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <p className="text-xs text-slate-400 mt-2 px-1">{filtered.length} 件</p>
          )}
        </div>
      )}

      {/* 比較モード説明（商品が2件以上のとき） */}
      {!loading && products.length >= 2 && compareIds.size === 0 && (
        <p className="text-xs text-slate-400 px-6 pt-3">
          カード右上の <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 text-[10px] font-bold">+</span> で商品を選んで比較できます
        </p>
      )}

      {/* このカテゴリのお気に入り */}
      {!loading && (() => {
        const favInCategory = products.filter(p => favIds.has(p.id));
        if (favInCategory.length === 0) return null;
        return (
          <div className="px-5 pt-3 space-y-2">
            <button
              onClick={() => setFavOpen(o => !o)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-red-500 text-sm">♥</span>
              <span className="text-xs font-bold text-slate-700">このカテゴリのお気に入り</span>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{favInCategory.length}件</span>
              <span className="ml-auto text-slate-300 text-xs">{favOpen ? '▲' : '▼'}</span>
            </button>
            {favOpen && favInCategory.map(p => {
              const isSelected = compareIds.has(p.id);
              const isDisabled = !isSelected && compareIds.size >= MAX_COMPARE;
              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl border-2 transition-all ${isSelected ? 'border-blue-500 shadow-md' : 'border-red-200'}`}
                >
                  <Link href={`/products/${p.id}`} className="block bg-red-50 p-3 hover:bg-red-100 active:bg-red-200 transition-colors rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-3 pr-8">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-100 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 text-sm leading-snug">{p.model_number}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{p.name}{p.maker ? ` · ${p.maker}` : ''}</p>
                      </div>
                      <div className="shrink-0 text-right" onClick={e => e.stopPropagation()}>
                        {editingPriceId === p.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={priceInput}
                            onChange={e => {
                              const digits = e.target.value.replace(/[^0-9]/g, '');
                              setPriceInput(digits ? `¥${Number(digits).toLocaleString('ja-JP')}` : '');
                            }}
                            onBlur={() => savePrice(p.id)}
                            onKeyDown={e => { if (e.key === 'Enter') savePrice(p.id); if (e.key === 'Escape') setEditingPriceId(null); }}
                            className="w-24 border border-blue-300 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <button
                            onClick={e => startEditPrice(e, p.id)}
                            className={`text-sm hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors ${priceOverrides[p.id] ? 'font-bold text-slate-700' : 'text-slate-400'}`}
                          >
                            {priceOverrides[p.id] || 'タップして入力'}
                          </button>
                        )}
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => toggleCompare(p.id)}
                    disabled={isDisabled}
                    className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : isDisabled ? 'bg-white border-slate-200 text-slate-300 cursor-not-allowed' : 'bg-white border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500'}`}
                    aria-label={isSelected ? '比較から外す' : '比較に追加'}
                  >
                    {isSelected ? '✓' : '+'}
                  </button>
                </div>
              );
            })}
            <div className="border-t border-slate-100 mt-1" />
          </div>
        );
      })()}

      {/* 商品リスト */}
      <div className="p-5 space-y-3">
        {loading ? (
          <div className="flex justify-center py-24"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-slate-400 text-lg font-medium">
              {products.length === 0
                ? 'このカテゴリの商品はまだ登録されていません'
                : '条件に一致する商品がありません'}
            </p>
            <button
              onClick={() => router.push('/')}
              className="text-blue-600 text-sm mt-3 hover:underline"
            >
              ← カテゴリ一覧に戻る
            </button>
          </div>
        ) : (
          filtered.map(product => {
            const isSelected = compareIds.has(product.id);
            const isDisabled = !isSelected && compareIds.size >= MAX_COMPARE;
            return (
              <div
                key={product.id}
                className={`relative rounded-2xl border-2 transition-all ${
                  isSelected ? 'border-blue-500 shadow-md' : 'border-slate-200'
                }`}
              >
                {/* メインカード（タップで詳細へ） */}
                <Link
                  href={`/products/${product.id}`}
                  className="block bg-white p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors rounded-2xl overflow-hidden"
                >
                  <div className="flex items-center gap-3 pr-8">
                    {/* サムネイル */}
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-16 h-16 rounded-xl object-contain bg-slate-50 border border-slate-100 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-100 shrink-0 flex items-center justify-center">
                        <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    {/* テキスト情報 */}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 text-base leading-snug">
                        {product.model_number}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {product.name}
                        {product.name && product.maker ? ' · ' : ''}
                        {product.maker}
                      </p>
                    </div>
                    {/* 価格（タップで編集） */}
                    <div className="shrink-0 text-right" onClick={e => e.stopPropagation()}>
                      {editingPriceId === product.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={priceInput}
                          onChange={e => {
                            const digits = e.target.value.replace(/[^0-9]/g, '');
                            setPriceInput(digits ? `¥${Number(digits).toLocaleString('ja-JP')}` : '');
                          }}
                          onBlur={() => savePrice(product.id)}
                          onKeyDown={e => { if (e.key === 'Enter') savePrice(product.id); if (e.key === 'Escape') setEditingPriceId(null); }}
                          className="w-24 border border-blue-300 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <button
                          onClick={e => startEditPrice(e, product.id)}
                          className={`text-sm hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors ${priceOverrides[product.id] ? 'font-bold text-slate-700' : 'text-slate-400'}`}
                        >
                          {priceOverrides[product.id] || 'タップして入力'}
                        </button>
                      )}
                    </div>
                  </div>
                </Link>

                {/* 比較追加ボタン（Link の外に配置してナビゲーション非連動） */}
                <button
                  onClick={() => toggleCompare(product.id)}
                  disabled={isDisabled}
                  className={`absolute top-3 right-3 z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                      : isDisabled
                        ? 'bg-white border-slate-200 text-slate-300 cursor-not-allowed'
                        : 'bg-white border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500'
                  }`}
                  aria-label={isSelected ? '比較から外す' : '比較に追加'}
                >
                  {isSelected ? '✓' : '+'}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 比較バー（1件以上選択時に固定表示） */}
      {compareIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t-2 border-blue-500 px-5 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-sm font-bold text-slate-700 flex-1">
            {compareIds.size} 件選択中
            <span className="text-xs text-slate-400 font-normal ml-1">（最大 {MAX_COMPARE} 件）</span>
          </span>
          <button
            onClick={() => { setCompareIds(new Set()); setSavedCompare(id, []); }}
            className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            クリア
          </button>
          <button
            onClick={startCompare}
            disabled={compareIds.size < 2}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            比較する →
          </button>
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
