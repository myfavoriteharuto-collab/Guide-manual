'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import AdminNav from '@/components/AdminNav';

// ─── 型定義 ───────────────────────────────────────────────
interface Category {
  id: string;
  name: string;
  spec_keys: string[];
  script_hint: string;
  is_hidden: boolean;
}

interface CategoryForm {
  name: string;
  spec_keys_raw: string; // カンマ区切り
  script_hint: string;
}

const EMPTY_FORM: CategoryForm = { name: '', spec_keys_raw: '', script_hint: '' };

function parseKeys(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function toRaw(keys: string[]): string {
  return keys.join(', ');
}

// ─── コンポーネント ────────────────────────────────────────
export default function CategoriesPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  const [categories,   setCategories]   = useState<Category[]>([]);
  const [fetching,     setFetching]     = useState(true);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [addForm,      setAddForm]      = useState<CategoryForm>(EMPTY_FORM);
  const [editId,       setEditId]       = useState<string | null>(null);
  const [editForm,     setEditForm]     = useState<CategoryForm>(EMPTY_FORM);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (!session) return;
    loadCategories();
  }, [session]);

  async function loadCategories() {
    setFetching(true);
    const { data } = await supabase.from('categories').select('*').order('name');
    if (data) setCategories(data as Category[]);
    setFetching(false);
  }

  function startEdit(cat: Category) {
    setEditId(cat.id);
    setEditForm({ name: cat.name, spec_keys_raw: toRaw(cat.spec_keys), script_hint: cat.script_hint });
    setShowAddForm(false);
  }

  async function handleAdd() {
    if (!addForm.name.trim()) return;
    setSaving(true);
    await supabase.from('categories').insert({
      name: addForm.name.trim(),
      spec_keys: parseKeys(addForm.spec_keys_raw),
      script_hint: addForm.script_hint.trim(),
    });
    setAddForm(EMPTY_FORM);
    setShowAddForm(false);
    setSaving(false);
    await loadCategories();
  }

  async function handleUpdate() {
    if (!editId) return;
    setSaving(true);
    await supabase.from('categories').update({
      name: editForm.name.trim(),
      spec_keys: parseKeys(editForm.spec_keys_raw),
      script_hint: editForm.script_hint.trim(),
    }).eq('id', editId);
    setEditId(null);
    setSaving(false);
    await loadCategories();
  }

  async function handleDelete(id: string) {
    await supabase.from('categories').delete().eq('id', id);
    setDeleteId(null);
    await loadCategories();
  }

  async function toggleHidden(cat: Category) {
    await supabase.from('categories').update({ is_hidden: !cat.is_hidden }).eq('id', cat.id);
    await loadCategories();
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <AdminNav session={session!} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">

          {/* ヘッダー */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black tracking-tight">カテゴリ管理</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                商品登録時のカテゴリとAI解析の設定を管理します
              </p>
            </div>
            <button
              onClick={() => { setShowAddForm(true); setEditId(null); }}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              + 新規追加
            </button>
          </div>

          {/* 新規追加フォーム */}
          {showAddForm && (
            <div className="bg-white rounded-2xl shadow-sm p-5 border-2 border-blue-200 space-y-4">
              <h3 className="text-sm font-bold text-blue-700">新規カテゴリを追加</h3>
              <CategoryFormFields form={addForm} onChange={setAddForm} />
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={saving || !addForm.name.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? '追加中...' : '追加する'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* カテゴリ一覧 */}
          {fetching ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : categories.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <p className="text-slate-400 font-medium">カテゴリが登録されていません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className={`bg-white rounded-2xl shadow-sm border p-5 transition-all ${
                    editId === cat.id ? 'border-blue-300' : 'border-slate-200'
                  }`}
                >
                  {editId === cat.id ? (
                    /* 編集モード */
                    <div className="space-y-4">
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">編集中</p>
                      <CategoryFormFields form={editForm} onChange={setEditForm} />
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdate}
                          disabled={saving || !editForm.name.trim()}
                          className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {saving ? '保存中...' : '保存する'}
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 表示モード */
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-800">{cat.name}</p>
                          {cat.is_hidden && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">非表示</span>
                          )}
                        </div>
                        {cat.spec_keys.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {cat.spec_keys.map(key => (
                              <span
                                key={key}
                                className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs"
                              >
                                {key}
                              </span>
                            ))}
                          </div>
                        )}
                        {cat.script_hint && (
                          <p className="text-xs text-slate-400 leading-relaxed">{cat.script_hint}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {deleteId === cat.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(cat.id)}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                            >
                              削除確認
                            </button>
                            <button
                              onClick={() => setDeleteId(null)}
                              className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => toggleHidden(cat)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                cat.is_hidden
                                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {cat.is_hidden ? '非表示中' : '表示中'}
                            </button>
                            <button
                              onClick={() => router.push(`/diagnosis/${cat.id}`)}
                              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-purple-100 hover:text-purple-700 transition-colors"
                            >
                              ウィザード
                            </button>
                            <button
                              onClick={() => startEdit(cat)}
                              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-blue-100 hover:text-blue-700 transition-colors"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => setDeleteId(cat.id)}
                              className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-red-100 hover:text-red-600 transition-colors"
                            >
                              削除
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </main>
    </>
  );
}

// ─── フォームフィールド（追加・編集共通） ──────────────────
function CategoryFormFields({
  form,
  onChange,
}: {
  form: CategoryForm;
  onChange: (f: CategoryForm) => void;
}) {
  const INPUT = 'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors';

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">カテゴリ名</label>
        <input
          type="text"
          value={form.name}
          onChange={e => onChange({ ...form, name: e.target.value })}
          placeholder="例: 電子レンジ・オーブンレンジ"
          className={INPUT}
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">
          スペック項目
          <span className="text-slate-400 font-normal ml-1">（カンマ区切りで入力）</span>
        </label>
        <input
          type="text"
          value={form.spec_keys_raw}
          onChange={e => onChange({ ...form, spec_keys_raw: e.target.value })}
          placeholder="例: 定格高周波出力, 庫内容量, 最高温度, 奥行き"
          className={INPUT}
        />
        {/* プレビュー */}
        {form.spec_keys_raw.trim() && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {parseKeys(form.spec_keys_raw).map(key => (
              <span key={key} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                {key}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">
          接客トーク方針
          <span className="text-slate-400 font-normal ml-1">（AIへのヒント）</span>
        </label>
        <textarea
          value={form.script_hint}
          onChange={e => onChange({ ...form, script_hint: e.target.value })}
          placeholder="例: 調理の手軽さ・時短・プロ級仕上がりを強調すること"
          rows={2}
          className={`${INPUT} resize-none`}
        />
      </div>
    </div>
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
