import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';
import { extractFromHtml, extractSpecTableMap, decodeResponse } from '@/lib/fetcher';
import { SPEC_FIELDS_BY_CATEGORY } from '@/lib/scoring-rules';
import { EXTRACTION_RULES_BY_CATEGORY } from '@/lib/spec-extraction-rules';
import { getMakerFromUrl } from '@/lib/allowedDomains';
import type { Category } from '@/types/product';

// ── ブログURL判定 ────────────────────────────────────────────
const BLOG_DOMAINS = ['monomania.sblo.jp'];
function isBlogUrl(url: string): boolean {
  try { return BLOG_DOMAINS.some(d => new URL(url).hostname === d); }
  catch { return false; }
}

// ── OGP 画像URL抽出 ─────────────────────────────────────────
function extractImageUrl(html: string): string {
  const patterns = [
    /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]?.startsWith('http')) return m[1];
  }
  return '';
}

// ── メインルート ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: {
    productId: string | null;
    isNewProduct: boolean;
    categoryId: string;
    categoryName: string;
    urls: string[];
    modelNumber: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'リクエストの解析に失敗しました' }, { status: 400 });
  }

  const { productId, isNewProduct, categoryId, categoryName, urls, modelNumber } = body;

  try {
    // カテゴリ情報取得（spec_keys / script_hint）
    const { data: categoryData } = await supabase
      .from('categories')
      .select('id, name, spec_keys, script_hint')
      .eq('id', categoryId)
      .single();

    const category = categoryData as Category | null;
    const specKeys   = category?.spec_keys   ?? [];
    const scriptHint = category?.script_hint ?? '';

    // ウィザード用スペックフィールド
    const wizardFields = SPEC_FIELDS_BY_CATEGORY[categoryName] ?? [];

    // ── メーカー別スペックURLを自動追加 ──────────────────────
    // jp.sharp: /products/[model]/ → /products/[model]/spec/ を追加
    const specVariants: string[] = [];
    for (const url of urls) {
      try {
        const u = new URL(url);
        if (u.hostname === 'jp.sharp') {
          const path = u.pathname.replace(/\/$/, '');
          if (/\/products\/[^/]+$/.test(path)) {
            const specUrl = `${u.origin}${path}/spec/`;
            if (!urls.includes(specUrl)) specVariants.push(specUrl);
          }
        }
      } catch { /* ignore */ }
    }
    const allUrls = [...urls, ...specVariants];

    // ── 並列 URL フェッチ（Shift-JIS等の非UTF-8エンコード対応）──
    let firstHtml = '';
    const results = await Promise.allSettled(
      allUrls.map(async (url) => {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpecBot/1.0)' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await decodeResponse(res);
        // ブログ以外の最初のURLからOGP画像を取得（インデックスではなく条件で判定）
        if (firstHtml === '' && !isBlogUrl(url)) firstHtml = html;
        return {
          url,
          text: extractFromHtml(html),
          specMap: isBlogUrl(url) ? {} : extractSpecTableMap(html),
        };
      })
    );
    const validPages = results
      .filter((r): r is PromiseFulfilledResult<{ url: string; text: string; specMap: Record<string, string> }> => r.status === 'fulfilled')
      .map(r => r.value);

    if (validPages.length === 0) {
      return NextResponse.json({ error: 'すべての URL の取得に失敗しました' }, { status: 502 });
    }

    // ── ルールベースで wizard_specs を抽出 ────────────────────────
    // 複数ページのスペックマップを統合（先に出現したキーを優先）
    const mergedSpecMap: Record<string, string> = {};
    const specMapSources: Record<string, string> = {};
    for (const page of validPages) {
      for (const [k, v] of Object.entries(page.specMap)) {
        if (!(k in mergedSpecMap)) {
          mergedSpecMap[k] = v;
          specMapSources[k] = page.url;
        }
      }
    }

    const extractionRule = EXTRACTION_RULES_BY_CATEGORY[categoryName];
    const ruleBasedSpecs = extractionRule ? extractionRule(mergedSpecMap) : null;

    const imageUrl = extractImageUrl(firstHtml);

    // ブログ記事は型番が本文に含まれているものだけ使用（無関係な記事を除外）
    const modelNoHyphen = modelNumber.replace(/-/g, '').toLowerCase();
    const blogPages = validPages.filter(p =>
      isBlogUrl(p.url) &&
      (p.text.toLowerCase().includes(modelNumber.toLowerCase()) ||
       p.text.toLowerCase().includes(modelNoHyphen))
    );
    const officialPages = validPages.filter(p => !isBlogUrl(p.url));

    // ── Gemini プロンプト ─────────────────────────────────────
    const prompt = `
あなたは家電製品の情報抽出アシスタントです。
以下のソースから指定された情報を抽出してください。

カテゴリ: ${categoryName}
${scriptHint ? `接客トーク（script）の方針: ${scriptHint}` : ''}

【商品スペック項目（spec_data用）】
${specKeys.map(k => `- ${k}`).join('\n') || '（なし）'}

【ウィザードスペック項目（wizard_specs用）】
${wizardFields.map(f => `- ${f}`).join('\n') || '（なし）'}

※ wizard_specs の抽出はラベル名が違っても文脈から積極的に推論してください（推測OK）。
  よくあるマッピング例:
  「総庫内容量」「庫内有効寸法」→「庫内容量」（例: "30L"）
  「オーブン温度調節範囲」の最高値→「オーブン最高温度」（例: "300℃"）
  「レンジ出力」の最大値→「最大出力」（例: "1000W"）
  「搭載センサー」「センサー」→「センサーの種類」
  加熱方式に「過熱水蒸気」「スチーム」が含まれる→「スチーム機能」は"あり"
  「熱風コンベクション」「グリル」→「グリル方式」に記載
  フラット庫内→「テーブルタイプ」は"フラット"、ターンテーブル→"テーブル式"

【出力ルール】
- model_numberはハイフンを含めてそのまま返す
- priceは "¥XX,XXX" 形式の文字列
- spec_dataは上記「商品スペック項目」を抽出（公式ページの値を優先、確信がない値はnull）
- wizard_specsは上記「ウィザードスペック項目」をすべて返す（推論して埋める、不明な値のみnull、省略禁止）
- wizard_sourcesには各wizard_spec項目の出典URLを入れる（不明ならnull）
- unique_selling_point・scriptはブログの比較・評価があれば優先的に参考にして作成
- glossaryは接客で使う技術用語と分かりやすい説明のペア
${blogPages.length > 0 ? `
【参考情報：ブログ・レビュー】
売りポイント・他社比較・接客トーク（unique_selling_point、script）の作成に優先的に使用してください。
${blogPages.map(p => `=== ${p.url} ===\n${p.text}`).join('\n\n')}` : ''}

【公式情報：ファクトチェック用】
スペック値（数値・型番・容量等）はこちらを優先してください。
${officialPages.map(p => `=== ${p.url} ===\n${p.text}`).join('\n\n')}
`.trim();

    // ルールベースでwizard_specsが取れる場合はGeminiから除外してトークンを節約
    const needWizardFromGemini = !ruleBasedSpecs;

    const responseSchema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        name:                { type: SchemaType.STRING },
        model_number:        { type: SchemaType.STRING },
        maker:               { type: SchemaType.STRING },
        price:               { type: SchemaType.STRING },
        unique_selling_point:{ type: SchemaType.STRING },
        script:              { type: SchemaType.STRING },
        spec_data: {
          type: SchemaType.OBJECT,
          properties: Object.fromEntries(specKeys.map(k => [k, { type: SchemaType.STRING }])),
        },
        ...(needWizardFromGemini && {
          wizard_specs: {
            type: SchemaType.OBJECT,
            properties: Object.fromEntries(wizardFields.map(f => [f, { type: SchemaType.STRING, nullable: true }])),
          },
          wizard_sources: {
            type: SchemaType.OBJECT,
            properties: Object.fromEntries(wizardFields.map(f => [f, { type: SchemaType.STRING, nullable: true }])),
          },
        }),
        glossary: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              term:        { type: SchemaType.STRING },
              description: { type: SchemaType.STRING },
            },
            required: ['term', 'description'],
          },
        },
      },
      required: [
        'name', 'model_number', 'maker', 'price',
        'unique_selling_point', 'script', 'spec_data', 'glossary',
        ...(needWizardFromGemini ? ['wizard_specs', 'wizard_sources'] : []),
      ],
    };

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', responseSchema },
    });

    // 503 高負荷時は最大3回リトライ
    let result;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (attempt < 3 && msg.includes('503')) {
          await new Promise(r => setTimeout(r, 5000 * attempt));
          continue;
        }
        throw e;
      }
    }
    if (!result) throw new Error('Gemini の呼び出しに失敗しました');
    const parsed = JSON.parse(result.response.text()) as {
      name: string;
      model_number: string;
      maker: string;
      price: string;
      unique_selling_point: string;
      script: string;
      spec_data: Record<string, string>;
      wizard_specs?: Record<string, string | null>;
      wizard_sources?: Record<string, string | null>;
      glossary: { term: string; description: string }[];
    };

    // ── wizard_specs 確定（ルール優先、フォールバックはGemini）────
    const wizardSpecs: Record<string, string | null> = ruleBasedSpecs
      ?? (parsed.wizard_specs ?? Object.fromEntries(wizardFields.map(f => [f, null])));

    // ルールベースの場合はソースをスペックマップの出典URLから構築
    const wizardSources: Record<string, string | null> = ruleBasedSpecs
      ? Object.fromEntries(wizardFields.map(f => {
          const hasValue = ruleBasedSpecs[f] != null;
          const officialUrl = validPages.find(p => !isBlogUrl(p.url))?.url ?? null;
          return [f, hasValue ? officialUrl : null];
        }))
      : (parsed.wizard_sources ?? Object.fromEntries(wizardFields.map(f => [f, null])));

    const price = parsed.price || '';

    // ── メーカー確定（URLドメイン優先）─────────────────────────
    const maker = getMakerFromUrl(urls[0]) || parsed.maker || '';

    // ── glossary 正規化 ────────────────────────────────────────
    const glossary = (parsed.glossary ?? []).map(g => ({ [g.term]: g.description }));

    // ── products テーブルに upsert ─────────────────────────────
    let finalProductId = productId;

    const productRow = {
      category_id:          categoryId,
      source_url:           urls[0] ?? '',
      name:                 modelNumber.replace(/-/g, ''),
      model_number:         modelNumber.replace(/-/g, ''),
      maker,
      price,
      spec_data:            parsed.spec_data ?? {},
      unique_selling_point: parsed.unique_selling_point ?? '',
      script:               parsed.script ?? '',
      glossary,
      image_url:            imageUrl,
    };

    if (isNewProduct || !finalProductId) {
      const { data: inserted } = await supabase
        .from('products')
        .insert(productRow)
        .select('id')
        .single();
      finalProductId = inserted?.id ?? null;
    } else {
      await supabase
        .from('products')
        .update(productRow)
        .eq('id', finalProductId);
    }

    // ── product_specs に upsert ────────────────────────────────
    if (finalProductId) {
      await supabase.from('product_specs').upsert({
        product_id:   finalProductId,
        specs:        wizardSpecs,
        sources:      wizardSources,
        collected_at: new Date().toISOString(),
      });
    }

    // ── 比較情報抽出（ブログがある場合のみ）──────────────────────
    type ComparisonPoint = { field: string; this_value: string; other_value: string };
    type ComparisonRow   = {
      type: string; compared_model: string; compared_maker: string;
      points: ComparisonPoint[]; summary: string; source_url: string | null;
    };
    let comparisons: ComparisonRow[] = [];

    if (blogPages.length > 0 && finalProductId) {
      try {
        const comparePrompt = `
あなたは家電の比較情報抽出アシスタントです。
以下のブログ記事から、型番「${modelNumber}」と他モデルとの比較情報を抽出してください。

【ブログ記事】
${blogPages.map(p => `=== ${p.url} ===\n${p.text}`).join('\n\n')}

【公式スペック（ファクトチェック用）】
${officialPages.map(p => `=== ${p.url} ===\n${p.text.slice(0, 3000)}`).join('\n\n')}

抽出ルール:
- type: 旧モデル・同ブランド比較は "old_model"、他メーカー比較は "competitor"
- points の this_value は ${modelNumber} の値、other_value は比較対象の値
- スペック値が不明な場合は points に含めない
- summary: この比較から接客で伝えるべきポイントを1〜2文で
- source_url: 出典ブログ記事のURL
`.trim();

        const compareSchema: Schema = {
          type: SchemaType.OBJECT,
          properties: {
            comparisons: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  type:           { type: SchemaType.STRING },
                  compared_model: { type: SchemaType.STRING },
                  compared_maker: { type: SchemaType.STRING },
                  points: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        field:       { type: SchemaType.STRING },
                        this_value:  { type: SchemaType.STRING },
                        other_value: { type: SchemaType.STRING },
                      },
                      required: ['field', 'this_value', 'other_value'],
                    },
                  },
                  summary:    { type: SchemaType.STRING },
                  source_url: { type: SchemaType.STRING, nullable: true },
                },
                required: ['type', 'compared_model', 'compared_maker', 'points', 'summary'],
              },
            },
          },
          required: ['comparisons'],
        };

        const compareModel = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { responseMimeType: 'application/json', responseSchema: compareSchema },
        });
        const compareResult = await compareModel.generateContent(comparePrompt);
        const compareData = JSON.parse(compareResult.response.text()) as { comparisons: ComparisonRow[] };
        comparisons = compareData.comparisons ?? [];

        // 既存の比較データを削除して再保存
        await supabase.from('product_comparisons').delete().eq('product_id', finalProductId);
        if (comparisons.length > 0) {
          await supabase.from('product_comparisons').insert(
            comparisons.map(c => ({
              product_id:     finalProductId,
              type:           c.type,
              compared_model: c.compared_model,
              compared_maker: c.compared_maker,
              points:         c.points,
              summary:        c.summary,
              source_url:     c.source_url ?? blogPages[0]?.url ?? null,
            }))
          );
        }
      } catch (e) {
        // 比較抽出失敗は致命的でないためログのみ
        console.error('[analyze] 比較情報の抽出に失敗:', e instanceof Error ? e.message : String(e));
      }
    }

    return NextResponse.json({
      productId: finalProductId,
      productInfo: {
        name:                 productRow.name,
        price,
        unique_selling_point: productRow.unique_selling_point,
        script:               productRow.script,
        image_url:            imageUrl,
      },
      specs:       wizardSpecs,
      sources:     wizardSources,
      comparisons,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[analyze] error:', msg);
    return NextResponse.json({ error: `解析中にエラーが発生しました: ${msg}` }, { status: 500 });
  }
}
