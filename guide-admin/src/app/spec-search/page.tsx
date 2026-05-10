'use client';

import { useState, useEffect } from 'react';
import AdminNav from '@/components/AdminNav';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabase';
import BatchRegister from '@/components/BatchRegister';

// ── 型定義 ────────────────────────────────────────────────────

interface Candidate { url: string; title: string; snippet: string; selected: boolean; kind: 'official' | 'comparison' | 'other'; }
interface ComparisonPoint { field: string; this_value: string; other_value: string; }
interface ComparisonRow { type: string; compared_model: string; compared_maker: string; points: ComparisonPoint[]; summary: string; source_url: string | null; }
interface ScoreRow  { keyword: string; score: number; reason: string; auto_generated: boolean; }
interface ProductInfo {
  name: string; price: string;
  unique_selling_point: string; script: string; image_url: string;
}

type Step = 'search' | 'urls' | 'manual-form' | 'specs' | 'scores' | 'done';

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: 'search', label: '①型番入力' },
  { key: 'urls',   label: '②URL選択' },
  { key: 'specs',  label: '③内容確認' },
  { key: 'scores', label: '④スコア編集' },
  { key: 'done',   label: '完了' },
];

const MANUAL_STEP_LABELS: { key: Step; label: string }[] = [
  { key: 'search',      label: '①型番入力' },
  { key: 'manual-form', label: '②商品情報入力' },
  { key: 'scores',      label: '③スコア編集' },
  { key: 'done',        label: '完了' },
];

const LAST_CATEGORY_KEY = 'specSearch_lastCategoryId';

// ── コンポーネント ──────────────────────────────────────────────

