'use client';

import { useState, useEffect } from 'react';

// ── 型定義 ────────────────────────────────────────────────────
type QueueStatus =
  | 'pending'     // 待機中
  | 'searching'   // URL検索中
  | 'url_ready'   // URL確認待ち
  | 'url_failed'  // URL取得失敗
  | 'analyzing'   // 解析中
  | 'analyzed'    // 解析完了（確認待ち）
  | 'saved'       // 保存済み
  | 'error';      // 解析エラー

interface Candidate { url: string; title: string; snippet: string; selected: boolean; }
interface ScoreRow  { keyword: string; score: number; reason: string; auto_generated: boolean; }
interface ProductInfo { name: string; price: string; unique_selling_point: string; script: string; image_url: string; }

interface QueueItem {
  id: string;
  modelNumber: string;
  categoryId: string;
  categoryName: string;
  status: QueueStatus;
  candidates: Candidate[];
  productId: string | null;
  productInfo: ProductInfo | null;
  specs: Record<string, string | null>;
  sources: Record<string, string | null>;
  scores: ScoreRow[];
  isNewProduct: boolean;
  error: string | null;
}

interface Props {
  categories: { id: string; name: string }[];
  initialCategoryId?: string;
}

const STATUS_META: Record<QueueStatus, { label: string; color: string; spin?: boolean }> = {
  pending:    { label: '待機中',       color: 'bg-slate-100 text-slate-500' },
  searching:  { label: 'URL検索中',   color: 'bg-blue-100 text-blue-700',   spin: true },
  url_ready:  { label: 'URL確認待ち', color: 'bg-amber-100 text-amber-700' },
  url_failed: { label: 'URL取得失敗', color: 'bg-red-100 text-red-700' },
  analyzing:  { label: '解析中',       color: 'bg-blue-100 text-blue-700',   spin: true },
  analyzed:   { label: '解析完了',     color: 'bg-green-100 text-green-700' },
  saved:      { label: '保存済み',     color: 'bg-green-200 text-green-800' },
  error:      { label: 'エラー',       color: 'bg-red-100 text-red-700' },
};

const SCORE_COLOR = (s: number) =>
  s === 5 ? 'border-purple-300 bg-purple-50 text-purple-700' :
  s === 4 ? 'border-green-300 bg-green-50 text-green-700' :
  s === 3 ? 'border-blue-300 bg-blue-50 text-blue-700' :
  s === 2 ? 'border-yellow-300 bg-yellow-50 text-yellow-700' :
            'border-slate-200 bg-slate-50 text-slate-400';

