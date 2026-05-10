'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  value: string;
  onChange: (url: string) => void;
}

const INPUT = 'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors';

export default function ImageUploadField({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    const ext = file.name.split('.').pop();
    const path = `products/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: true });

    if (error) {
      setUploadError('アップロードに失敗しました: ' + error.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage
      .from('product-images')
      .getPublicUrl(path);

    onChange(data.publicUrl);
    setUploading(false);

    // ファイル入力をリセット（同じファイルを再選択できるように）
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      {/* URL手動入力 */}
      <input
        type="url"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="https://..."
        className={INPUT}
      />

      {/* アップロードボタン */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'アップロード中...' : '画像ファイルをアップロード'}
        </button>
        <span className="text-xs text-slate-400">JPG / PNG / WebP</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* エラー */}
      {uploadError && (
        <p className="text-xs text-red-600 font-medium">{uploadError}</p>
      )}

      {/* プレビュー */}
      {value && (
        <img
          src={value}
          alt="商品画像プレビュー"
          className="h-24 rounded-lg object-contain bg-slate-50 border border-slate-200"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
  );
}
