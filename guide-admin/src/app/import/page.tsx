'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import AdminNav from '@/components/AdminNav';

interface Category { id: string; name: string; }

interface ParsedRow {
  category_name: string;
  name: string;
  model_number: string;
  maker: string;
  price: string;
  // 解決済みカテゴリID（マッチング後）
  category_id: string | null;
  error: string | null;
}

const REQUIRED_HEADERS = ['カテゴリ', '製品名', '型番', 'メーカー', '価格'];

function parseCSV(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => {
      const cells: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (c === ',' && !inQ) {
          cells.push(cur.trim()); cur = '';
        } else {
          cur += c;
        }
      }
      cells.push(cur.trim());
      return cells;
    });
}

export default function ImportPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [categories,  setCategories]  = useState<Category[]>([]);
  const [rows,        setRows]        = useState<ParsedRow[]>([]);
  const [parseError,  setParseError]  = useState('');
  const [importing,   setImporting]   = useState(false);
  const [done,        setDone]        = useState(false);
  const [fileName,    setFileName]    = useState('');

  useEffect(() => {
    if (!session) return;
    supabase.from('categories').select('id, name').order('name')
      .then(({ data }) => { if (data) setCategories(data as Category[]); });
  }, [session]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setRows([]);
    setDone(false);

    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const grid = parseCSV(text);
      if (grid.length < 2) { setParseError('データが空です'); return; }

      // ヘッダー確認
      const headers = grid[0];
      const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        setParseError(`必須列が見つかりません: ${missing.join(', ')}`);
        return;
      }

      const idx = (h: string) => headers.indexOf(h);

      const parsed: ParsedRow[] = grid.slice(1).map(cells => {
        const catName     = cells[idx('カテゴリ')]  ?? '';
        const name        = cells[idx('製品名')]    ?? '';
        const model       = cells[idx('型番')]      ?? '';
        const maker       = cells[idx('メーカー')]  ?? '';
        const price       = cells[idx('価格')]      ?? '';
        const matched     = categories.find(c => c.name === catName.trim());

        let error: string | null = null;
        if (!name.trim())               error = '製品名が空です';
        else if (!catName.trim())       error = 'カテゴリが空です';
        else if (!matched)              error = `カテゴリ「${catName}」が存在しません`;

        return {
          category_name: catName.trim(),
          name:          name.trim(),
          model_number:  model.trim(),
          maker:         maker.trim(),
          price:         price.trim(),
          category_id:   matched?.id ?? null,
          error,
        };
      });

      setRows(parsed);
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleImport() {
    const valid = rows.filter(r => !r.error);
    if (valid.length === 0) return;
    setImporting(true);

    await supabase.from('products').insert(
      valid.map(r => ({
        category_id:   r.category_id,
        name:          r.name,
        model_number:  r.model_number,
        maker:         r.maker,
        price:         r.price,
        sort_order:    0,
        script:        '',
        unique_selling_point: '',
        image_url:     '',
        spec_data:     {},
        glossary:      [],
      }))
    );

    setImporting(false);
    setDone(true);
  }

  if (loading) return <LoadingScreen />;

  const validCount   = rows.filter(r => !r.error).length;
  const errorCount   = rows.filter(r =>  r.error).length;

  return (
    <>
      <AdminNav session={session!} />
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">

          {/* ヘッダー */}
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/products')} className="text-sm text-slate-400 hover:text-blue-600 transition-colors">
              ← 商品一覧
            </button>
            <h1 className="text-2xl font-black tracking-tight">CSVで一括登録</h1>
          </div>

          {/* ⚠️ 注意事項（常に表示） */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-lg">⚠️</span>
              <p className="font-black text-amber-800 text-sm">CSVインポートでは登録できない項目があります</p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">CSVで登録できる項目</p>
                {['カテゴリ', '製品名', '型番', 'メーカー', '価格'].map(item => (
                  <div key={item} className="flex items-center gap-1.5 text-xs text-amber-800">
                    <span className="text-green-500 font-bold">✓</span> {item}
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">登録後に個別入力が必要な項目</p>
                {['接客トーク', '売りポイント', 'スペック', 'メリットの伝え方（用語解説）', '商品画像URL', 'ホットスポット'].map(item => (
                  <div key={item} className="flex items-center gap-1.5 text-xs text-red-700">
                    <span className="font-bold">✕</span> {item}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-100 rounded-xl p-3 leading-relaxed">
              CSVで基本情報を一括登録した後、各商品の編集ページから接客トーク・スペック・画像などを個別に入力してください。AIによる自動解析はCSVインポートでは実行されません。
            </p>
          </div>

          {/* CSVフォーマット説明 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <p className="text-sm font-bold text-slate-700">CSVファイルの形式</p>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-100">
                    {REQUIRED_HEADERS.map(h => (
                      <th key={h} className="border border-slate-300 px-3 py-1.5 text-left font-bold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-200 px-3 py-1.5 text-slate-500">電子レンジ</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-slate-500">東芝 石窯ドーム ER-D7000B</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-slate-500">ER-D7000B</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-slate-500">東芝</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-slate-500">¥89,800</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
              <li>1行目はヘッダー行（上記の列名をそのまま使用）</li>
              <li>「カテゴリ」は管理画面に登録済みのカテゴリ名と完全一致させてください</li>
              <li>ExcelでCSV形式で保存（UTF-8推奨）</li>
            </ul>
          </div>

          {/* ファイル選択 */}
          {!done && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
            >
              <p className="text-3xl mb-2">📂</p>
              <p className="font-bold text-slate-700">{fileName || 'CSVファイルを選択'}</p>
              <p className="text-xs text-slate-400 mt-1">クリックしてファイルを選択</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>
          )}

          {/* パースエラー */}
          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700 font-medium">⚠️ {parseError}</p>
            </div>
          )}

          {/* プレビュー */}
          {rows.length > 0 && !done && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-slate-700">{rows.length} 行を読み込みました</p>
                  {validCount > 0 && <span className="text-xs bg-green-100 text-green-700 rounded-full px-2.5 py-1 font-bold">登録可能 {validCount} 件</span>}
                  {errorCount > 0 && <span className="text-xs bg-red-100 text-red-700 rounded-full px-2.5 py-1 font-bold">エラー {errorCount} 件</span>}
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing || validCount === 0}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {importing ? '登録中...' : `${validCount} 件を登録する`}
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['状態', 'カテゴリ', '製品名', '型番', 'メーカー', '価格'].map(h => (
                          <th key={h} className="text-left px-3 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row, i) => (
                        <tr key={i} className={row.error ? 'bg-red-50' : 'hover:bg-slate-50'}>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {row.error ? (
                              <span className="text-xs text-red-600 font-medium">✕ {row.error}</span>
                            ) : (
                              <span className="text-xs text-green-600 font-bold">✓ OK</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs">{row.category_name || '—'}</td>
                          <td className="px-3 py-2.5 font-medium max-w-[200px] truncate">{row.name || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap font-mono">{row.model_number || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-xs">{row.maker || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-xs">{row.price || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 完了 */}
          {done && (
            <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-8 text-center space-y-4">
              <p className="text-4xl">✓</p>
              <p className="font-black text-xl text-green-800">{validCount} 件を登録しました</p>
              <p className="text-sm text-green-700 bg-green-100 rounded-xl p-3">
                接客トーク・スペック・画像などは商品一覧の「編集」から個別に入力してください
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => { setRows([]); setFileName(''); setDone(false); if (fileRef.current) fileRef.current.value = ''; }}
                  className="px-5 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
                >
                  続けて登録
                </button>
                <button
                  onClick={() => router.push('/products')}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
                >
                  商品一覧へ →
                </button>
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
