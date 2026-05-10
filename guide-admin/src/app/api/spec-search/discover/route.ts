import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchProductUrls, searchBlogUrls } from '@/lib/google-cse';
import { getMakerFromUrl } from '@/lib/allowedDomains';

export async function POST(req: NextRequest) {
  const { modelNumber, categoryId } = await req.json() as {
    modelNumber: string;
    categoryId?: string;
  };

  // ── 既存商品を検索 ──────────────────────────────────────────
  const { data: product } = await supabase
    .from('products')
    .select('id, model_number, maker, price, name, category_id, categories(name, id)')
    .ilike('model_number', modelNumber.trim())
    .maybeSingle();

  // 商品が見つからず categoryId も未指定 → カテゴリ一覧を返す
  if (!product && !categoryId) {
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .order('name');
    return NextResponse.json({ isNewProduct: true, categories: categories ?? [] });
  }

  // 既存商品 or カテゴリ指定済み（新規）
  const productId    = product?.id ?? null;
  const resolvedCatId   = product?.category_id ?? categoryId!;
  const catInfo      = (product?.categories as unknown as { id: string; name: string } | null);
  let categoryName   = catInfo?.name ?? '';

  // カテゴリ名が未解決の場合（新規商品でcategoryIdのみ持っている場合）
  if (!categoryName && categoryId) {
    const { data: cat } = await supabase
      .from('categories')
      .select('name')
      .eq('id', categoryId)
      .single();
    categoryName = cat?.name ?? '';
  }

  // URL候補キャッシュ確認（既存商品のみ）
  if (productId) {
    const { data: cached } = await supabase
      .from('url_candidates')
      .select('url, title, snippet, selected')
      .eq('product_id', productId);

    if (cached && cached.length > 0) {
      // キャッシュヒット時もブログは毎回再検索する
      // 比較記事は後から追加される可能性があるため、キャッシュに依存しない
      const freshBlog = await searchBlogUrls(modelNumber.trim(), 3).catch(() => []);
      const cachedUrls = new Set(cached.map(c => c.url));
      const newBlogCandidates = freshBlog
        .filter(c => !cachedUrls.has(c.url))
        .map(c => ({ url: c.url, title: c.title, snippet: c.snippet, selected: true }));

      // 新しいブログURLはDBにも追加して次回以降キャッシュに含める
      if (newBlogCandidates.length > 0) {
        await supabase.from('url_candidates').upsert(
          newBlogCandidates.map(c => ({ product_id: productId, ...c }))
        );
      }

      return NextResponse.json({
        isNewProduct: false,
        productId,
        maker:         product?.maker ?? '',
        modelNumber:   product?.model_number ?? modelNumber,
        categoryId:    resolvedCatId,
        categoryName,
        candidates:    [...newBlogCandidates, ...cached],
        existingName:  (product as { name?: string })?.name  ?? '',
        existingPrice: (product as { price?: string })?.price ?? '',
        existingMaker: product?.maker ?? '',
      });
    }
  }

  // ブロックドメイン取得
  const { data: blockedData } = await supabase
    .from('blocked_domains')
    .select('domain');
  const blockedDomains = (blockedData ?? []).map(r => r.domain);

  // Serper でURL候補とブログ記事を並列検索
  const makerHint = product?.maker ?? '';
  let officialCandidates: { url: string; title: string; snippet: string }[] = [];
  let blogCandidates:    { url: string; title: string; snippet: string }[] = [];

  try {
    [officialCandidates, blogCandidates] = await Promise.all([
      searchProductUrls(makerHint, modelNumber.trim(), 10, blockedDomains),
      searchBlogUrls(modelNumber.trim(), 3).catch(() => []),
    ]);
  } catch (e) {
    return NextResponse.json({ error: `URL検索に失敗しました: ${(e as Error).message}` }, { status: 500 });
  }

  // kind: 'official'=メーカー公式, 'comparison'=比較ブログ, 'other'=その他
  // 公式・比較はデフォルト選択、その他は未選択
  const candidates = [
    ...blogCandidates.map(c => ({ ...c, selected: true, kind: 'comparison' as const })),
    ...officialCandidates.map(c => {
      const isManufacturer = getMakerFromUrl(c.url) !== '';
      return { ...c, selected: isManufacturer, kind: isManufacturer ? 'official' as const : 'other' as const };
    }),
  ];

  // キャッシュ保存（既存商品のみ）
  if (productId && candidates.length > 0) {
    await supabase.from('url_candidates').upsert(
      candidates.map(c => ({
        product_id: productId,
        url: c.url, title: c.title, snippet: c.snippet, selected: c.selected,
      }))
    );
  }

  return NextResponse.json({
    isNewProduct:  !product,
    productId,
    maker:         product?.maker ?? '',
    modelNumber:   product?.model_number ?? modelNumber,
    categoryId:    resolvedCatId,
    categoryName,
    candidates,
    existingName:  (product as { name?: string })?.name  ?? '',
    existingPrice: (product as { price?: string })?.price ?? '',
    existingMaker: product?.maker ?? '',
  });
}
