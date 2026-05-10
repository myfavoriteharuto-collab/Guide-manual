'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Product {
  id: string;
  name: string;
  model_number: string;
  maker: string;
  price: string;
  script: string;
  unique_selling_point: string;
  spec_data: Record<string, string>;
  glossary: Record<string, string>[];
  category_id: string | null;
  image_url: string;
}

interface ComparisonPoint { field: string; this_value: string; other_value: string; }
interface Comparison { id: string; type: string; compared_model: string; compared_maker: string; points: ComparisonPoint[]; summary: string; product_id: string; }

// ハイフン・スペース・全角を除去して大文字に正規化（型番の揺れを吸収する）
function normalizeModel(s: string): string {
  return s.replace(/[-\s　ー－―]/g, '').toUpperCase();
}

// ─── 比較ページ本体 ───────────────────────────────────────
function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean);

  const [products,         setProducts]         = useState<Product[]>([]);
  const [categorySpecKeys, setCategorySpecKeys]  = useState<string[]>([]);
  const [loading,          setLoading]           = useState(true);
  const [editingPriceId,   setEditingPriceId]    = useState<string | null>(null);
  const [priceInput,       setPriceInput]        = useState('');
  // productId → その商品の比較データ一覧
  const [comparisonsMap,   setComparisonsMap]    = useState<Record<string, Comparison[]>>({});
  // 現在モーダルで開いている比較データ
  const [activeComparison, setActiveComparison]  = useState<{ comp: Comparison; thisModel: string } | null>(null);

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }
    supabase
      .from('products')
      .select('id, name, model_number, maker, price, script, unique_selling_point, spec_data, glossary, category_id, image_url')
      .in('id', ids)
      .then(async ({ data }) => {
        if (data) {
          // URL 順を維持 + sessionStorageの価格上書きを反映
          const ordered = ids
            .map(id => data.find(p => p.id === id))
            .filter((p): p is Product => !!p)
            .map(p => ({
              ...p,
              price: sessionStorage.getItem(`price_override_${p.id}`) ?? '',
            }));
          setProducts(ordered);

          // カテゴリのspec_keysを取得
          const catId = ordered[0]?.category_id;
          if (catId) {
            const { data: cat } = await supabase
              .from('categories')
              .select('spec_keys')
              .eq('id', catId)
              .single();
            if (cat?.spec_keys) setCategorySpecKeys(cat.spec_keys);
          }

          // 比較データを一括取得してproductIdごとにまとめる
          const { data: compData } = await supabase
            .from('product_comparisons')
            .select('id, type, compared_model, compared_maker, points, summary, product_id')
            .in('product_id', ordered.map(p => p.id));
          if (compData) {
            const map: Record<string, Comparison[]> = {};
            for (const row of compData as Comparison[]) {
              if (!map[row.product_id]) map[row.product_id] = [];
              map[row.product_id].push(row);
            }
            setComparisonsMap(map);
          }
        }
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryId = products[0]?.category_id;

  // 商品Pについて、比較リスト内の他の商品と対応する比較データを返す
  // 双方向 + 型番の揺れ（ハイフン抜け等）を正規化して照合
  function getRelevantComparisons(p: Product): { comp: Comparison; thisModel: string }[] {
    const others = products.filter(o => o.id !== p.id);
    const results: { comp: Comparison; thisModel: string }[] = [];

    for (const other of others) {
      const otherNorm = normalizeModel(other.model_number);

      // Pの比較データにotherが載っているか
      const fromP = (comparisonsMap[p.id] ?? []).find(
        c => normalizeModel(c.compared_model) === otherNorm
      );
      if (fromP) { results.push({ comp: fromP, thisModel: p.model_number }); continue; }

      // otherの比較データにPが載っているか（逆引き）
      const fromOther = (comparisonsMap[other.id] ?? []).find(
        c => normalizeModel(c.compared_model) === normalizeModel(p.model_number)
      );
      if (fromOther) {
        // 逆引きの場合、this/otherが入れ替わるので反転したComparisonを作る
        const flipped: Comparison = {
          ...fromOther,
          compared_model: other.model_number,
          compared_maker: other.maker,
          points: fromOther.points.map(pt => ({
            field:       pt.field,
            this_value:  pt.other_value,
            other_value: pt.this_value,
          })),
        };
        results.push({ comp: flipped, thisModel: p.model_number });
      }
    }
    return results;
  }

  // カテゴリ現行のspec_keysを先に、旧キーを後ろに並べる
  const productSpecKeys = [...new Set(products.flatMap(p => Object.keys(p.spec_data ?? {})))];
  const currentKeys = categorySpecKeys.length > 0 ? categorySpecKeys.filter(k => productSpecKeys.includes(k)) : productSpecKeys;
  const legacyKeys  = productSpecKeys.filter(k => !categorySpecKeys.includes(k));
  const allSpecKeys = [...currentKeys, ...legacyKeys];
  const colCount     = products.length;

  // 差分ハイライト：値が異なる行を検出
  function rowDiffers(key: string) {
    const vals = products.map(p => (p.spec_data?.[key] ?? '').trim());
    return new Set(vals.filter(Boolean)).size > 1;
  }

  // 最安値
  const toNum = (price: string) => { const n = parseInt(price.replace(/[^0-9]/g, '')); return isNaN(n) ? Infinity : n; };
  const minPrice = Math.min(...products.map(p => toNum(p.price)));

  function savePrice(productId: string) {
    const val = priceInput.trim();
    sessionStorage.setItem(`price_override_${productId}`, val);
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, price: val } : p));
    setEditingPriceId(null);
  }

  function goBack() {
    if (categoryId) router.push(`/categories/${categoryId}`);
    else router.push('/');
  }

  if (loading) return <LoadingScreen />;

  if (products.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans">
      <div className="text-center space-y-3">
        <p className="text-slate-500 font-medium">比較する商品が見つかりませんでした</p>
        <button onClick={() => router.push('/')} className="text-blue-600 text-sm hover:underline">
          ← ホームに戻る
        </button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900">

      {/* ヘッダー */}
      <header className="bg-slate-900 text-white px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={goBack} className="text-slate-300 hover:text-white text-sm transition-colors shrink-0">
            ← 戻る
          </button>
          <h1 className="text-lg font-bold">比較 — {colCount} 件</h1>
        </div>
      </header>

      {/* ── 比較テーブル ── */}
      <div className="p-5">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">

              {/* 製品名ヘッダー */}
              <thead>
                <tr className="border-b-2 border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-24 bg-slate-50 sticky left-0 z-10">
                    項目
                  </th>
                  {products.map(p => (
                    <th key={p.id} className="px-4 py-4 text-left min-w-[180px]">
                      <button
                        onClick={() => router.push(`/products/${p.id}`)}
                        className="text-left w-full hover:text-blue-600 transition-colors"
                      >
                        {p.image_url && (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="w-20 h-20 rounded-xl object-contain bg-slate-50 border border-slate-100 mb-2"
                          />
                        )}
                        <span className="block font-bold text-slate-800 text-sm leading-snug">{p.name}</span>
                        <span className="block text-xs text-slate-400 font-normal mt-0.5">{p.model_number}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">

                {/* メーカー */}
                <CompareRow label="メーカー">
                  {products.map(p => <td key={p.id} className="px-4 py-3 text-slate-700 min-w-[180px]">{p.maker || '—'}</td>)}
                </CompareRow>

                {/* 価格 */}
                <CompareRow label="価格">
                  {products.map(p => {
                    const isCheapest = !!p.price && minPrice !== Infinity && toNum(p.price) === minPrice;
                    return (
                      <td key={p.id} className="px-4 py-3 min-w-[180px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isCheapest && (
                            <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-bold shrink-0">最安</span>
                          )}
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
                              className="w-28 border border-blue-300 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <button
                              onClick={() => { setPriceInput(p.price); setEditingPriceId(p.id); }}
                              className={`text-sm px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors ${p.price ? `font-bold ${isCheapest ? 'text-green-600' : 'text-slate-800'}` : 'text-slate-400'}`}
                            >
                              {p.price || 'タップして入力'}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </CompareRow>

                {/* スペック見出し */}
                {currentKeys.length > 0 && (
                  <tr>
                    <td colSpan={colCount + 1} className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 uppercase tracking-wider">
                      スペック
                    </td>
                  </tr>
                )}

                {/* 現行spec_keys */}
                {currentKeys.map(key => {
                  const differs = rowDiffers(key);
                  return (
                    <CompareRow key={key} label={key} highlight={differs}>
                      {products.map(p => {
                        const val = p.spec_data?.[key];
                        return (
                          <td key={p.id} className={`px-4 py-3 min-w-[180px] ${val ? 'text-slate-700' : 'text-slate-300'} ${differs ? 'font-medium' : ''}`}>
                            {val || '—'}
                          </td>
                        );
                      })}
                    </CompareRow>
                  );
                })}

                {/* 旧スペックキー（カテゴリ更新前の項目） */}
                {legacyKeys.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={colCount + 1} className="px-4 py-2 text-xs font-bold text-slate-400 bg-slate-50 uppercase tracking-wider">
                        旧スペック項目
                      </td>
                    </tr>
                    {legacyKeys.map(key => {
                      const differs = rowDiffers(key);
                      return (
                        <CompareRow key={key} label={key} highlight={differs}>
                          {products.map(p => {
                            const val = p.spec_data?.[key];
                            return (
                              <td key={p.id} className={`px-4 py-3 min-w-[180px] text-slate-400 ${differs ? 'font-medium' : ''}`}>
                                {val || '—'}
                              </td>
                            );
                          })}
                        </CompareRow>
                      );
                    })}
                  </>
                )}

              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 生活でのメリット ── */}
      <div className="px-5 pb-5 space-y-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">生活でのメリット</h2>
        <div className={`grid gap-4 ${colCount === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          {products.map(p => {
            const items = (p.glossary ?? []).filter(g => Object.keys(g).length > 0);
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3">
                  <p className="font-bold text-sm leading-snug truncate">{p.name}</p>
                </div>
                <div className="p-4 space-y-2.5">
                  {items.length > 0 ? items.map((g, i) => {
                    const [term, desc] = Object.entries(g)[0];
                    return (
                      <div key={i} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs font-bold text-blue-700 mb-0.5">{term}</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{String(desc)}</p>
                      </div>
                    );
                  }) : (
                    <p className="text-xs text-slate-300 text-center py-4">未登録</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 接客トーク・売りポイント ── */}
      <div className="px-5 pb-10 space-y-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">接客トーク・売りポイント</h2>
        <div className={`grid gap-4 ${colCount === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          {products.map(p => {
            const relevantComps = getRelevantComparisons(p);
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-slate-900 text-white px-4 py-3">
                  <p className="font-bold text-sm leading-snug truncate">{p.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{p.model_number}</p>
                </div>
                <div className="p-4 space-y-4">
                  {p.unique_selling_point && (
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">売りポイント</p>
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{p.unique_selling_point}</p>
                    </div>
                  )}
                  {p.script && (
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">接客トーク</p>
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{p.script}</p>
                    </div>
                  )}

                  {/* 比較中の他製品との比較ポイント */}
                  {relevantComps.length > 0 && (
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">他製品との比較ポイント</p>
                      {relevantComps.map(({ comp, thisModel }) => (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => setActiveComparison({ comp, thisModel })}
                          className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 active:bg-blue-100 transition-colors border border-slate-100"
                        >
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${comp.type === 'old_model' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                            {comp.type === 'old_model' ? '旧モデル' : '競合'}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 flex-1 truncate">
                            vs {comp.compared_model}
                          </span>
                          {comp.summary && (
                            <span className="text-xs text-slate-400 flex-1 truncate hidden sm:block">{comp.summary}</span>
                          )}
                          <span className="text-slate-300 text-base shrink-0">›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 比較詳細モーダル */}
      {activeComparison && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white shrink-0">
            <button
              onClick={() => setActiveComparison(null)}
              className="text-slate-300 hover:text-white text-sm transition-colors shrink-0"
            >
              ← 戻る
            </button>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${activeComparison.comp.type === 'old_model' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}`}>
                {activeComparison.comp.type === 'old_model' ? '旧モデル比較' : '競合比較'}
              </span>
              <span className="text-sm font-bold truncate">
                {activeComparison.comp.compared_maker} {activeComparison.comp.compared_model}
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {activeComparison.comp.summary && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-blue-600 mb-2">接客ポイント</p>
                <p className="text-sm text-slate-700 leading-relaxed">{activeComparison.comp.summary}</p>
              </div>
            )}
            {activeComparison.comp.points.length > 0 && (
              <div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-3 py-2.5 text-xs text-slate-500 font-bold whitespace-nowrap">項目</th>
                        <th className="text-left px-3 py-2.5 text-xs text-blue-600 font-bold whitespace-nowrap bg-blue-50">
                          {activeComparison.thisModel}<br />
                          <span className="font-normal text-blue-400">本製品</span>
                        </th>
                        <th className="text-left px-3 py-2.5 text-xs text-slate-500 font-bold whitespace-nowrap">
                          {activeComparison.comp.compared_model}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeComparison.comp.points.map((pt, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{pt.field}</td>
                          <td className="px-3 py-2.5 text-sm font-semibold text-blue-700 bg-blue-50/50">{pt.this_value}</td>
                          <td className="px-3 py-2.5 text-sm text-slate-600">{pt.other_value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-start gap-1.5 mt-3">
                  <span className="text-amber-500 text-xs shrink-0 mt-0.5">⚠</span>
                  <p className="text-xs text-amber-700 leading-relaxed">比較数値はブログ記事をもとに自動生成されています。重要なスペックはメーカー公式ページでご確認ください。</p>
                </div>
              </div>
            )}
            <div className="h-6" />
          </div>
        </div>
      )}

    </main>
  );
}

// ─── UI パーツ ───────────────────────────────────────────
function CompareRow({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <tr className={highlight ? 'bg-amber-50' : ''}>
      <td className={`px-4 py-3 text-xs font-bold whitespace-nowrap sticky left-0 z-10 ${highlight ? 'text-amber-700 bg-amber-100' : 'text-slate-500 bg-slate-50'}`}>
        {highlight && <span className="mr-1">!</span>}
        {label}
      </td>
      {children}
    </tr>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <svg className="animate-spin h-10 w-10 text-blue-600" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  );
}

// ─── ページエクスポート（useSearchParams は Suspense が必要） ──
export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CompareContent />
    </Suspense>
  );
}
