'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import AdminNav from '@/components/AdminNav';
import ImageUploadField from '@/components/ImageUploadField';
import AdminCoordinatePicker from '@/components/AdminCoordinatePicker';

// ─── 型定義 ───────────────────────────────────────────────
interface Category { id: string; name: string; spec_keys: string[]; }

interface SpecEntry     { key: string; value: string; }
interface GlossaryEntry { term: string; description: string; }
interface ScoreRow      { keyword: string; score: number; reason: string; }

interface ProductForm {
  category_id: string;
  name: string;
  model_number: string;
  maker: string;
  price: string;
  unique_selling_point: string;
  script: string;
  image_url: string;
  spec_entries: SpecEntry[];
  glossary_entries: GlossaryEntry[];
  spec_manual_keys: string[];
  spec_hidden_keys: string[];
}

const SCORE_LABELS: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: '非搭載',     color: 'text-slate-600',  bg: 'bg-slate-100' },
  2: { label: 'エントリー', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  3: { label: '搭載',       color: 'text-blue-700',   bg: 'bg-blue-50' },
  4: { label: '高精度',     color: 'text-green-700',  bg: 'bg-green-50' },
  5: { label: '★推し',      color: 'text-purple-700', bg: 'bg-purple-50' },
};

const EMPTY_FORM: ProductForm = {
  category_id: '', name: '', model_number: '', maker: '',
  price: '', unique_selling_point: '', script: '',
  image_url: '',
  spec_entries: [], glossary_entries: [],
  spec_manual_keys: [],
  spec_hidden_keys: [],
};

const INPUT = 'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors';

