'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import ProductShowcase from '@/components/ProductShowcase';
import InfoDrawer from '@/components/InfoDrawer';
import { isFavorite, toggleFavorite } from '@/lib/storage';

interface Feature {
  id: string;
  label: string;
  x: number;
  y: number;
  description: string;
  phrase: string;
}

interface ComparisonPoint { field: string; this_value: string; other_value: string; }
interface Comparison { id: string; type: string; compared_model: string; compared_maker: string; points: ComparisonPoint[]; summary: string; }

interface Product {
  id: string;
  name: string;
  model_number: string;
  maker: string;
  price: string;
  script: string;
  unique_selling_point: string;
  spec_data: Record<string, string>;
  glossary: Record<string, string>[];
  category_id: string | null;
  image_url: string;
  source_url: string;
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQR,       setShowQR]       = useState(false);
  const [showHotspot,  setShowHotspot]  = useState(false);
  const [features,     setFeatures]     = useState<Feature[]>([]);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [comparisons,      setComparisons]      = useState<Comparison[]>([]);
  const [activeComparison, setActiveComparison] = useState<Comparison | null>(null);
  const [fav, setFav] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [drawer, setDrawer] = useState<{ term: string; description: string } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from('products')
        .select('id, name, model_number, maker, price, script, unique_selling_point, spec_data, glossary, category_id, image_url, source_url')
        .eq('id', id)
        .single(),
      supabase
        .from('product_features')
        .select('*')
        .eq('product_id', id)
        .order('sort_order'),
      supabase
        .from('product_comparisons')
        .select('id, type, compared_model, compared_maker, points, summary')
        .eq('product_id', id)
        .order('type'),
    ]).then(([{ data }, { data: featureData }, { data: compData }]) => {
      if (data) {
        const override = sessionStorage.getItem(`price_override_${data.id}`);
        setProduct({ ...(data as Product), price: override ?? '' });
        setFav(isFavorite(data.id));
      }
      if (featureData) setFeatures(featureData as Feature[]);
      if (compData)    setComparisons(compData as Comparison[]);
      setLoading(false);
    });
  }, [id]);

  function savePrice() {
    if (!product) return;
    const digits = priceInput.replace(/[^0-9]/g, '');
    const formatted = digits ? `¥${Number(digits).toLocaleString('ja-JP')}` : priceInput.trim();
    sessionStorage.setItem(`price_override_${product.id}`, formatted);
    setProduct({ ...product, price: formatted });
    setEditingPrice(false);
  }

  function goBack() {
    if (product?.category_id) {
      router.push(`/categories/${product.category_id}`);
    } else {
      router.push('/');
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <LoadingSpinner />
    </div>
  );

  if (!product) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans">
      <div className="text-center space-y-3">
        <p className="text-slate-500 font-medium">商品が見つかりませんでした</p>
        <button onClick={() => router.push('/')} className="text-blue-600 text-sm hover:underline">
          ← トップに戻る
        </button>
      </div>
    </div>
  );

  const glossaryItems = product.glossary.filter(item => Object.keys(item).length > 0);
  const specEntries = Object.entries(product.spec_data ?? {});

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900">

      {/* ヘッダー（スティッキー） */}
      <header className="bg-slate-900 text-white px-5 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={goBack}
            className="text-slate-300 hover:text-white text-sm transition-colors shrink-0"
          >
            ← 戻る
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-base truncate leading-tight">{product.model_number}</p>
          </div>
          {editingPrice ? (
            <input
              autoFocus
              type="text"
              value={priceInput}
              onChange={e => {
                const digits = e.target.value.replace(/[^0-9]/g, '');
                setPriceInput(digits ? `¥${Number(digits).toLocaleString('ja-JP')}` : '');
              }}
              onBlur={savePrice}
              onKeyDown={e => { if (e.key === 'Enter') savePrice(); if (e.key === 'Escape') setEditingPrice(false); }}
              className="w-24 bg-white/20 border border-white/40 rounded-lg px-2 py-1 text-sm font-bold text-white text-right focus:outline-none focus:bg-white/30"
            />
          ) : (
            <button
              onClick={() => { setPriceInput(product.price); setEditingPrice(true); }}
              className={`text-sm shrink-0 hover:bg-white/15 px-2 py-1 rounded-lg transition-colors ${product.price ? 'font-bold text-white' : 'text-white/50'}`}
            >
              {product.price || 'タップして入力'}
            </button>
          )}
          <button
            onClick={() => setFav(toggleFavorite(product.id))}
            title={fav ? 'お気に入りから外す' : 'お気に入りに追加（比較画面で並べて見られます）'}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${fav ? 'bg-red-500 text-white' : 'bg-white/15 hover:bg-white/25 text-white'}`}
            aria-label={fav ? 'お気に入り解除' : 'お気に入りに追加'}
          >
            {fav ? '♥' : '♡'}
          </button>
          {features.length > 0 && (
            <button
              onClick={() => { setShowHotspot(true); setActiveHotspot(features[0]?.id ?? null); }}
              title="製品の各部位をタップすると接客用のポイント説明が表示されます"
              className="shrink-0 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-bold transition-colors"
            >
              解説
            </button>
          )}
          {product.source_url && (
            <button
              onClick={() => setShowQR(true)}
              title="お客様のスマホで読み取るとメーカー公式ページが開くQRコードを表示します"
              className="shrink-0 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-bold transition-colors"
            >
              QR
            </button>
          )}
        </div>
      </header>

      {/* インフォ・ドロワー */}
      {drawer && (
        <InfoDrawer
          term={drawer.term}
          description={drawer.description}
          onClose={() => setDrawer(null)}
        />
      )}

      {/* QRコードモーダル */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 mx-4 flex flex-col items-center gap-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-bold text-slate-800 text-base">このページをシェア</p>
            <QRCodeSVG value={product.source_url} size={220} />
            <p className="text-xs text-slate-400 text-center">お客様のスマホで読み取ると<br />メーカー公式ページが開きます</p>
            <button
              onClick={() => setShowQR(false)}
              className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* ホットスポットモーダル（スタッフ画面プレビュー） */}
      {showHotspot && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white shrink-0">
            <p className="text-sm font-bold">製品解説ポイント</p>
            <button
              onClick={() => setShowHotspot(false)}
              className="text-white/70 hover:text-white text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {/* 画像 + ホットスポット（画面内に収まるサイズ） */}
          <div className="flex-1 flex items-center justify-center bg-white overflow-hidden">
            <div className="relative inline-block select-none">
              <img
                src={product.image_url}
                alt={product.name}
                className="block max-w-full"
                style={{ maxHeight: 'calc(100dvh - 160px)' }}
                draggable={false}
              />
              {features.map(f => (
                <button
                  key={f.id}
                  type="button"
                  style={{ left: `${f.x}%`, top: `${f.y}%` }}
                  onClick={() => setActiveHotspot(activeHotspot === f.id ? null : f.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                >
                  <span className="relative flex h-7 w-7">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${activeHotspot === f.id ? 'bg-orange-400' : 'bg-blue-400'}`} />
                    <span className={`relative inline-flex rounded-full h-7 w-7 border-2 border-white shadow-lg text-white text-xs font-black items-center justify-center ${activeHotspot === f.id ? 'bg-orange-500' : 'bg-blue-500'}`}>
                      {f.label.charAt(0)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 選択中ホットスポットの情報 */}
          {(() => {
            const f = features.find(ft => ft.id === activeHotspot);
            if (!f) return <div className="h-14 bg-slate-800 shrink-0" />;
            return (
              <div className="bg-blue-600 text-white px-4 py-3 shrink-0">
                <p className="text-sm font-black">{f.label}</p>
                {f.description && <p className="text-xs text-blue-100 mt-1 leading-relaxed">{f.description}</p>}
                {f.phrase && <p className="text-xs text-white/80 mt-1 italic">「{f.phrase}」</p>}
              </div>
            );
          })()}

          {/* タブ一覧 */}
          <div className="flex gap-2 p-3 overflow-x-auto bg-slate-800 shrink-0">
            {features.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveHotspot(activeHotspot === f.id ? null : f.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeHotspot === f.id ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 商品画像 */}
      {product.image_url && (
        <div className="bg-white border-b border-slate-100 py-3 px-4 flex justify-center">
          <div className="w-full max-w-xs">
            <ProductShowcase
              imageUrl={product.image_url}
              productName={product.name}
            />
          </div>
        </div>
      )}

      <div className="p-5 space-y-5">

        {/* メーカー */}
        <div className="flex items-center">
          <span className="text-sm font-bold text-blue-600 px-3 py-1.5 bg-blue-50 rounded-full">
            {product.maker}
          </span>
        </div>

        {/* タブレット: 2カラムレイアウト */}
        <div className="md:grid md:grid-cols-2 md:gap-5 md:items-start space-y-5 md:space-y-0">

          {/* 左カラム: 売りポイント + メリットの伝え方 */}
          <div className="space-y-5">
            {product.unique_selling_point && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h2 className="text-base font-bold mb-3 border-l-4 border-blue-600 pl-3">売りポイント</h2>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {product.unique_selling_point}
                </p>
              </section>
            )}

            {glossaryItems.length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h2 className="text-base font-bold mb-4 border-l-4 border-blue-600 pl-3">メリットの伝え方</h2>
                <div className="space-y-3">
                  {glossaryItems.map((item, i) => {
                    const [term, description] = Object.entries(item)[0];
                    return (
                      <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <p className="font-bold text-blue-800 text-sm">{term}</p>
                          <button
                            onClick={() => setDrawer({ term, description: String(description) })}
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold hover:bg-blue-200 transition-colors shrink-0"
                            aria-label={`${term}の説明を見る`}
                          >
                            i
                          </button>
                        </div>
                        <p className="text-slate-600 text-sm leading-relaxed">{String(description)}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* 右カラム: スペック */}
          <div className="space-y-5">
            {specEntries.length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h2 className="text-base font-bold mb-4 border-l-4 border-slate-400 pl-3">製品スペック</h2>
                <div className="space-y-2.5 text-sm">
                  {specEntries.map(([key, value]) => (
                    <div key={key} className="flex justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-medium">{key}</span>
                        <button
                          onClick={() => setDrawer({ term: key, description: value })}
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold hover:bg-blue-100 hover:text-blue-600 transition-colors shrink-0"
                          aria-label={`${key}の説明を見る`}
                        >
                          i
                        </button>
                      </div>
                      <span className="text-slate-800 font-semibold text-right ml-4">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

        </div>

        {/* 他製品との比較（カード一覧） */}
        {comparisons.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold border-l-4 border-blue-600 pl-3">他製品との比較</h2>
              <p className="text-xs text-slate-400 mt-1 pl-3">タップすると比較表が開きます</p>
            </div>
            <div className="divide-y divide-slate-100">
              {comparisons.map(comp => (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => setActiveComparison(comp)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${comp.type === 'old_model' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                        {comp.type === 'old_model' ? '旧モデル' : '競合'}
                      </span>
                      <span className="text-sm font-bold text-slate-800 truncate">
                        {comp.compared_maker} {comp.compared_model}
                      </span>
                    </div>
                    {comp.summary && (
                      <p className="text-xs text-slate-500 line-clamp-1 leading-relaxed">{comp.summary}</p>
                    )}
                  </div>
                  <span className="text-slate-300 text-lg shrink-0">›</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 比較詳細モーダル */}
        {activeComparison && (
          <div className="fixed inset-0 z-50 flex flex-col bg-white">
            {/* モーダルヘッダー */}
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white shrink-0">
              <button
                onClick={() => setActiveComparison(null)}
                className="text-slate-300 hover:text-white text-sm transition-colors shrink-0"
              >
                ← 戻る
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${activeComparison.type === 'old_model' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}`}>
                  {activeComparison.type === 'old_model' ? '旧モデル比較' : '競合比較'}
                </span>
                <span className="text-sm font-bold truncate">
                  {activeComparison.compared_maker} {activeComparison.compared_model}
                </span>
              </div>
            </div>

            {/* モーダル本文（スクロール可能） */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* 接客ポイント（サマリー）を最初に表示 */}
              {activeComparison.summary && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-xs font-bold text-blue-600 mb-2">接客ポイント</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{activeComparison.summary}</p>
                </div>
              )}

              {/* 比較表 */}
              {(activeComparison.points as ComparisonPoint[]).length > 0 && (
                <div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-3 py-2.5 text-xs text-slate-500 font-bold whitespace-nowrap">項目</th>
                          <th className="text-left px-3 py-2.5 text-xs text-blue-600 font-bold whitespace-nowrap bg-blue-50">
                            {product.model_number}<br />
                            <span className="font-normal text-blue-400">本製品</span>
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs text-slate-500 font-bold whitespace-nowrap">
                            {activeComparison.compared_model}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(activeComparison.points as ComparisonPoint[]).map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{p.field}</td>
                            <td className="px-3 py-2.5 text-sm font-semibold text-blue-700 bg-blue-50/50">{p.this_value}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600">{p.other_value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-start gap-1.5 mt-3">
                    <span className="text-amber-500 text-xs shrink-0 mt-0.5">⚠</span>
                    <p className="text-xs text-amber-700 leading-relaxed">比較数値はブログ記事をもとに自動生成されています。重要なスペックはメーカー公式ページでご確認ください。</p>
                  </div>
                </div>
              )}

              <div className="h-6" />
            </div>
          </div>
        )}

        {/* ご案内例（一番下） */}
        {product.script && (
          <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <h2 className="text-sm font-bold mb-3 text-slate-500 border-l-4 border-slate-300 pl-3">ご案内例</h2>
            <p className="leading-relaxed text-sm text-slate-700 whitespace-pre-wrap">
              {product.script}
            </p>
          </section>
        )}

        <div className="h-6" />
      </div>

    </main>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-10 w-10 text-blue-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
