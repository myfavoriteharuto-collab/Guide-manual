'use client';

interface Props {
  term: string;
  description: string;
  onClose: () => void;
}

export default function InfoDrawer({ term, description, onClose }: Props) {
  return (
    <>
      {/* バックドロップ */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
        style={{ animation: 'slide-up 0.25s ease-out', maxHeight: '70vh' }}
      >
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="font-black text-slate-900 text-lg leading-snug pr-4">{term}</p>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-slate-900 text-white text-xl transition-colors hover:bg-slate-700 shrink-0"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 100px)' }}>
          {/* 画像プレースホルダー */}
          <div className="w-full h-44 bg-slate-100 rounded-2xl flex items-center justify-center">
            <div className="text-center space-y-2">
              <svg className="w-10 h-10 text-slate-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-xs text-slate-300 font-medium">画像準備中</p>
            </div>
          </div>

          {/* 説明テキスト */}
          {description && (
            <p className="text-slate-700 text-sm leading-relaxed pb-6">{description}</p>
          )}
        </div>
      </div>
    </>
  );
}