// ── コンポーネント ───────────────────────────────────────────
export default function BatchRegister({ categories, initialCategoryId }: Props) {
  const [categoryId,  setCategoryId]  = useState(initialCategoryId ?? '');
  const [modelInput,  setModelInput]  = useState('');
  const [queue,       setQueue]       = useState<QueueItem[]>([]);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  // ── ブラウザを閉じる警告 ──────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const active = queue.some(q => q.status === 'searching' || q.status === 'analyzing');
      if (active) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [queue]);

  // ── 順番にURL検索（1件ずつ） ──────────────────────────────
  useEffect(() => {
    const isSearching = queue.some(q => q.status === 'searching');
    if (isSearching) return;
    const pending = queue.find(q => q.status === 'pending');
    if (!pending) return;
    runUrlSearch(pending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  // ── ヘルパー ──────────────────────────────────────────────
  function updateItem(id: string, updates: Partial<QueueItem>) {
    setQueue(q => q.map(item => item.id === id ? { ...item, ...updates } : item));
  }

  function addToQueue() {
    const models = modelInput.split('\n').map(s => s.trim()).filter(Boolean);
    if (!models.length || !categoryId) return;
    const catName = categories.find(c => c.id === categoryId)?.name ?? '';
    setQueue(q => [
      ...q,
      ...models.map(m => ({
        id:           crypto.randomUUID(),
        modelNumber:  m,
        categoryId,
        categoryName: catName,
        status:       'pending' as QueueStatus,
        candidates:   [],
        productId:    null,
        productInfo:  null,
        specs:        {},
        sources:      {},
        scores:       [],
        isNewProduct: true,
        error:        null,
      })),
    ]);
    setModelInput('');
  }

  // ── URL検索 ───────────────────────────────────────────────
  async function runUrlSearch(item: QueueItem) {
    updateItem(item.id, { status: 'searching', error: null });
    try {
      const res  = await fetch('/api/spec-search/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelNumber: item.modelNumber, categoryId: item.categoryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        updateItem(item.id, { status: 'url_failed', error: data.error ?? 'URL検索に失敗しました' });
        return;
      }
      updateItem(item.id, {
        status:      'url_ready',
        candidates:  (data.candidates as Candidate[]) ?? [],
        productId:   data.productId ?? null,
        categoryName:data.categoryName ?? item.categoryName,
        isNewProduct:!!data.isNewProduct,
      });
    } catch (e) {
      updateItem(item.id, { status: 'url_failed', error: (e as Error).message });
    }
  }

  // ── 解析（URL確定 → Gemini → スコア自動生成） ────────────
  async function runAnalysis(itemId: string) {
    const item = queue.find(q => q.id === itemId);
    if (!item) return;
    const selectedUrls = item.candidates.filter(c => c.selected).map(c => c.url);
    if (!selectedUrls.length) return;

    updateItem(itemId, { status: 'analyzing', error: null });
    try {
      // Gemini解析
      const res  = await fetch('/api/spec-search/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId:    item.productId,
          isNewProduct: item.isNewProduct,
          categoryId:   item.categoryId,
          categoryName: item.categoryName,
          urls:         selectedUrls,
          modelNumber:  item.modelNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        updateItem(itemId, { status: 'error', error: data.error ?? '解析に失敗しました' });
        return;
      }

      const newProductId = data.productId ?? item.productId;

      // スコア自動生成
      let scores: ScoreRow[] = [];
      if (Object.keys(data.specs ?? {}).length > 0 && newProductId) {
        const scoreRes = await fetch('/api/spec-search/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: newProductId, categoryName: item.categoryName }),
        });
        if (scoreRes.ok) scores = (await scoreRes.json()).rows ?? [];
      }

      updateItem(itemId, {
        status:      'analyzed',
        productId:   newProductId,
        productInfo: data.productInfo ?? null,
        specs:       data.specs ?? {},
        sources:     data.sources ?? {},
        scores,
      });
      setExpandedId(itemId); // 解析完了したら自動展開
    } catch (e) {
      updateItem(itemId, { status: 'error', error: (e as Error).message });
    }
  }

  // ── スコア保存 ────────────────────────────────────────────
  async function saveScores(itemId: string) {
    const item = queue.find(q => q.id === itemId);
    if (!item?.productId) return;
    const res  = await fetch('/api/spec-search/score', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: item.productId, rows: item.scores }),
    });
    const data = await res.json();
    if (!res.ok) { updateItem(itemId, { error: data.error ?? '保存に失敗しました' }); return; }
    updateItem(itemId, { status: 'saved', error: null });
    setExpandedId(null);
  }

  function toggleCandidate(itemId: string, idx: number) {
    setQueue(q => q.map(item =>
      item.id !== itemId ? item :
      { ...item, candidates: item.candidates.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c) }
    ));
  }

  function updateScore(itemId: string, idx: number, field: 'score' | 'reason', value: string | number) {
    setQueue(q => q.map(item =>
      item.id !== itemId ? item :
      { ...item, scores: item.scores.map((s, i) => i === idx ? { ...s, [field]: value } : s) }
    ));
  }

  // ── 集計 ────────────────────────────────────────────────
  const activeCount   = queue.filter(q => q.status === 'searching' || q.status === 'analyzing').length;
  const urlReadyCount = queue.filter(q => q.status === 'url_ready').length;
  const analyzedCount = queue.filter(q => q.status === 'analyzed').length;
  const savedCount    = queue.filter(q => q.status === 'saved').length;
  const allSaved      = queue.length > 0 && queue.every(q => q.status === 'saved');

  // ── レンダリング ─────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* 入力エリア */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">カテゴリ</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">選択してください</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">
            型番
            <span className="font-normal text-slate-400 ml-1">（1行に1件、複数まとめて入力できます）</span>
          </label>
          <textarea
            value={modelInput}
            onChange={e => setModelInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addToQueue(); }}
            placeholder={'ER-D7000B\nER-XD3000\nER-SD3000'}
            rows={4}
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <p className="text-xs text-slate-400 mt-1">Cmd/Ctrl + Enter でも追加できます</p>
        </div>
        <button
          onClick={addToQueue}
          disabled={!categoryId || !modelInput.trim()}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          キューに追加して検索開始 →
        </button>
      </div>

      {/* 処理中ウォーニング */}
      {activeCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center gap-2">
          <Spinner className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            処理中です（{activeCount}件） — ページを閉じると中断されます
          </p>
        </div>
      )}

      {/* 進捗サマリー */}
      {queue.length > 0 && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: '合計',        value: queue.length,  color: 'text-slate-700' },
            { label: 'URL確認待ち', value: urlReadyCount, color: 'text-amber-700' },
            { label: '解析完了',    value: analyzedCount, color: 'text-green-700' },
            { label: '保存済み',    value: savedCount,    color: 'text-green-800' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-2.5">
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* キューリスト */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map(item => {
            const meta       = STATUS_META[item.status];
            const isExpanded = expandedId === item.id;
            const canDelete  = item.status !== 'searching' && item.status !== 'analyzing';
            const fiveCount  = item.scores.filter(s => s.score === 5).length;

            return (
              <div key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

                {/* ── カードヘッダー ── */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm font-mono">{item.modelNumber}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.categoryName}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* ステータスバッジ */}
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${meta.color}`}>
                      {meta.spin && <Spinner className="h-3 w-3" />}
                      {meta.label}
                    </span>

                    {/* アクションボタン */}
                    {(item.status === 'url_ready' || item.status === 'analyzed') && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-bold whitespace-nowrap"
                      >
                        {isExpanded ? '閉じる ▲' : item.status === 'url_ready' ? 'URL確認 →' : '確認・保存 →'}
                      </button>
                    )}
                    {(item.status === 'url_failed' || item.status === 'error') && (
                      <button
                        onClick={() => updateItem(item.id, { status: 'pending', error: null, candidates: [] })}
                        className="text-xs text-red-600 hover:text-red-700 font-bold"
                      >
                        再試行
                      </button>
                    )}
                    {canDelete && item.status !== 'saved' && (
                      <button
                        onClick={() => {
                          setQueue(q => q.filter(x => x.id !== item.id));
                          if (expandedId === item.id) setExpandedId(null);
                        }}
                        className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-400 transition-colors"
                        title="削除"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* エラーメッセージ */}
                {item.error && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{item.error}</p>
                  </div>
                )}

                {/* ── URL確認パネル ── */}
                {isExpanded && item.status === 'url_ready' && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
                    <p className="text-xs font-bold text-slate-500">使用するURLにチェックを入れてください</p>
                    <div className="space-y-1.5">
                      {item.candidates.length === 0 ? (
                        <p className="text-xs text-slate-400">URL候補が見つかりませんでした</p>
                      ) : item.candidates.map((c, i) => (
                        <label
                          key={i}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                            c.selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={c.selected}
                            onChange={() => toggleCandidate(item.id, i)}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-700 truncate">{c.title}</p>
                            <p className="text-slate-400 truncate">{c.url}</p>
                            {c.snippet && <p className="text-slate-500 mt-0.5 line-clamp-2">{c.snippet}</p>}
                          </div>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={() => runAnalysis(item.id)}
                      disabled={item.candidates.filter(c => c.selected).length === 0}
                      className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      解析開始 →
                    </button>
                  </div>
                )}

                {/* ── 解析結果・スコア確認パネル ── */}
                {isExpanded && item.status === 'analyzed' && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">

                    {/* 商品概要 */}
                    {item.productInfo && (
                      <div className="flex gap-3 items-start bg-slate-50 rounded-xl p-3">
                        {item.productInfo.image_url && (
                          <img
                            src={item.productInfo.image_url}
                            alt={item.productInfo.name}
                            className="w-16 h-16 object-contain rounded-xl border border-slate-100 bg-white shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 text-sm">{item.productInfo.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.productInfo.price || '価格不明'}</p>
                          {item.productInfo.unique_selling_point && (
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{item.productInfo.unique_selling_point}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* スコア編集 */}
                    {item.scores.length > 0 && (
                      <>
                        <p className="text-xs font-bold text-slate-500">ウィザードスコアを確認・編集</p>
                        {fiveCount > 1 && (
                          <p className="text-xs text-red-600 font-bold bg-red-50 rounded-lg px-3 py-2">
                            ⚠ スコア5（推し機能）は1商品につき1つだけです
                          </p>
                        )}
                        <div className="rounded-xl border border-slate-200 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="text-left px-3 py-2 font-bold text-slate-500">キーワード</th>
                                <th className="text-left px-3 py-2 font-bold text-slate-500 w-16">スコア</th>
                                <th className="text-left px-3 py-2 font-bold text-slate-500">理由</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {item.scores.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{row.keyword}</td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="number" min={1} max={5} value={row.score}
                                      onChange={e => updateScore(item.id, i, 'score', Number(e.target.value))}
                                      className={`w-10 border rounded px-1.5 py-0.5 text-center font-bold focus:outline-none ${SCORE_COLOR(row.score)}`}
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text" value={row.reason}
                                      onChange={e => updateScore(item.id, i, 'reason', e.target.value)}
                                      className="w-full border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    <button
                      onClick={() => saveScores(item.id)}
                      disabled={fiveCount > 1}
                      className="w-full py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      スコアを保存して完了 ✓
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 全件完了 */}
      {allSaved && (
        <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6 text-center space-y-3">
          <p className="text-3xl">✓</p>
          <p className="font-black text-lg text-green-800">{savedCount}件すべて登録完了しました</p>
          <button
            onClick={() => { setQueue([]); setExpandedId(null); }}
            className="px-5 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
          >
            キューをクリア
          </button>
        </div>
      )}
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