// ─── コンポーネント ────────────────────────────────────────
export default function ProductEditPage() {
  const { id }           = useParams<{ id: string }>();
  const router           = useRouter();
  const { session, loading } = useAuth();

  const [categories,    setCategories]    = useState<Category[]>([]);
  const [form,          setForm]          = useState<ProductForm>(EMPTY_FORM);
  const [fetching,      setFetching]      = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [notFound,      setNotFound]      = useState(false);
  const [scoreRows,     setScoreRows]     = useState<ScoreRow[]>([]);
  const [scoreSaving,   setScoreSaving]   = useState(false);
  const [scoreError,    setScoreError]    = useState('');
  const [scoreSaved,    setScoreSaved]    = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [categoryName,  setCategoryName]  = useState('');
  const [flowKeywords,  setFlowKeywords]  = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session, id]);

  async function loadData() {
    setFetching(true);
    const [{ data: product, error: prodErr }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*').eq('id', id).single(),
      supabase.from('categories').select('id, name, spec_keys').order('name'),
    ]);

    if (prodErr || !product) { setNotFound(true); setFetching(false); return; }
    const catList = (cats ?? []) as Category[];
    if (cats) setCategories(catList);

    // ウィザードスコアを取得
    const { data: scores } = await supabase
      .from('wizard_scores')
      .select('keyword, score, reason')
      .eq('product_id', id)
      .order('keyword');
    setScoreRows((scores ?? []).map(s => ({ keyword: s.keyword, score: s.score, reason: s.reason ?? '' })));

    // カテゴリ名を設定、diagnosis_flowのキーワードを取得
    const cat = catList.find(c => c.id === product.category_id);
    if (cat) {
      setCategoryName(cat.name);
      const { data: flow } = await supabase
        .from('diagnosis_flows')
        .select('flow_data')
        .eq('category_id', cat.id)
        .maybeSingle();
      if (flow?.flow_data) {
        const steps = (flow.flow_data as { steps: { options: { label: string }[] }[] }).steps ?? [];
        const kws = new Set(steps.flatMap(s => s.options.map(o => o.label)).filter(Boolean));
        setFlowKeywords(kws);
      }
    }

    const hiddenKeys = new Set((product.spec_hidden_keys ?? []) as string[]);

    const existingSpec: SpecEntry[] = Object.entries(
      (product.spec_data ?? {}) as Record<string, string>
    ).map(([key, value]) => ({ key, value }));

    // カテゴリのspec_keysで未入力かつ非表示でない項目を空エントリとして末尾に追加
    const existingKeys = existingSpec.map(e => e.key);
    const missingEntries: SpecEntry[] = (cat?.spec_keys ?? [])
      .filter(k => !existingKeys.includes(k) && !hiddenKeys.has(k))
      .map(k => ({ key: k, value: '' }));
    const spec_entries: SpecEntry[] = [...existingSpec, ...missingEntries];

    const glossary_entries: GlossaryEntry[] = (
      (product.glossary ?? []) as Record<string, string>[]
    )
      .filter(item => Object.keys(item).length > 0)
      .map(item => {
        const [term, description] = Object.entries(item)[0];
        return { term, description: String(description) };
      });

    setForm({
      category_id:          product.category_id ?? '',
      name:                 product.name,
      model_number:         product.model_number,
      maker:                product.maker,
      price:                product.price,
      unique_selling_point: product.unique_selling_point,
      script:               product.script,
      image_url:            product.image_url ?? '',
      spec_entries,
      glossary_entries,
      spec_manual_keys:     (product.spec_manual_keys ?? []) as string[],
      spec_hidden_keys:     (product.spec_hidden_keys ?? []) as string[],
    });
    setFetching(false);
  }

  // ─── フォーム更新ヘルパー ─────────────────────────────
  function set<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function updateSpec(i: number, field: keyof SpecEntry, value: string) {
    setForm(f => {
      const entries = [...f.spec_entries];
      entries[i] = { ...entries[i], [field]: value };
      // 値を編集したキーを手入力済みとしてマーク
      const key = entries[i].key;
      const manualKeys = field === 'value' && key
        ? [...new Set([...f.spec_manual_keys, key])]
        : f.spec_manual_keys;
      return { ...f, spec_entries: entries, spec_manual_keys: manualKeys };
    });
  }

  function hideSpec(i: number) {
    setForm(f => {
      const key = f.spec_entries[i].key.trim();
      return {
        ...f,
        spec_entries: f.spec_entries.filter((_, j) => j !== i),
        spec_hidden_keys: key && !f.spec_hidden_keys.includes(key)
          ? [...f.spec_hidden_keys, key]
          : f.spec_hidden_keys,
      };
    });
  }

  function restoreSpec(key: string) {
    setForm(f => ({
      ...f,
      spec_hidden_keys: f.spec_hidden_keys.filter(k => k !== key),
      spec_entries: [...f.spec_entries, { key, value: '' }],
    }));
  }

  function deleteHiddenSpec(key: string) {
    setForm(f => ({
      ...f,
      spec_hidden_keys: f.spec_hidden_keys.filter(k => k !== key),
    }));
  }

  function updateGlossary(i: number, field: keyof GlossaryEntry, value: string) {
    setForm(f => {
      const entries = [...f.glossary_entries];
      entries[i] = { ...entries[i], [field]: value };
      return { ...f, glossary_entries: entries };
    });
  }

  function removeGlossary(i: number) {
    setForm(f => ({ ...f, glossary_entries: f.glossary_entries.filter((_, j) => j !== i) }));
  }

  // ─── 保存 ────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError('');

    const spec_data = Object.fromEntries(
      form.spec_entries.filter(e => e.key.trim()).map(e => [e.key.trim(), e.value])
    );
    const glossary = form.glossary_entries
      .filter(e => e.term.trim())
      .map(e => ({ [e.term]: e.description }));

    const { error } = await supabase
      .from('products')
      .update({
        category_id:          form.category_id || null,
        name:                 form.name,
        model_number:         form.model_number,
        maker:                form.maker,
        price:                form.price,
        unique_selling_point: form.unique_selling_point,
        script:               form.script,
        image_url:            form.image_url,
        spec_data,
        glossary,
        spec_manual_keys:     form.spec_manual_keys,
        spec_hidden_keys:     form.spec_hidden_keys,
      })
      .eq('id', id);

    setSaving(false);
    if (error) { setError('保存に失敗しました: ' + error.message); return; }
    router.push('/products');
  }

  // ─── スコア保存 ──────────────────────────────────────────
  async function handleScoreSave() {
    setScoreSaving(true);
    setScoreError('');
    setScoreSaved(false);
    const res = await fetch('/api/spec-search/score', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: id, rows: scoreRows }),
    });
    const json = await res.json();
    setScoreSaving(false);
    if (!res.ok) { setScoreError(json.error ?? '保存に失敗しました'); return; }
    setScoreSaved(true);
    setTimeout(() => setScoreSaved(false), 2000);
  }

  async function handleAutoGenerate() {
    setAutoGenerating(true);
    setScoreError('');
    const res = await fetch('/api/spec-search/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: id, categoryName }),
    });
    const json = await res.json();
    setAutoGenerating(false);
    if (!res.ok) { setScoreError(json.error ?? '自動生成に失敗しました'); return; }
    setScoreRows((json.rows ?? []).map((r: { keyword: string; score: number; reason: string }) => ({
      keyword: r.keyword, score: r.score, reason: r.reason ?? '',
    })));
  }

  function updateScoreRow(i: number, field: keyof ScoreRow, value: string | number) {
    setScoreRows(rows => rows.map((r, j) => j === i ? { ...r, [field]: value } : r));
  }

  function removeScoreRow(i: number) {
    setScoreRows(rows => rows.filter((_, j) => j !== i));
  }

  // ─── レンダリング ────────────────────────────────────
  if (loading || fetching) return <LoadingScreen />;

  if (notFound) return (
    <>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-slate-600 font-medium">商品が見つかりませんでした</p>
          <button onClick={() => router.push('/products')} className="text-blue-600 text-sm hover:underline">
            ← 商品一覧に戻る
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <AdminNav session={session!} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">

          {/* ヘッダー */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/products')}
                className="text-sm text-slate-400 hover:text-blue-600 transition-colors"
              >
                ← 商品一覧
              </button>
              <h1 className="text-xl font-black tracking-tight">商品を編集</h1>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/products')}
                className="px-5 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? '保存中...' : '変更を保存'}
              </button>
            </div>
          </div>

          {/* ── 基本情報 ── */}
          <Card title="基本情報">
            <Field label="カテゴリ">
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={INPUT}>
                <option value="">— 未選択 —</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="型番">
                <input type="text" value={form.model_number} onChange={e => set('model_number', e.target.value)} className={INPUT} />
              </Field>
              <Field label="メーカー">
                <input type="text" value={form.maker} onChange={e => set('maker', e.target.value)} className={INPUT} />
              </Field>
            </div>

            <Field label="製品名">
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className={INPUT} />
            </Field>

            <Field label="価格">
              <input type="text" value={form.price} onChange={e => set('price', e.target.value)} placeholder="例: ¥89,800" className={INPUT} />
            </Field>
            <Field label="商品画像">
              <ImageUploadField
                value={form.image_url}
                onChange={url => set('image_url', url)}
              />
            </Field>
          </Card>

          {/* ── 接客トーク ── */}
          <Card title="接客トーク">
            <textarea
              value={form.script}
              onChange={e => set('script', e.target.value)}
              rows={7}
              className={`${INPUT} resize-y`}
            />
          </Card>

          {/* ── 売りポイント ── */}
          <Card title="売りポイント">
            <textarea
              value={form.unique_selling_point}
              onChange={e => set('unique_selling_point', e.target.value)}
              rows={3}
              className={`${INPUT} resize-y`}
            />
          </Card>

          {/* ── スペック ── */}
          {(() => {
            const catSpecKeys = categories.find(c => c.id === form.category_id)?.spec_keys ?? [];
            const missingKeys = catSpecKeys.filter(k => {
              if (form.spec_hidden_keys.includes(k)) return false;
              const entry = form.spec_entries.find(e => e.key === k);
              return !entry || entry.value.trim() === '';
            });
            return (
              <Card title="スペック">
                {missingKeys.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-amber-700 mb-1">入力が必要な項目 ({missingKeys.length}件)</p>
                    <p className="text-xs text-amber-600">{missingKeys.join('、')}</p>
                  </div>
                )}
                <div className="space-y-3">
                  {form.spec_entries.map((entry, i) => {
                    const isRequired = catSpecKeys.includes(entry.key);
                    const isEmpty = entry.value.trim() === '';
                    const highlight = isRequired && isEmpty;
                    const isManual = form.spec_manual_keys.includes(entry.key);
                    return (
                      <div key={i} className={`rounded-xl p-3 space-y-2 ${highlight ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-100'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <input
                              type="text"
                              value={entry.key}
                              onChange={e => updateSpec(i, 'key', e.target.value)}
                              placeholder="項目名"
                              className={`text-xs font-bold bg-transparent border-none outline-none flex-1 focus:bg-white focus:border-2 focus:border-blue-300 rounded-lg px-1 py-0.5 ${highlight ? 'text-amber-700' : 'text-slate-500'}`}
                            />
                            {isManual && (
                              <span className="shrink-0 text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-bold">手入力</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => hideSpec(i)}
                            className="shrink-0 px-2 py-1 text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            非表示
                          </button>
                        </div>
                        <textarea
                          value={entry.value}
                          onChange={e => updateSpec(i, 'value', e.target.value)}
                          placeholder={highlight ? '未入力 — 入力してください' : '値を入力'}
                          rows={2}
                          className={`w-full text-sm text-slate-800 bg-white border-2 rounded-lg px-3 py-2 focus:outline-none resize-y ${highlight ? 'border-amber-400 placeholder-amber-400' : 'border-slate-200 focus:border-blue-400'}`}
                        />
                      </div>
                    );
                  })}
                  <AddRowBtn onClick={() => setForm(f => ({ ...f, spec_entries: [...f.spec_entries, { key: '', value: '' }] }))} />
                </div>

                {/* 非表示の項目 */}
                {form.spec_hidden_keys.length > 0 && (
                  <div className="border-t border-slate-200 pt-3 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">非表示の項目（バッジに含まれません）</p>
                    {form.spec_hidden_keys.map(key => (
                      <div key={key} className="flex items-center justify-between gap-2 bg-slate-100 rounded-xl px-3 py-2">
                        <span className="text-xs font-medium text-slate-500 flex-1">{key}</span>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => restoreSpec(key)}
                            className="px-2 py-1 text-xs font-bold bg-white text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            表示する
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteHiddenSpec(key)}
                            className="px-2 py-1 text-xs font-bold bg-white text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            削除する
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })()}

          {/* ── メリットの伝え方 ── */}
          <Card title="メリットの伝え方（用語解説）">
            <div className="space-y-3">
              {form.glossary_entries.map((entry, i) => (
                <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={entry.term}
                      onChange={e => updateGlossary(i, 'term', e.target.value)}
                      placeholder="用語・機能名"
                      className="text-xs font-bold text-blue-700 bg-transparent border-none outline-none flex-1 focus:bg-white focus:border-2 focus:border-blue-300 rounded-lg px-1 py-0.5"
                    />
                    <DeleteBtn onClick={() => removeGlossary(i)} />
                  </div>
                  <textarea
                    value={entry.description}
                    onChange={e => updateGlossary(i, 'description', e.target.value)}
                    placeholder="わかりやすい説明"
                    rows={3}
                    className={`${INPUT} resize-y`}
                  />
                </div>
              ))}
              <AddRowBtn onClick={() => setForm(f => ({ ...f, glossary_entries: [...f.glossary_entries, { term: '', description: '' }] }))} />
            </div>
          </Card>

          {/* ── ウィザードスコア ── */}
          <Card title="ウィザードスコア">
            {/* スコア凡例 */}
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {([1,2,3,4,5] as const).map(s => {
                const { label, color, bg } = SCORE_LABELS[s];
                return (
                  <div key={s} className={`rounded-lg p-1.5 ${bg}`}>
                    <p className={`text-sm font-black ${color}`}>{s}</p>
                    <p className={`text-xs font-bold ${color}`}>{label}</p>
                  </div>
                );
              })}
            </div>

            {scoreRows.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">スコアが登録されていません</p>
            ) : (
              <div className="space-y-3">
                {scoreRows.map((row, i) => {
                  const meta = SCORE_LABELS[row.score] ?? SCORE_LABELS[1];
                  const fiveWarn = row.score === 5 && scoreRows.filter(r => r.score === 5).length > 1;
                  const isDeleted = flowKeywords.size > 0 && !flowKeywords.has(row.keyword);
                  const isEmpty = !row.reason.trim();
                  return (
                    <div key={i} className={`rounded-xl p-3 space-y-2 border ${
                      isDeleted ? 'bg-red-50 border-red-200' :
                      fiveWarn  ? 'bg-red-50 border-red-200' :
                      isEmpty   ? 'bg-amber-50 border-amber-200' :
                                  'bg-slate-50 border-slate-100'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={row.keyword}
                          onChange={e => updateScoreRow(i, 'keyword', e.target.value)}
                          className={`text-xs font-bold bg-transparent border-none outline-none flex-1 focus:bg-white focus:border-2 focus:border-blue-300 rounded-lg px-1 py-0.5 ${isDeleted ? 'text-red-700 line-through' : 'text-slate-700'}`}
                        />
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${meta.bg} ${meta.color}`}>{row.score} {meta.label}</span>
                        <DeleteBtn onClick={() => removeScoreRow(i)} />
                      </div>
                      {isDeleted && (
                        <p className="text-xs text-red-600 font-bold">現在この項目は削除されています。</p>
                      )}
                      {!isDeleted && (
                        <>
                          <div className="flex gap-1">
                            {([1,2,3,4,5] as const).map(s => {
                              const m = SCORE_LABELS[s];
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => updateScoreRow(i, 'score', s)}
                                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition-colors ${row.score === s ? `${m.bg} ${m.color} ring-2 ring-offset-1 ring-current` : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                >
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                          <textarea
                            value={row.reason}
                            onChange={e => updateScoreRow(i, 'reason', e.target.value)}
                            placeholder={isEmpty ? '未入力 — 理由を入力してください' : 'なぜこのスコア？（接客トーンで）'}
                            rows={2}
                            className={`w-full text-sm text-slate-800 bg-white border-2 rounded-lg px-3 py-2 focus:outline-none resize-y ${isEmpty ? 'border-amber-400 placeholder-amber-400' : 'border-slate-200 focus:border-blue-400'}`}
                          />
                        </>
                      )}
                      {fiveWarn && <p className="text-xs text-red-600 font-bold">⚠ スコア5は1商品1つだけです</p>}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setScoreRows(r => [...r, { keyword: '', score: 3, reason: '' }])}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              + キーワードを追加
            </button>

            {scoreError && <p className="text-xs text-red-600 font-bold">{scoreError}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleAutoGenerate}
                disabled={autoGenerating || !categoryName}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                {autoGenerating ? '生成中...' : '自動生成'}
              </button>
              <button
                type="button"
                onClick={handleScoreSave}
                disabled={scoreSaving || scoreRows.filter(r => r.score === 5).length > 1}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {scoreSaving ? '保存中...' : 'スコアを保存'}
              </button>
              {scoreSaved && <span className="text-sm text-green-600 font-medium">✓ 保存しました</span>}
            </div>
          </Card>

          {/* ── ホットスポット ── */}
          <Card title="ホットスポット（製品解説ポイント）">
            <AdminCoordinatePicker productId={id} imageUrl={form.image_url} />
          </Card>

          {/* エラー */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex justify-end gap-3 pb-10">
            <button
              onClick={() => router.push('/products')}
              className="px-5 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '変更を保存'}
            </button>
          </div>

        </div>
      </main>
    </>
  );
}

// ─── 共通 UI パーツ ───────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-200 space-y-3">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function DeleteBtn({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 ${className}`}
    >
      ✕
    </button>
  );
}

function AddRowBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
    >
      + 行を追加
    </button>
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
