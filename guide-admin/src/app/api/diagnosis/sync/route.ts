import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// カテゴリのウィザードキーワード変更を全商品に同期する
export async function POST(req: NextRequest) {
  const { categoryId, keywords } = await req.json() as {
    categoryId: string;
    keywords: string[];
  };

  if (!categoryId || !Array.isArray(keywords)) {
    return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 });
  }

  // このカテゴリの全商品を取得
  const { data: products } = await supabase
    .from('products')
    .select('id')
    .eq('category_id', categoryId);

  if (!products || products.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const productIds = products.map(p => p.id);

  // 既存の wizard_scores を取得
  const { data: existing } = await supabase
    .from('wizard_scores')
    .select('product_id, keyword')
    .in('product_id', productIds);

  // 商品ごとに不足キーワードを洗い出してupsert
  const toInsert: { product_id: string; keyword: string; score: number; reason: string | null; auto_generated: boolean }[] = [];

  for (const productId of productIds) {
    const existingKeywords = new Set(
      (existing ?? []).filter(e => e.product_id === productId).map(e => e.keyword)
    );
    for (const kw of keywords) {
      if (!existingKeywords.has(kw)) {
        toInsert.push({ product_id: productId, keyword: kw, score: 1, reason: null, auto_generated: false });
      }
    }
  }

  if (toInsert.length > 0) {
    await supabase.from('wizard_scores').upsert(toInsert, { onConflict: 'product_id,keyword' });
  }

  return NextResponse.json({ synced: toInsert.length });
}