export default function SpecSearchPage() {
  const { session, loading } = useAuth();

  const [step,              setStep]              = useState<Step>('search');
  const [batchMode,         setBatchMode]         = useState(false);
  const [manualMode,        setManualMode]        = useState(false);
  const [modelNumber,       setModelNumber]       = useState('');
  const [productId,         setProductId]         = useState<string | null>(null);
  const [categoryId,        setCategoryId]        = useState('');
  const [categoryName,      setCategoryName]      = useState('');
  const [isNewProduct,      setIsNewProduct]      = useState(false);
  const [categories,        setCategories]        = useState<{ id: string; name: string }[]>([]);
  const [candidates,        setCandidates]        = useState<Candidate[]>([]);
  const [productInfo,       setProductInfo]       = useState<ProductInfo | null>(null);
  const [specs,             setSpecs]             = useState<Record<string, string | null>>({});
  const [sources,           setSources]           = useState<Record<string, string | null>>({});
  const [comparisons,       setComparisons]       = useState<ComparisonRow[]>([]);
  const [scores,            setScores]            = useState<ScoreRow[]>([]);
  const [busy,              setBusy]              = useState(false);
  const [error,             setError]             = useState('');
  const [editingPrice,      setEditingPrice]      = useState(false);
  const [priceInput,        setPriceInput]        = useState('');
  const [confirmData,       setConfirmData]       = useState<{
    productId: string; categoryId: string; categoryName: string; candidates: Candidate[];
    existingName?: string; existingPrice?: string; existingMaker?: string;
  } | null>(null);

  // 手動登録フォーム
  const [manualSpecKeys,  setManualSpecKeys]  = useState<string[]>([]);
  const [manualForm,      setManualForm]      = useState({
    name: '', maker: '', price: '', image_url: '', unique_selling_point: '', script: '',
  });
  const [manualSpecData,  setManualSpecData]  = useState<Record<string, string>>({});

  // カテゴリ一覧取得 & 前回カテゴリを復元
  useEffect(() => {
    supabase.from('categories').select('id, name').order('name')
      .then(({ data }) => { if (data) setCategories(data); });
    const saved = localStorage.getItem(LAST_CATEGORY_KEY);
    if (saved) setCategoryId(saved);
  }, []);

  // ── Step 1: 型番で検索（AI モード）───────────────────────────

  async function handleDiscover() {
    if (!modelNumber.trim()) return;
    if (!categoryId) { setError('カテゴリを選択してください'); return; }
    setBusy(true); setError('');
    try {
      const res  = await fetch('/api/spec-search/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelNumber: modelNumber.trim(), categoryId }),
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(text); } catch { setError('サーバーエラーが発生しました'); return; }
      if (!res.ok) { setError((data.error as string) ?? '不明なエラー'); return; }

      const resolvedCatId = (data.categoryId as string) || categoryId;
      localStorage.setItem(LAST_CATEGORY_KEY, resolvedCatId);

      if (!data.isNewProduct) {
        setConfirmData({
          productId:     data.productId as string,
          categoryId:    resolvedCatId,
          categoryName:  data.categoryName as string,
          candidates:    data.candidates as Candidate[],
          existingName:  data.existingName as string | undefined,
          existingPrice: data.existingPrice as string | undefined,
          existingMaker: data.existingMaker as string | undefined,
        });
        return;
      }

      applyDiscoverResult({ ...data, categoryId: resolvedCatId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function applyDiscoverResult(data: Record<string, unknown>) {
    setIsNewProduct(!!(data.isNewProduct));
    setProductId((data.productId as string | null) ?? null);
    setCategoryId(data.categoryId as string);
    setCategoryName(data.categoryName as string);
    setCandidates(data.candidates as Candidate[]);
    setConfirmData(null);
    setStep('urls');
  }

  function handleConfirmReanalyze() {
    if (!confirmData) return;
    applyDiscoverResult({
      isNewProduct: false,
      productId:    confirmData.productId,
      categoryId:   confirmData.categoryId,
      categoryName: confirmData.categoryName,
      candidates:   confirmData.candidates,
    });
  }

  // ── Step 1: 手動モード開始 ────────────────────────────────────

  async function handleManualStart() {
    if (!modelNumber.trim()) return;
    if (!categoryId) { setError('カテゴリを選択してください'); return; }
    setBusy(true); setError('');
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, categoryId);

      // カテゴリの spec_keys を取得
      const { data: cat, error: catErr } = await supabase
        .from('categories').select('name, spec_keys').eq('id', categoryId).single();
      if (catErr || !cat) { setError('カテゴリ情報の取得に失敗しました'); return; }
      setCategoryName(cat.name);
      setManualSpecKeys(cat.spec_keys ?? []);
      setManualSpecData(Object.fromEntries((cat.spec_keys ?? []).map((k: string) => [k, ''])));

      // 既存商品チェック
      const norm = modelNumber.trim().replace(/-/g, '');
      const { data: existing } = await supabase
        .from('products').select('id, name, maker, price, image_url, unique_selling_point, script, spec_data')
        .eq('model_number', norm).maybeSingle();

      if (existing) {
        setProductId(existing.id);
        setIsNewProduct(false);
        // 既存データをフォームに流し込む
        setManualForm({
          name:                 existing.name                 ?? '',
          maker:                existing.maker                ?? '',
          price:                existing.price                ?? '',
          image_url:            existing.image_url            ?? '',
          unique_selling_point: existing.unique_selling_point ?? '',
          script:               existing.script               ?? '',
        });
        const existingSpec = (existing.spec_data ?? {}) as Record<string, string>;
        setManualSpecData(
          Object.fromEntries((cat.spec_keys ?? []).map((k: string) => [k, existingSpec[k] ?? '']))
        );
      } else {
        setProductId(null);
        setIsNewProduct(true);
        setManualForm({ name: '', maker: '', price: '', image_url: '', unique_selling_point: '', script: '' });
      }

      setStep('manual-form');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2 (手動): 商品情報を保存してスコアへ ─────────────────

  async function handleManualSave() {
    if (!manualForm.name.trim()) { setError('商品名を入力してください'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/products/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          productId,
          categoryId,
          modelNumber: modelNumber.trim(),
          ...manualForm,
          spec_data: manualSpecData,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '不明なエラー'); return; }

      const pid = data.productId as string;
      setProductId(pid);

      // スコア自動生成
      const scoreRes = await fetch('/api/spec-search/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: pid, categoryName }),
      });
      const scoreData = await scoreRes.json();
      if (!scoreRes.ok) { setError(scoreData.error ?? '不明なエラー'); return; }
      setScores(scoreData.rows);
      setStep('scores');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── Step 3 (AI): 価格を保存 ──────────────────────────────────

  async function handleSavePrice() {
    if (!productId) return;
    const formatted = priceInput.trim();
    await supabase.from('products').update({ price: formatted }).eq('id', productId);
    setProductInfo(prev => prev ? { ...prev, price: formatted } : null);
    setEditingPrice(false);
  }

  // ── Step 2 (AI): 解析 ──────────────────────────────────────

  async function handleAnalyze() {
    const selectedUrls = candidates.filter(c => c.selected).map(c => c.url);
    if (selectedUrls.length === 0) { setError('URLを1つ以上選択してください'); return; }
    setBusy(true); setError('');
    try {
      const res  = await fetch('/api/spec-search/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, isNewProduct, categoryId, categoryName, urls: selectedUrls, modelNumber }),
      });
      const text = await res.text();
      let data: { error?: string; productId?: string; productInfo?: ProductInfo; specs?: Record<string, string | null>; sources?: Record<string, string | null>; comparisons?: ComparisonRow[] };
      try { data = JSON.parse(text); } catch { setError(`サーバーエラー: ${text.slice(0, 200)}`); return; }
      if (!res.ok) { setError(data.error ?? '不明なエラー'); return; }

      setProductId(data.productId ?? null);
      setProductInfo(data.productInfo ?? null);
      setSpecs(data.specs ?? {});
      setSources(data.sources ?? {});
      setComparisons(data.comparisons ?? []);
      setStep('specs');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── Step 3 (AI): スコア自動生成 ──────────────────────────────

  async function handleScore() {
    if (!productId) return;
    setBusy(true); setError('');
    try {
      const res  = await fetch('/api/spec-search/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, categoryName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '不明なエラー'); return; }
      setScores(data.rows);
      setStep('scores');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── Step 4: スコア保存 ────────────────────────────────────────

  async function handleSaveScores() {
    if (!productId) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/spec-search/score', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rows: scores }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '不明なエラー'); return; }
      setStep('done');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('search'); setModelNumber(''); setProductId(null);
    setCategoryId(localStorage.getItem(LAST_CATEGORY_KEY) ?? '');
    setCategoryName(''); setIsNewProduct(false);
    setCategories([]); setCandidates([]); setProductInfo(null);
    setSpecs({}); setSources({}); setComparisons([]); setScores([]); setError('');
    setConfirmData(null);
    setManualSpecKeys([]); setManualSpecData({});
    setManualForm({ name: '', maker: '', price: '', image_url: '', unique_selling_point: '', script: '' });
    // カテゴリ再取得
    supabase.from('categories').select('id, name').order('name')
      .then(({ data }) => { if (data) setCategories(data); });
  }

  if (loading) return <LoadingScreen />;

  const activeStepLabels = manualMode ? MANUAL_STEP_LABELS : STEP_LABELS;
  const stepIndex = activeStepLabels.findIndex(s => s.key === step);

  return (
    <>
      <AdminNav session={session!} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">

          {/* ヘッダー */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight">商品登録・スコア自動生成</h1>
              <p className="text-sm text-slate-500 mt-1">型番を入力するだけで商品情報とウィザードスコアを自動生成します</p>
            </div>
            {/* モード切り替え */}
            <div className="shrink-0 flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1">
              <button
                onClick={() => { setBatchMode(false); setManualMode(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  !batchMode && !manualMode ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                登録
              </button>
              <button
                onClick={() => { setBatchMode(true); setManualMode(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  batchMode ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                バッチ登録
              </button>
              <button
                onClick={() => { setManualMode(true); setBatchMode(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  manualMode ? 'bg-orange-500 text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                手動登録
              </button>
            </div>
          </div>

          {/* バッチ登録モード */}
          {batchMode && (
            <BatchRegister categories={categories} initialCategoryId={categoryId || undefined} />
          )}

          {/* 通常モード: ステップバー */}
          {!batchMode && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {activeStepLabels.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1 shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${
                    s.key === step ? 'bg-blue-600 text-white' :
                    i < stepIndex  ? 'bg-green-100 text-green-700' :
                                     'bg-slate-200 text-slate-400'
                  }`}>{s.label}</span>
                  {i < activeStepLabels.length - 1 && <span className="text-slate-300 text-xs">›</span>}
                </div>
              ))}
            </div>
          )}

          {/* エラー */}
          {!batchMode && error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700 font-medium">⚠ {error}</p>
            </div>
          )}

          {/* ── 登録済み警告モーダル ── */}
          {!batchMode && confirmData && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                {/* 警告ヘッダー */}
                <div className="bg-amber-500 px-5 py-4 flex items-center gap-3">
                  <span className="text-2xl">⚠</span>
                  <div>
                    <p className="font-black text-white text-base">登録済みの商品です</p>
                    <p className="text-amber-100 text-xs mt-0.5">型番「{modelNumber}」はすでに登録されています</p>
                  </div>
                </div>
                {/* 既存商品情報 */}
                <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 space-y-1">
                  {confirmData.existingName  && <p className="text-sm text-slate-700"><span className="text-xs text-slate-400 mr-1">商品名</span>{confirmData.existingName}</p>}
                  {confirmData.existingMaker && <p className="text-sm text-slate-700"><span className="text-xs text-slate-400 mr-1">メーカー</span>{confirmData.existingMaker}</p>}
                  {confirmData.existingPrice && <p className="text-sm font-bold text-slate-800"><span className="text-xs font-normal text-slate-400 mr-1">登録価格</span>{confirmData.existingPrice}</p>}
                </div>
                {/* アクション */}
                <div className="px-5 py-4 space-y-3">
                  <p className="text-xs text-slate-500">再解析すると既存の商品情報・スペック・スコアが上書きされます</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmData(null)}
                      className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors"
                    >
                      戻る
                    </button>
                    <button
                      onClick={handleConfirmReanalyze}
                      className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors"
                    >
                      上書きして再解析
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 text-center">既存情報を確認してから上書きしてください</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: 型番入力 ── */}
          {!batchMode && step === 'search' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              {manualMode && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
                  <p className="text-xs font-bold text-orange-700">手動登録モード — AI解析なしで商品情報を直接入力します</p>
                </div>
              )}

              {/* カテゴリ選択 */}
              {(
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">カテゴリ</label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">選択してください</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">型番</label>
                <input
                  type="text"
                  placeholder="例: ER-D7000B"
                  value={modelNumber}
                  onChange={e => setModelNumber(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (manualMode ? handleManualStart() : handleDiscover())}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={manualMode ? handleManualStart : handleDiscover}
                disabled={busy || !modelNumber.trim() || !categoryId}
                title={manualMode ? 'AI解析なしで手動入力画面へ進みます' : 'Serper（Google検索）でメーカー公式ページとブログ記事を自動検索します'}
                className={`w-full py-3 text-white rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  manualMode ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {busy
                  ? '確認中...'
                  : manualMode
                    ? '商品情報を入力 →'
                    : 'URL候補を探す →'
                }
              </button>
              {!manualMode && (
                <p className="text-xs text-slate-400 text-center">型番からメーカー公式ページ・比較ブログを自動検索します</p>
              )}
            </div>
          )}

          {/* ── Step 2 (手動): 商品情報入力フォーム ── */}
          {!batchMode && step === 'manual-form' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-700">商品情報を入力</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isNewProduct ? '🆕 新規登録 / ' : '✏️ 更新 / '}
                    カテゴリ: <span className="font-bold text-slate-600">{categoryName}</span>
                  </p>
                </div>
                <button onClick={() => setStep('search')} className="text-xs text-slate-400 hover:text-slate-600">← 戻る</button>
              </div>

              {/* 基本情報 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">基本情報</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">商品名 <span className="text-red-500">*</span></label>
                    <input type="text" value={manualForm.name}
                      onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: シャープ ヘアドライヤー" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">メーカー</label>
                    <input type="text" value={manualForm.maker}
                      onChange={e => setManualForm(f => ({ ...f, maker: e.target.value }))}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: SHARP" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">価格</label>
                    <input type="text" value={manualForm.price}
                      onChange={e => setManualForm(f => ({ ...f, price: e.target.value }))}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: ¥19,800" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">画像URL</label>
                    <input type="text" value={manualForm.image_url}
                      onChange={e => setManualForm(f => ({ ...f, image_url: e.target.value }))}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://..." />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">売りポイント</label>
                  <textarea value={manualForm.unique_selling_point}
                    onChange={e => setManualForm(f => ({ ...f, unique_selling_point: e.target.value }))}
                    rows={3}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="この商品の一番の売りポイントを入力してください" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">接客トーク（ご案内例）</label>
                  <textarea value={manualForm.script}
                    onChange={e => setManualForm(f => ({ ...f, script: e.target.value }))}
                    rows={5}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="お客様へのご案内文を入力してください" />
                </div>
              </div>

              {/* スペック */}
              {manualSpecKeys.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">スペック情報</p>
                  <div className="space-y-3">
                    {manualSpecKeys.map(key => (
                      <div key={key}>
                        <label className="text-xs font-bold text-slate-600 mb-1 block">{key}</label>
                        <input type="text" value={manualSpecData[key] ?? ''}
                          onChange={e => setManualSpecData(d => ({ ...d, [key]: e.target.value }))}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="未入力の場合は空欄のまま保存" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleManualSave}
                disabled={busy || !manualForm.name.trim()}
                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? '保存中...' : '保存してスコア編集へ →'}
              </button>
            </div>
          )}

          {/* ── Step 2 (AI): URL選択 ── */}
          {!batchMode && step === 'urls' && (() => {
            const officialList    = candidates.filter(c => c.kind === 'official');
            const comparisonList  = candidates.filter(c => c.kind === 'comparison');
            const otherList       = candidates.filter(c => c.kind === 'other');
            const toggleUrl = (url: string) =>
              setCandidates(prev => prev.map(x => x.url === url ? { ...x, selected: !x.selected } : x));
            const selectedCount = candidates.filter(c => c.selected).length;

            const CandidateRow = ({ c }: { c: Candidate }) => (
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                c.selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}>
                <input type="checkbox" checked={c.selected}
                  onChange={() => toggleUrl(c.url)}
                  className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 leading-snug truncate">{c.title}</p>
                  <p className="text-xs text-slate-400 truncate">{c.url}</p>
                  {c.snippet && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.snippet}</p>}
                </div>
              </label>
            );

            return (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-700">情報元を確認</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isNewProduct ? '🆕 新規登録 / ' : '✏️ 更新 / '}
                      カテゴリ: <span className="font-bold text-slate-600">{categoryName}</span>
                    </p>
                  </div>
                  <button onClick={() => setStep('search')} className="text-xs text-slate-400 hover:text-slate-600">← 戻る</button>
                </div>

                {/* 公式サイト */}
                {officialList.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">公式サイト</span>
                      <span className="text-xs text-slate-400">スペック抽出に使用します。不要な場合はチェックを外せます</span>
                    </div>
                    {officialList.map(c => <CandidateRow key={c.url} c={c} />)}
                  </div>
                )}

                {/* 比較情報 */}
                {comparisonList.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">比較情報</span>
                      <span className="text-xs text-slate-400">接客トーク・他社比較の生成に使用します</span>
                    </div>
                    <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      <span className="text-amber-500 text-xs shrink-0 mt-0.5">ℹ</span>
                      <p className="text-xs text-amber-700">比較情報はブログ記事の内容をもとに生成されます。比較対象の数値はブログ著者の記述に依存するため、重要なスペックは公式ページでご確認ください。</p>
                    </div>
                    {comparisonList.map(c => <CandidateRow key={c.url} c={c} />)}
                  </div>
                )}

                {/* その他（YouTube等） */}
                {otherList.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">その他</span>
                      <span className="text-xs text-slate-400">必要な場合のみチェックしてください</span>
                    </div>
                    {otherList.map(c => <CandidateRow key={c.url} c={c} />)}
                  </div>
                )}

                <div className="space-y-1.5">
                  <button
                    onClick={handleAnalyze}
                    disabled={busy || selectedCount === 0}
                    title="選択したURLのHTMLを取得し、Geminiでスペック・接客トーク・比較情報を生成します（1〜2分）"
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {busy ? 'Gemini で解析中（1〜2分）...' : `${selectedCount} 件で解析 →`}
                  </button>
                  <p className="text-xs text-slate-400 text-center">
                    公式サイト → スペック確定的抽出　比較情報あり → 対比表を自動生成
                  </p>
                </div>
              </div>
            );
          })()}

          {/* ── Step 3 (AI): 解析結果確認 ── */}
          {!batchMode && step === 'specs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700">解析結果を確認</p>
                <button onClick={() => setStep('urls')} className="text-xs text-slate-400 hover:text-slate-600">← 戻る</button>
              </div>

              {productInfo && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">商品情報</p>
                  {productInfo.image_url && (
                    <img src={productInfo.image_url} alt={productInfo.name} className="w-24 h-24 object-contain rounded-xl border border-slate-100" />
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-slate-400 mb-0.5">商品名</p><p className="font-medium text-slate-800">{productInfo.name}</p></div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">価格</p>
                      {editingPrice ? (
                        <input
                          autoFocus
                          type="text"
                          value={priceInput}
                          onChange={e => setPriceInput(e.target.value)}
                          onBlur={handleSavePrice}
                          onKeyDown={e => { if (e.key === 'Enter') handleSavePrice(); if (e.key === 'Escape') setEditingPrice(false); }}
                          placeholder="例: ¥19,800"
                          className="w-full border border-blue-300 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      ) : (
                        <button
                          onClick={() => { setPriceInput(productInfo.price || ''); setEditingPrice(true); }}
                          className="text-sm font-bold px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                        >
                          タップして金額を入力
                        </button>
                      )}
                    </div>
                  </div>
                  <div><p className="text-xs text-slate-400 mb-0.5">売りポイント</p><p className="text-sm text-slate-700">{productInfo.unique_selling_point || '—'}</p></div>
                  <div><p className="text-xs text-slate-400 mb-0.5">トークスクリプト</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{productInfo.script || '—'}</p></div>
                </div>
              )}

              {Object.keys(specs).length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 space-y-1.5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">ウィザード用スペック</p>
                    <div className="flex items-start gap-1.5">
                      <span className="text-blue-400 text-xs shrink-0 mt-0.5">ℹ</span>
                      <p className="text-xs text-slate-400">メーカー公式ページのスペックテーブルからルールベースで確定的に抽出しています。AIによる推測は使用していません。</p>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 w-1/3">項目</th>
                        <th className="text-left px-3 py-2 text-xs font-bold text-slate-500">値</th>
                        <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 w-1/3">出典</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(specs).map(([key, val]) => (
                        <tr key={key} className={!val ? 'bg-red-50' : 'hover:bg-slate-50'}>
                          <td className="px-3 py-2 text-xs font-medium text-slate-600">{key}</td>
                          <td className={`px-3 py-2 text-xs ${!val ? 'text-red-400 italic' : 'text-slate-800 font-mono'}`}>
                            {val ?? '取得できず'}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-400 truncate max-w-[140px]">
                            {(() => {
                              try {
                                if (!sources[key]) return '—';
                                return (
                                  <a href={sources[key]!} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500 truncate block">
                                    {new URL(sources[key]!).hostname}
                                  </a>
                                );
                              } catch { return <span className="text-slate-400">—</span>; }
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 比較情報 */}
              {comparisons.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 space-y-1.5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">比較情報</p>
                    <div className="flex items-start gap-1.5">
                      <span className="text-amber-400 text-xs shrink-0 mt-0.5">⚠</span>
                      <p className="text-xs text-amber-600">比較対象の数値はブログ記事をもとに生成されており、公式スペックとの照合は行っていません。接客での参考情報としてご利用ください。</p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {comparisons.map((comp, i) => (
                      <div key={i} className="p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${comp.type === 'old_model' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                            {comp.type === 'old_model' ? '旧モデル比較' : '競合比較'}
                          </span>
                          <span className="text-sm font-bold text-slate-700">{comp.compared_maker} {comp.compared_model}</span>
                        </div>
                        {comp.points.length > 0 && (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-50">
                                <th className="text-left px-3 py-2 text-slate-500 font-bold">項目</th>
                                <th className="text-left px-3 py-2 text-blue-600 font-bold">{modelNumber}（本製品）</th>
                                <th className="text-left px-3 py-2 text-slate-500 font-bold">{comp.compared_model}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {comp.points.map((p, j) => (
                                <tr key={j}>
                                  <td className="px-3 py-2 text-slate-500">{p.field}</td>
                                  <td className="px-3 py-2 font-medium text-slate-800">{p.this_value}</td>
                                  <td className="px-3 py-2 text-slate-500">{p.other_value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {comp.summary && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{comp.summary}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                {Object.keys(specs).length > 0 ? (
                  <button onClick={handleScore} disabled={busy}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {busy ? 'スコアを計算中...' : 'ウィザードスコアを自動生成 →'}
                  </button>
                ) : (
                  <button onClick={() => setStep('done')} disabled={busy}
                    className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors">
                    登録完了にする
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: スコア編集 ── */}
          {!batchMode && step === 'scores' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-700">スコア確認・編集</p>
                  <p className="text-xs text-slate-400 mt-0.5">納得いかない行は直接編集してから保存してください</p>
                </div>
                <button
                  onClick={() => setStep(manualMode ? 'manual-form' : 'specs')}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ← 戻る
                </button>
              </div>

              {/* スコア凡例 */}
              <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-5 gap-1 text-center">
                {[
                  { s: 1, label: '非搭載',     color: 'text-slate-400' },
                  { s: 2, label: 'エントリー', color: 'text-yellow-600' },
                  { s: 3, label: '搭載',       color: 'text-blue-600' },
                  { s: 4, label: '高精度',     color: 'text-green-600' },
                  { s: 5, label: '★推し',      color: 'text-purple-600' },
                ].map(({ s, label, color }) => (
                  <div key={s}>
                    <p className={`text-xs font-black ${color}`}>{s}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>

              {scores.filter(r => r.score === 5).length > 1 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                  <p className="text-xs font-bold text-red-700">⚠ スコア5（推し機能）は1商品につき1つだけ設定できます</p>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-bold text-slate-500">キーワード</th>
                      <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 w-24">スコア</th>
                      <th className="text-left px-3 py-2 text-xs font-bold text-slate-500">理由</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scores.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap">{row.keyword}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <input type="number" min={1} max={5} value={row.score}
                              onChange={e => setScores(prev => prev.map((r, j) => j === i ? { ...r, score: Number(e.target.value) } : r))}
                              className={`w-12 border rounded-lg px-2 py-1 text-xs text-center font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                row.score === 5 ? 'border-purple-300 bg-purple-50 text-purple-700' :
                                row.score === 4 ? 'border-green-300 bg-green-50 text-green-700' :
                                row.score === 3 ? 'border-blue-300 bg-blue-50 text-blue-700' :
                                row.score === 2 ? 'border-yellow-300 bg-yellow-50 text-yellow-700' :
                                'border-slate-200 bg-slate-50 text-slate-400'
                              }`} />
                            <span className={`text-xs font-medium ${
                              row.score === 5 ? 'text-purple-600' :
                              row.score === 4 ? 'text-green-600' :
                              row.score === 3 ? 'text-blue-600' :
                              row.score === 2 ? 'text-yellow-600' :
                              'text-slate-400'
                            }`}>
                              {row.score === 5 ? '★推し' : row.score === 4 ? '高精度' : row.score === 3 ? '搭載' : row.score === 2 ? 'エントリー' : '非搭載'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.reason}
                            onChange={e => setScores(prev => prev.map((r, j) => j === i ? { ...r, reason: e.target.value } : r))}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={handleSaveScores} disabled={busy || scores.filter(r => r.score === 5).length > 1}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {busy ? '保存中...' : 'スコアを保存する'}
              </button>
            </div>
          )}

          {/* ── 完了 ── */}
          {!batchMode && step === 'done' && (
            <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-8 text-center space-y-4">
              <p className="text-4xl">✓</p>
              <p className="font-black text-xl text-green-800">
                {isNewProduct ? '商品を登録しました' : '商品情報を更新しました'}
              </p>
              <p className="text-sm text-slate-600">ウィザードのおすすめ商品に反映されます</p>
              <div className="flex justify-center gap-3">
                <button onClick={reset}
                  className="px-5 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">
                  続けて登録
                </button>
                <a href="/products"
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
                  商品一覧へ →
                </a>
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
      <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  );
}
