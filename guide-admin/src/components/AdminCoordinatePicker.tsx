'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface PopupState { feature: Feature; }

interface Feature {
  id: string;
  label: string;
  x: number;
  y: number;
  description: string;
  phrase: string;
  sort_order: number;
}

interface Props {
  productId: string;
  imageUrl: string;
}

const EMPTY_FORM = { label: '', description: '', phrase: '' };

export default function AdminCoordinatePicker({ productId, imageUrl }: Props) {
  const [features,    setFeatures]    = useState<Feature[]>([]);
  const [pending,     setPending]     = useState<{ x: number; y: number } | null>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [popup,       setPopup]       = useState<PopupState | null>(null);
  const [activeTab,   setActiveTab]   = useState<string | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadFeatures(); }, [productId]);

  async function loadFeatures() {
    const { data } = await supabase
      .from('product_features')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order');
    if (data) setFeatures(data as Feature[]);
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * 1000) / 10;
    setPending({ x, y });
    setForm(EMPTY_FORM);
    setEditId(null);
  }

  async function handleSave() {
    if (!form.label.trim()) return;
    setSaving(true);
    if (editId) {
      await supabase.from('product_features').update({
        label: form.label, description: form.description, phrase: form.phrase,
      }).eq('id', editId);
      setEditId(null);
    } else if (pending) {
      await supabase.from('product_features').insert({
        product_id: productId,
        label: form.label, x: pending.x, y: pending.y,
        description: form.description, phrase: form.phrase,
        sort_order: features.length,
      });
      setPending(null);
    }
    setForm(EMPTY_FORM);
    await loadFeatures();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('product_features').delete().eq('id', id);
    await loadFeatures();
  }

  function startEdit(f: Feature) {
    setEditId(f.id);
    setPending(null);
    setForm({ label: f.label, description: f.description, phrase: f.phrase });
  }

  function cancel() {
    setPending(null);
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  const isFormOpen = pending !== null || editId !== null;

  return (
    <div className="space-y-4">
      {imageUrl ? (
        <>
          {/* モード切り替えボタン */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowPreview(false); setPopup(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!showPreview ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              編集モード
            </button>
            <button
              type="button"
              onClick={() => { setShowPreview(true); setPending(null); setEditId(null); setForm(EMPTY_FORM); setActiveTab(features[0]?.id ?? null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${showPreview ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              スタッフ画面プレビュー
            </button>
          </div>

          {showPreview ? (
            /* ─── プレビューモード（スタッフ画面と同じ表示） ─── */
            <div className="rounded-xl overflow-hidden border-2 border-blue-300 bg-slate-900">
              <div className="px-3 py-2 bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5">
                <span>👁</span> スタッフ画面プレビュー
              </div>

              {/* 画像 + ホットスポット */}
              <div className="relative bg-white select-none">
                <img src={imageUrl} alt="製品画像" className="w-full h-auto block" draggable={false} />
                {features.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={e => { e.stopPropagation(); setPopup(popup?.feature.id === f.id ? null : { feature: f }); setActiveTab(f.id); }}
                    style={{ left: `${f.x}%`, top: `${f.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                  >
                    <span className="relative flex h-6 w-6">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${popup?.feature.id === f.id ? 'bg-orange-400' : 'bg-blue-400'}`} />
                      <span className={`relative inline-flex rounded-full h-6 w-6 border-2 border-white shadow-lg text-white text-[10px] font-black items-center justify-center ${popup?.feature.id === f.id ? 'bg-orange-500' : 'bg-blue-500'}`}>
                        {f.label.charAt(0)}
                      </span>
                    </span>
                  </button>
                ))}

                {/* ポップアップ */}
                {popup && (
                  <div
                    style={{ left: `${Math.min(popup.feature.x, 65)}%`, top: `${Math.max(popup.feature.y - 5, 5)}%` }}
                    className="absolute z-20 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-3 pointer-events-none"
                  >
                    <p className="text-xs font-black text-blue-700 mb-1">{popup.feature.label}</p>
                    {popup.feature.description && <p className="text-xs text-slate-600 leading-relaxed">{popup.feature.description}</p>}
                    {popup.feature.phrase && <p className="text-xs text-blue-500 mt-1.5 italic font-medium">「{popup.feature.phrase}」</p>}
                  </div>
                )}
              </div>

              {/* タブ一覧 */}
              {features.length > 0 && (
                <div className="flex gap-2 p-3 overflow-x-auto bg-slate-800">
                  {features.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => { setActiveTab(f.id); setPopup(popup?.feature.id === f.id ? null : { feature: f }); }}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === f.id ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ─── 編集モード ─── */
            <>
              <p className="text-xs text-slate-500">
                画像をクリックしてホットスポットを追加。番号をクリックすると編集できます。
              </p>
              <div
                ref={imgRef}
                className="relative cursor-crosshair rounded-xl overflow-hidden border-2 border-slate-200 select-none"
                onClick={handleImageClick}
              >
                <img src={imageUrl} alt="製品画像" className="w-full h-auto block" draggable={false} />

                {/* 登録済みホットスポット */}
                {features.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={e => { e.stopPropagation(); startEdit(f); }}
                    style={{ left: `${f.x}%`, top: `${f.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-10 group"
                    title={f.label}
                  >
                    <span className={`flex items-center justify-center w-7 h-7 rounded-full border-2 border-white shadow-lg text-white text-xs font-bold transition-transform group-hover:scale-110 ${editId === f.id ? 'bg-orange-500' : 'bg-blue-500'}`}>
                      {i + 1}
                    </span>
                  </button>
                ))}

                {/* クリック位置プレビュー（未保存） */}
                {pending && (
                  <div
                    style={{ left: `${pending.x}%`, top: `${pending.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-400 border-2 border-white shadow-lg animate-pulse" />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
          先に商品画像を設定するとホットスポットを追加できます
        </p>
      )}

      {/* 入力フォーム（編集モードのみ） */}
      {!showPreview && isFormOpen && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-3">
          <p className="text-xs font-bold text-blue-700">
            {editId ? 'ホットスポットを編集' : `新規 — 位置: ${pending?.x}%, ${pending?.y}%`}
          </p>
          <input
            type="text"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="ラベル（例: 赤外線センサー）"
            autoFocus
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
          />
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="説明（例: 食品の表面温度を検知して最適な加熱を自動調節）"
            rows={2}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none bg-white"
          />
          <input
            type="text"
            value={form.phrase}
            onChange={e => setForm(f => ({ ...f, phrase: e.target.value }))}
            placeholder='キラーフレーズ（例: 温め直しが完璧です）'
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.label.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="px-4 py-2 bg-white text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors border border-slate-200"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ホットスポット一覧（編集モードのみ） */}
      {!showPreview && features.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">登録済み ({features.length}件)</p>
          {features.map((f, i) => (
            <div key={f.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{f.label}</p>
                {f.description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{f.description}</p>}
                {f.phrase && <p className="text-xs text-blue-600 mt-0.5 italic">「{f.phrase}」</p>}
                <p className="text-xs text-slate-300 mt-1">{f.x}%, {f.y}%</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => startEdit(f)}
                  className="px-2 py-1 text-xs text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                  編集
                </button>
                <button type="button" onClick={() => handleDelete(f.id)}
                  className="px-2 py-1 text-xs text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
