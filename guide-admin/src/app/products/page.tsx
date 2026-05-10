'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import AdminNav from '@/components/AdminNav';

interface Product {
  id: string;
  created_at: string;
  name: string;
  model_number: string;
  maker: string;
  price: string;
  image_url: string;
  sort_order: number;
  category_id: string | null;
  categories: { name: string } | null;
  spec_data: Record<string, string> | null;
  source_url: string | null;
  spec_manual_keys: string[];
  spec_hidden_keys: string[];
}

export default function ProductsPage() {
  const { session, loading } = useAuth();

  const [products,        setProducts]        = useState<Product[]>([]);
  const [categories,      setCategories]      = useState<{ id: string; name: string; spec_keys: string[] }[]>([]);
  const [fetching,        setFetching]        = useState(true);
  const [filterCategory,  setFilterCategory]  = useState('');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [deleteId,        setDeleteId]        = useState<string | null>(null);
  const [deleting,        setDeleting]        = useState(false);
  const [sortMode,        setSortMode]        = useState(false);
  const [sortList,        setSortList]        = useState<Product[]>([]);
  const [sortSaving,      setSortSaving]      = useState(false);
  const [reanalyzingId,   setReanalyzingId]   = useState<string | null>(null);
  const [bulkProgress,    setBulkProgress]    = useState<{ current: number; total: number } | null>(null);
  const [scoredIds,       setScoredIds]       = useState<Set<string>>(new Set());
  const [incompleteIds,   setIncompleteIds]   = useState<Set<string>>(new Set());
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [bulkDeleting,    setBulkDeleting]    = useState(false);
  const topScrollRef   = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session]);

  async function loadAll() {
    setFetching(true);
    const [{ data: prods }, { data: cats }, { data: scores }] = await Promise.all([
      supabase
        .from('products')
        .select('id, created_at, name, model_number, maker, price, image_url, sort_order, category_id, spec_data, source_url, spec_manual_keys, spec_hidden_keys, categories(name)')
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('id, name, spec_keys').order('name'),
      supabase.from('wizard_scores').select('product_id, reason'),
    ]);
    if (prods)  setProducts(prods as unknown as Product[]);
    if (cats)   setCategories(cats);
    if (scores) {
      setScoredIds(new Set(scores.map(s => s.product_id)));
      setIncompleteIds(new Set(scores.filter(s => !s.reason).map(s => s.product_id)));
    }
    setFetching(false);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await supabase.from('products').delete().eq('id', id);
    setDeleteId(null);
    setDeleting(false);
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    await loadAll();
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`選択した ${selectedIds.size} 件の商品を削除します。この操作は元に戻せません。`)) return;
    setBulkDeleting(true);
    await supabase.from('products').delete().in('id', [...selectedIds]);
    setSelectedIds(new Set());
    setBulkDeleting(false);
    await loadAll();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  }

  function enterSortMode() {
    const base = products
      .filter(p => p.categories?.name === filterCategory)
      .sort((a, b) => a.sort_order - b.sort_order);
    setSortList(base);
    setSortMode(true);
  }

  function moveSortItem(index: number, dir: -1 | 1) {
    const next = [...sortList];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setSortList(next);
  }

  async function saveSortOrder() {
    setSortSaving(true);
    await Promise.all(
      sortList.map((p, i) =>
        supabase.from('products').update({ sort_order: i }).eq('id', p.id)
      )
    );
    setSortSaving(false);
    setSortMode(false);
    await loadAll();
  }

  function handleExportCSV() {
    const headers = ['カテゴリ', '製品名', '型番', 'メーカー', '価格', '登録日'];
    const rows = filtered.map(p => [
      p.categories?.name ?? '',
      p.name,
      p.model_number,
      p.maker,
      p.price,
      new Date(p.created_at).toLocaleDateString('ja-JP'),
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    // BOM付きUTF-8（Excelで文字化けしないように）
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `商品一覧_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkReanalyze() {
    const targets = filtered.filter(p => getMissingSpecKeys(p).length > 0 && p.source_url && p.category_id);
    if (targets.length === 0) return;
    setBulkProgress({ current: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      setBulkProgress({ current: i + 1, total: targets.length });
      await handleReanalyze(targets[i]);
    }
    setBulkProgress(null);
    await loadAll();
  }

  async function handleReanalyze(product: Product) {
    if (!product.source_url || !product.category_id) return;
    setReanalyzingId(product.id);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: product.source_url, category_id: product.category_id }),
      });
      const json = await res.json();
      if (!res.ok) { alert('再解析に失敗しました: ' + (json.error ?? '')); return; }
      const d = json.data;

      // 既存のspec_dataを残しつつ、不足キーのみAI結果でマージ
      // さらに手入力済みキーは必ず既存値を優先
      const existingSpecData = product.spec_data ?? {};
      const manualKeys = new Set(product.spec_manual_keys ?? []);
      const aiSpecData = Object.fromEntries(
        Object.entries(d.spec_data as Record<string, string>).filter(([k]) => !manualKeys.has(k))
      );
      const mergedSpecData = { ...aiSpecData, ...existingSpecData };

      await supabase.from('products').update({
        spec_data: mergedSpecData,
      }).eq('id', product.id);
      // 一括処理中でない場合のみリロード
      if (!bulkProgress) await loadAll();
    } catch {
      // 一括処理中はスキップして続行
      if (!bulkProgress) alert('再解析中にエラーが発生しました');
    } finally {
      setReanalyzingId(null);
    }
  }

  function getMissingSpecKeys(product: Product): string[] {
    const cat = categories.find(c => c.id === product.category_id);
    if (!cat || cat.spec_keys.length === 0) return [];
    const hiddenKeys = new Set(product.spec_hidden_keys ?? []);
    const filled = Object.keys(product.spec_data ?? {}).filter(k => (product.spec_data?.[k] ?? '').trim() !== '');
    return cat.spec_keys.filter(k => !filled.includes(k) && !hiddenKeys.has(k));
  }

  // フィルタリング
  const filtered = products
    .filter(p => !filterCategory || p.categories?.name === filterCategory)
    .filter(p => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.model_number.toLowerCase().includes(q) ||
        p.maker.toLowerCase().includes(q)
      );
    });

  if (loading) return <LoadingScreen />;

  return (
    <>
      <AdminNav session={session!} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-5">

          {/* ヘッダー */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black tracking-tight">商品一覧</h1>
              <p className="text-sm text-slate-500 mt-0.5">{products.length} 件登録済み</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {bulkDeleting ? '削除中...' : `選択した ${selectedIds.size} 件を削除`}
                </button>
              )}
              <button
                onClick={handleExportCSV}
                disabled={filtered.length === 0}
                className="px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                CSVダウンロード
              </button>
              {(() => {
                const bulkTargets = filtered.filter(p => getMissingSpecKeys(p).length > 0 && p.source_url && p.category_id);
                return bulkTargets.length > 0 ? (
                  <button
                    onClick={handleBulkReanalyze}
                    disabled={!!bulkProgress}
                    className="px-4 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {bulkProgress
                      ? `解析中… ${bulkProgress.current}/${bulkProgress.total}`
                      : `一括AI再解析（${bulkTargets.length}件）`}
                  </button>
                ) : null;
              })()}
              <button
                onClick={enterSortMode}
                disabled={!filterCategory}
                title={!filterCategory ? 'カテゴリを選択してください' : ''}
                className="px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                並び順を変更
              </button>
              <Link
                href="/import"
                className="px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
              >
                CSVで一括登録
              </Link>
              <Link
                href="/spec-search"
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                + 商品を登録
              </Link>
            </div>
          </div>

          {/* フィルター */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors bg-white"
            >
              <option value="">すべてのカテゴリ</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="製品名・型番・メーカーで検索"
              className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors flex-1 min-w-[180px] bg-white"
            />
            <span className="text-sm text-slate-400 shrink-0">{filtered.length} 件</span>
          </div>

          {/* 並び順変更モード */}
          {sortMode && (
            <div className="bg-white rounded-2xl border-2 border-orange-300 overflow-hidden">
              <div className="bg-orange-50 px-5 py-3 flex items-center justify-between border-b border-orange-200">
                <div>
                  <p className="text-sm font-bold text-orange-700">並び順を変更中 — {filterCategory}</p>
                  <p className="text-xs text-orange-500 mt-0.5">↑↓ で順番を入れ替えて「保存する」を押してください</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSortMode(false)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={saveSortOrder}
                    disabled={sortSaving}
                    className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 disabled:opacity-50 transition-colors"
                  >
                    {sortSaving ? '保存中...' : '保存する'}
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {sortList.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="w-6 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-contain bg-slate-50 border border-slate-100 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.model_number}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveSortItem(i, -1)}
                        disabled={i === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSortItem(i, 1)}
                        disabled={i === sortList.length - 1}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* テーブル */}
          {fetching ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <p className="text-slate-400 font-medium">
                {products.length === 0 ? '商品が登録されていません' : '条件に一致する商品がありません'}
              </p>
              {products.length === 0 && (
                <Link href="/spec-search" className="text-blue-600 text-sm mt-2 inline-block hover:underline">
                  商品を登録する →
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* 上部スクロールバー */}
              <div
                ref={topScrollRef}
                className="overflow-x-auto border-b border-slate-100"
                style={{ height: 12 }}
                onScroll={e => {
                  if (tableScrollRef.current) tableScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }}
              >
                <div style={{ height: 1, minWidth: '900px' }} />
              </div>
              <div
                ref={tableScrollRef}
                className="overflow-x-auto"
                onScroll={e => {
                  if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }}
              >
                <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </th>
                      {['カテゴリ', '製品名', '型番', 'メーカー', '価格', '登録日', '操作'].map(h => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(product => {
                      const missingKeys = getMissingSpecKeys(product);
                      return (
                      <tr key={product.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(product.id) ? 'bg-blue-50/60' : missingKeys.length > 0 ? 'bg-amber-50/40' : ''}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                            {product.categories?.name ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium max-w-[200px]">
                          <div className="flex items-center gap-2">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt=""
                                className="w-9 h-9 rounded-lg object-contain bg-slate-50 border border-slate-100 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="truncate block">{product.name}</span>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {missingKeys.length > 0 && (
                                  <span
                                    className="inline-block text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-bold"
                                    title={`未入力: ${missingKeys.join('、')}`}
                                  >
                                    要更新 {missingKeys.length}項目
                                  </span>
                                )}
                                {scoredIds.has(product.id) ? (
                                  incompleteIds.has(product.id) ? (
                                    <span className="inline-block text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-bold">
                                      未入力スコアあり
                                    </span>
                                  ) : (
                                    <span className="inline-block text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-bold">
                                      スコアあり
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-block text-xs bg-slate-100 text-slate-400 rounded-full px-2 py-0.5 font-bold">
                                    スコアなし
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                          {product.model_number || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {product.maker}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {product.price}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                          {new Date(product.created_at).toLocaleDateString('ja-JP')}
                        </td>
                        <td className="px-4 py-3">
                          {deleteId === product.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleDelete(product.id)}
                                disabled={deleting}
                                className="px-2 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                              >
                                {deleting ? '削除中' : '削除確認'}
                              </button>
                              <button
                                onClick={() => setDeleteId(null)}
                                className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {missingKeys.length > 0 && product.source_url && (
                                <button
                                  onClick={() => handleReanalyze(product)}
                                  disabled={reanalyzingId === product.id}
                                  className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200 disabled:opacity-50 transition-colors"
                                >
                                  {reanalyzingId === product.id ? '解析中...' : 'AI再解析'}
                                </button>
                              )}
                              <Link
                                href={`/products/${product.id}`}
                                className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-blue-100 hover:text-blue-700 transition-colors"
                              >
                                編集
                              </Link>
                              <button
                                onClick={() => setDeleteId(product.id)}
                                className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-red-100 hover:text-red-600 transition-colors"
                              >
                                削除
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
