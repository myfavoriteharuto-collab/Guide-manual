'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Option   { id: string; label: string; hint: string; match_keywords?: string[]; }
interface Step     { id: string; question: string; options: Option[]; }
interface FlowData { steps: Step[]; }

interface Product {
  id: string;
  name: string;
  model_number: string;
  price: string;
  image_url: string;
  unique_selling_point: string;
  spec_data: Record<string, string>;
}

interface ScoreEntry {
  product_id: string;
  keyword: string;
  score: number;
  reason: string | null;
}

interface MatchedProduct extends Product {
  score: number;
  hitKeywords: string[];
  whyText: string;
}

interface Props {
  categoryId: string;
  onClose: () => void;
  onStartCompare?: (ids: string[]) => void;
}

// 「なぜ？」テキスト生成
function buildWhyText(hitKeywords: string[], reasons: string[]): string {
  if (hitKeywords.length === 0) return '';
  const kwText = hitKeywords.slice(0, 2).map(k => `「${k}」`).join('と');
  if (reasons.length > 0) return `${kwText}が選ばれたので、${reasons[0]}`;
  return `${kwText}の条件に合う機種として選ばれました`;
}

export default function DiagnosisWizard({ categoryId, onClose, onStartCompare }: Props) {
  const router = useRouter();
  const [title,      setTitle]      = useState('お客様のニーズを選んでください');
  const [steps,      setSteps]      = useState<Step[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [scoreMap,   setScoreMap]   = useState<Record<string, Record<string, ScoreEntry>>>({});
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [hardSet,    setHardSet]    = useState<Set<string>>(new Set());
  const [loading,    setLoading]    = useState(true);
  const [comparing,  setComparing]  = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: flow }, { data: prods }] = await Promise.all([
        supabase.from('diagnosis_flows').select('title, flow_data').eq('category_id', categoryId).maybeSingle(),
        supabase.from('products')
          .select('id, name, model_number, price, image_url, unique_selling_point, spec_data')
          .eq('category_id', categoryId)
          .order('created_at', { ascending: true }),
      ]);

      if (flow) {
        setTitle(flow.title ?? 'お客様のニーズを選んでください');
        setSteps((flow.flow_data as FlowData)?.steps ?? []);
      }

      const prodList = (prods ?? []) as Product[];
      setProducts(prodList);

      if (prodList.length > 0) {
        const { data: scores } = await supabase
          .from('wizard_scores')
          .select('product_id, keyword, score, reason')
          .in('product_id', prodList.map(p => p.id));

        if (scores && scores.length > 0) {
          const map: Record<string, Record<string, ScoreEntry>> = {};
          scores.forEach(s => {
            if (!map[s.product_id]) map[s.product_id] = {};
            map[s.product_id][s.keyword] = s as ScoreEntry;
          });
          setScoreMap(map);
        }
      }

      setLoading(false);
    }
    load();
  }, [categoryId]);

  function toggleSelect(optId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(optId)) {
        next.delete(optId);
        setHardSet(h => { const nh = new Set(h); nh.delete(optId); return nh; });
      } else {
        next.add(optId);
      }
      return next;
    });
    setComparing(false);
  }

  function toggleHard(e: React.MouseEvent, optId: string) {
    e.stopPropagation();
    setHardSet(prev => {
      const next = new Set(prev);
      if (next.has(optId)) next.delete(optId); else next.add(optId);
      return next;
    });
  }

  const matched = useMemo<MatchedProduct[]>(() => {
    if (products.length === 0 || selected.size === 0) return [];

    const selectedOpts = steps.flatMap(s => s.options.filter(o => selected.has(o.id)));
    const hardOpts = selectedOpts.filter(o => hardSet.has(o.id));
    const softOpts = selectedOpts.filter(o => !hardSet.has(o.id));
    const hasScoreData = Object.keys(scoreMap).length > 0;

    if (hasScoreData) {
      const hardKeywords = hardOpts.map(o => o.label);
      const softKeywords = softOpts.map(o => o.label);

      let candidates = products.filter(p =>
        hardKeywords.every(kw => (scoreMap[p.id]?.[kw]?.score ?? 1) > 1)
      );

      return candidates.map(p => {
        let totalScore = 0;
        const hitKeywords: string[] = [];
        const reasons: string[] = [];

        [...hardKeywords, ...softKeywords].forEach(kw => {
          const entry = scoreMap[p.id]?.[kw];
          if (entry && entry.score > 1) {
            if (softKeywords.includes(kw)) totalScore += entry.score;
            hitKeywords.push(kw);
            if (entry.reason) reasons.push(entry.reason);
          }
        });

        return { ...p, score: totalScore, hitKeywords, whyText: buildWhyText(hitKeywords, reasons) };
      })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    } else {
      const allKws = selectedOpts.flatMap(o => [
        o.label, o.hint ?? '', ...(o.match_keywords ?? [])
      ]).map(k => k.trim().toLowerCase()).filter(Boolean);

      const badgeKws = [...new Set(
        selectedOpts.flatMap(o => o.match_keywords ?? []).map(k => k.trim().toLowerCase()).filter(Boolean)
      )];

      return products.map(p => {
        const haystack = [p.name, p.model_number, p.unique_selling_point ?? '', ...Object.values(p.spec_data ?? {})].join(' ').toLowerCase();
        const score = allKws.reduce((acc, kw) => acc + (haystack.includes(kw) ? 1 : 0), 0);
        const hitKeywords = badgeKws.filter(kw => haystack.includes(kw));
        return { ...p, score, hitKeywords, whyText: buildWhyText(hitKeywords, []) };
      })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }
  }, [selected, hardSet, steps, products, scoreMap]);

  // 比較テーブル用: 全商品に共通するスペックキーを収集
  const specKeys = useMemo(() => {
    const keySet = new Set<string>();
    matched.forEach(p => Object.keys(p.spec_data ?? {}).forEach(k => keySet.add(k)));
    return [...keySet];
  }, [matched]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-end md:items-center justify-center p-0 md:p-4">
      <div
        className="bg-white w-full md:max-w-4xl rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* ヘッダー */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">
              {comparing ? '比較' : 'ヒアリング'}
            </p>
            <p className="font-black text-slate-900 text-base leading-snug">
              {comparing ? 'おすすめ商品を比較' : title}
            </p>
            {!comparing && (
              <p className="text-xs text-slate-400 mt-1">当てはまるキーワードをタップ（複数選択可）</p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {comparing && (
              <button
                onClick={() => setComparing(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                ← 戻る
              </button>
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* メインエリア */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        ) : steps.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-slate-400 text-center">このカテゴリのウィザードはまだ設定されていません</p>
          </div>
        ) : comparing ? (
          /* ── 比較ビュー ── */
          <div className="flex-1 overflow-auto p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: `${matched.length * 200}px` }}>
                {/* 商品ヘッダー */}
                <thead>
                  <tr>
                    <th className="w-28 shrink-0" />
                    {matched.map(p => (
                      <th key={p.id} className="px-3 pb-4 align-top">
                        <button
                          onClick={() => { onClose(); router.push(`/products/${p.id}`); }}
                          className="w-full text-left hover:opacity-80 transition-opacity"
                        >
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-20 h-20 object-contain rounded-xl border border-slate-100 bg-slate-50 mx-auto mb-2" />
                          ) : (
                            <div className="w-20 h-20 rounded-xl bg-slate-100 mx-auto mb-2" />
                          )}
                          <p className="font-black text-slate-800 text-xs leading-snug">{p.model_number}</p>
                          <p className="text-xs text-slate-400 mt-0.5 leading-snug">{p.name}</p>
                          <p className="font-bold text-slate-700 mt-1 text-sm">{p.price || '—'}</p>
                          {p.hitKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5 justify-center">
                              {p.hitKeywords.slice(0, 3).map(kw => (
                                <span key={kw} className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-bold">{kw}</span>
                              ))}
                            </div>
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* 売りポイント */}
                  <tr className="bg-slate-50">
                    <td className="px-3 py-3 text-xs font-bold text-slate-500 whitespace-nowrap align-top">売りポイント</td>
                    {matched.map(p => (
                      <td key={p.id} className="px-3 py-3 text-xs text-slate-700 leading-relaxed align-top">
                        {p.unique_selling_point || '—'}
                      </td>
                    ))}
                  </tr>
                  {/* なぜおすすめ */}
                  {matched.some(p => p.whyText) && (
                    <tr>
                      <td className="px-3 py-3 text-xs font-bold text-slate-500 whitespace-nowrap align-top">なぜおすすめ？</td>
                      {matched.map(p => (
                        <td key={p.id} className="px-3 py-3 text-xs text-blue-600 leading-relaxed align-top">
                          {p.whyText || '—'}
                        </td>
                      ))}
                    </tr>
                  )}
                  {/* スペック */}
                  {specKeys.map((key, i) => (
                    <tr key={key} className={i % 2 === 0 ? 'bg-slate-50' : ''}>
                      <td className="px-3 py-3 text-xs font-bold text-slate-500 whitespace-nowrap align-top">{key}</td>
                      {matched.map(p => (
                        <td key={p.id} className="px-3 py-3 text-xs text-slate-700 font-mono align-top">
                          {p.spec_data?.[key] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── 通常ビュー ── */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">

            {/* キーワードタイル */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {steps.map(step => (
                <div key={step.id}>
                  <p className="text-xs font-bold text-slate-400 mb-2">{step.question}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {step.options.map(opt => {
                      const isSel  = selected.has(opt.id);
                      const isHard = isSel && hardSet.has(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => toggleSelect(opt.id)}
                          className={`px-4 py-3 rounded-2xl border-2 text-left transition-all active:scale-[0.97] ${
                            isHard  ? 'border-amber-500 bg-amber-50 shadow-sm' :
                            isSel   ? 'border-blue-500 bg-blue-50 shadow-sm' :
                                      'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <p className={`font-bold text-sm leading-snug ${
                            isHard ? 'text-amber-700' : isSel ? 'text-blue-700' : 'text-slate-800'
                          }`}>
                            {opt.label}
                          </p>
                          {opt.hint && (
                            <p className={`text-xs mt-0.5 leading-snug ${
                              isHard ? 'text-amber-400' : isSel ? 'text-blue-400' : 'text-slate-400'
                            }`}>
                              {opt.hint}
                            </p>
                          )}
                          {isSel && (
                            <span
                              onClick={e => toggleHard(e, opt.id)}
                              className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                                isHard
                                  ? 'bg-amber-500 text-white border-amber-500'
                                  : 'bg-white text-slate-400 border-slate-300 hover:border-amber-400 hover:text-amber-500'
                              }`}
                            >
                              {isHard ? '🔒 絶対条件' : '絶対条件にする'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* おすすめ商品パネル */}
            <div className="md:w-72 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 overflow-y-auto p-5 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">お客様におすすめ</p>
                {matched.length >= 2 && (
                  <button
                    onClick={() => setComparing(true)}
                    className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    比較する
                  </button>
                )}
              </div>
              {matched.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6 leading-relaxed">
                  キーワードをタップすると<br />おすすめ商品が表示されます
                </p>
              ) : matched.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onClose(); router.push(`/products/${p.id}`); }}
                  className="w-full flex items-start gap-3 bg-white border border-slate-200 rounded-2xl p-3 text-left hover:border-blue-300 transition-colors active:scale-[0.98] shadow-sm"
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-xl object-contain bg-slate-50 border border-slate-100 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 text-sm leading-snug truncate">{p.model_number}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{p.name}</p>
                    <p className="text-xs font-bold text-slate-600 mt-1">{p.price}</p>
                    {p.hitKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.hitKeywords.slice(0, 3).map(kw => (
                          <span key={kw} className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-bold">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.whyText && (
                      <p className="text-[11px] text-blue-600 mt-2 leading-relaxed">
                        {p.whyText}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>

          </div>
        )}

        {/* フッター */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 shrink-0">
          {!comparing && selected.size > 0 && (
            <button
              onClick={() => { setSelected(new Set()); setHardSet(new Set()); }}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors px-2"
            >
              クリア
            </button>
          )}
          {matched.length >= 2 && (
            <button
              onClick={() => {
                const ids = matched.map(p => p.id);
                onStartCompare?.(ids);
                onClose();
                router.push(`/compare?ids=${ids.join(',')}`);
              }}
              className="flex-1 py-3 bg-green-600 text-white rounded-2xl font-bold text-sm hover:bg-green-700 transition-colors"
            >
              比較画面で見る →
            </button>
          )}
          <button
            onClick={onClose}
            className={`py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors ${matched.length >= 2 ? 'px-5' : 'flex-1'}`}
          >
            {matched.length >= 2 ? '一覧へ' : '商品一覧を見る →'}
          </button>
        </div>

      </div>
    </div>
  );
}
