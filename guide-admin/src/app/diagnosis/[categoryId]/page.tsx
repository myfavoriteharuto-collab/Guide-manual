'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import AdminNav from '@/components/AdminNav';

// ─── 型定義 ────────────────────────────────────────────────
interface Option { id: string; label: string; hint: string; }
interface Step   { id: string; question: string; options: Option[]; }
interface FlowData { steps: Step[]; }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const newOption = (): Option => ({ id: uid(), label: '', hint: '' });
const newStep   = (): Step   => ({ id: uid(), question: '', options: [newOption(), newOption()] });

const INPUT = 'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors bg-white';

// ─── コンポーネント ─────────────────────────────────────────
export default function DiagnosisEditorPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const router = useRouter();
  const { session, loading } = useAuth();

  const [categoryName, setCategoryName] = useState('');
  const [flowId,       setFlowId]       = useState<string | null>(null);
  const [title,        setTitle]        = useState('あなたにぴったりの商品を探す');
  const [steps,        setSteps]        = useState<Step[]>([]);
  const [fetching,     setFetching]     = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session, categoryId]);

  async function loadData() {
    const [{ data: cat }, { data: flow }] = await Promise.all([
      supabase.from('categories').select('name').eq('id', categoryId).single(),
      supabase.from('diagnosis_flows').select('*').eq('category_id', categoryId).maybeSingle(),
    ]);
    if (cat) setCategoryName(cat.name);
    if (flow) {
      setFlowId(flow.id);
      setTitle(flow.title ?? 'あなたにぴったりの商品を探す');
      setSteps((flow.flow_data as FlowData)?.steps ?? []);
    }
    setFetching(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const flow_data: FlowData = { steps };

    if (flowId) {
      await supabase.from('diagnosis_flows').update({ title, flow_data }).eq('id', flowId);
    } else {
      const { data } = await supabase.from('diagnosis_flows').insert({
        category_id: categoryId, title, flow_data,
      }).select('id').single();
      if (data) setFlowId(data.id);
    }

    // 追加されたキーワードを全商品に同期
    const keywords = [...new Set(
      steps.flatMap(s => s.options.map(o => o.label)).filter(Boolean)
    )];
    await fetch('/api/diagnosis/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, keywords }),
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ─── ステップ操作 ─────────────────────────────────────────
  function addStep() {
    setSteps(s => [...s, newStep()]);
  }

  function removeStep(stepId: string) {
    setSteps(s => s.filter(st => st.id !== stepId));
  }

  function updateStep(stepId: string, question: string) {
    setSteps(s => s.map(st => st.id === stepId ? { ...st, question } : st));
  }

  function addOption(stepId: string) {
    setSteps(s => s.map(st => st.id === stepId
      ? { ...st, options: [...st.options, newOption()] }
      : st));
  }

  function removeOption(stepId: string, optId: string) {
    setSteps(s => s.map(st => st.id === stepId
      ? { ...st, options: st.options.filter(o => o.id !== optId) }
      : st));
  }

  function updateOption(stepId: string, optId: string, field: keyof Option, value: string) {
    setSteps(s => s.map(st => st.id === stepId
      ? { ...st, options: st.options.map(o => o.id === optId ? { ...o, [field]: value } : o) }
      : st));
  }

  if (loading || fetching) return <Loading />;

  return (
    <>
      <AdminNav session={session} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">

          {/* ヘッダー */}
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/categories')} className="text-sm text-slate-400 hover:text-blue-600 transition-colors">
              ← カテゴリ管理
            </button>
            <div>
              <h1 className="text-xl font-black tracking-tight">ヒアリングウィザード編集</h1>
              <p className="text-xs text-slate-500 mt-0.5">{categoryName}</p>
            </div>
          </div>

          {/* スコア説明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-1.5">
            <p className="text-xs font-black text-blue-700 uppercase tracking-widest">ウィザードスコア（1〜5）の意味</p>
            <div className="grid grid-cols-5 gap-2 text-center pt-1">
              {[
                { s: 1, label: '非搭載',     desc: 'ハードフィルターで除外', color: 'text-slate-500', bg: 'bg-slate-100' },
                { s: 2, label: 'エントリー', desc: 'エントリーモデル程度',   color: 'text-yellow-700', bg: 'bg-yellow-50' },
                { s: 3, label: '搭載',       desc: '標準的に搭載',           color: 'text-blue-700',   bg: 'bg-blue-50' },
                { s: 4, label: '高精度',     desc: '高精度に搭載',           color: 'text-green-700',  bg: 'bg-green-50' },
                { s: 5, label: '★推し',      desc: '1商品につき1つだけ',     color: 'text-purple-700', bg: 'bg-purple-50' },
              ].map(({ s, label, desc, color, bg }) => (
                <div key={s} className={`rounded-xl p-2 ${bg}`}>
                  <p className={`text-base font-black ${color}`}>{s}</p>
                  <p className={`text-xs font-bold ${color}`}>{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-blue-600 pt-1">※ スコア5「推し機能」は商品登録ページのスコア編集で手動設定します</p>
          </div>

          {/* ウィザードタイトル */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">ウィザードタイトル</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={INPUT} />
          </div>

          {/* ステップ一覧 */}
          {steps.map((step, si) => (
            <div key={step.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-black shrink-0">
                  {si + 1}
                </span>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex-1">ステップ {si + 1}</p>
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 hover:bg-red-50 rounded-lg"
                >
                  削除
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">質問文</label>
                <input
                  type="text"
                  value={step.question}
                  onChange={e => updateStep(step.id, e.target.value)}
                  placeholder="例: ご家族は何人ですか？"
                  className={INPUT}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-600">選択肢</label>
                {step.options.map((opt, oi) => (
                  <div key={opt.id} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <span className="text-xs text-slate-400 font-bold w-4 shrink-0">{oi + 1}</span>
                    <input
                      type="text"
                      value={opt.label}
                      onChange={e => updateOption(step.id, opt.id, 'label', e.target.value)}
                      placeholder="選択肢（例: 1〜2人）"
                      className="flex-1 border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-white"
                    />
                    <input
                      type="text"
                      value={opt.hint}
                      onChange={e => updateOption(step.id, opt.id, 'hint', e.target.value)}
                      placeholder="補足（例: コンパクトサイズがおすすめ）"
                      className="flex-1 border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeOption(step.id, opt.id)}
                      disabled={step.options.length <= 1}
                      className="text-slate-300 hover:text-red-400 disabled:opacity-30 transition-colors shrink-0 text-base"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(step.id)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  + 選択肢を追加
                </button>
              </div>
            </div>
          ))}

          {/* ステップ追加 */}
          <button
            type="button"
            onClick={addStep}
            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-2xl text-sm font-bold text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
          >
            + ステップを追加
          </button>

          {/* 保存ボタン */}
          <div className="flex items-center gap-3 pb-10">
            <button
              onClick={handleSave}
              disabled={saving || steps.length === 0}
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            {saved && <span className="text-sm text-green-600 font-medium">✓ 保存しました</span>}
          </div>

        </div>
      </main>
    </>
  );
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  );
}
