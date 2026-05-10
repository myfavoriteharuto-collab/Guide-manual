import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import { getMakerFromUrl } from '@/lib/allowedDomains';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/types/product';

function extractImageUrl(html: string): string {
  const patterns = [
    /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m?.[1] && m[1].startsWith('http')) return m[1];
  }
  return '';
}

export async function POST(req: NextRequest) {
  const { url, category_id } = await req.json();

  if (!url || !category_id) {
    return NextResponse.json({ error: 'url と category_id は必須です' }, { status: 400 });
  }

  // Supabaseからカテゴリ情報を取得
  const { data: categoryData, error: categoryError } = await supabase
    .from('categories')
    .select('id, name, spec_keys, script_hint')
    .eq('id', category_id)
    .single();

  if (categoryError || !categoryData) {
    return NextResponse.json({ error: 'カテゴリが見つかりません' }, { status: 404 });
  }

  const category = categoryData as Category;

  // URLからHTMLを取得
  let htmlText: string;
  let imageUrl = '';
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuideApp/1.0)' },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `URLの取得に失敗しました: ${response.status}` }, { status: 502 });
    }
    const html = await response.text();

    // タグ除去前に og:image / twitter:image を抽出
    imageUrl = extractImageUrl(html);

    htmlText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 20000);
  } catch {
    return NextResponse.json({ error: 'URLへのアクセスに失敗しました' }, { status: 502 });
  }

  // Geminiプロンプト構築
  const specKeysInstruction = category.spec_keys.length > 0
    ? `以下のスペック項目を必ず spec_data に含めてください：${category.spec_keys.join('、')}`
    : '';
  const scriptHintInstruction = category.script_hint
    ? `接客トーク(script)は次の方針で作成してください：${category.script_hint}`
    : '';

  const prompt = `
以下は家電製品のWebページのテキストです。
指定カテゴリ: ${category.name}

商品情報をJSONで抽出してください。

${specKeysInstruction}
${scriptHintInstruction}
型番(model_number)は必ず抽出してください。型番が見つからない場合は空文字にしてください。
price は文字列で返してください（例: "¥89,800"）。
glossary は技術用語と分かりやすい説明のペアを配列で返してください。
category_match は、この商品が指定カテゴリ「${category.name}」に該当する場合 true、異なるカテゴリの商品である場合 false を返してください。

ページテキスト:
${htmlText}
`.trim();

  const responseSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      name: { type: SchemaType.STRING },
      model_number: { type: SchemaType.STRING },
      maker: { type: SchemaType.STRING },
      price: { type: SchemaType.STRING },
      spec_data: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          category.spec_keys.map(key => [key, { type: SchemaType.STRING }])
        ),
      },
      unique_selling_point: { type: SchemaType.STRING },
      script: { type: SchemaType.STRING },
      glossary: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            term: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
          },
          required: ['term', 'description'],
        },
      },
      category_match: { type: SchemaType.BOOLEAN },
    },
    required: ['name', 'model_number', 'maker', 'price', 'spec_data', 'unique_selling_point', 'script', 'glossary', 'category_match'],
  };

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    const result = await model.generateContent(prompt);
    const rawJson = result.response.text();
    const parsed = JSON.parse(rawJson) as {
      category_match: boolean;
      glossary: { term: string; description: string }[];
      [key: string]: unknown;
    };

    const { category_match, glossary, ...productFields } = parsed;

    // ハイフン付き型番（製品名に付加用）・ハイフンなし型番（model_numberに保存用）
    const modelNumberWithHyphen = (productFields.model_number as string) ?? '';
    const modelNumberNoHyphen   = modelNumberWithHyphen.replace(/-/g, '');

    // 製品名にハイフン付き型番を付加（すでに含まれている場合は付加しない）
    const baseName = (productFields.name as string) ?? '';
    const name = modelNumberWithHyphen && !baseName.includes(modelNumberWithHyphen)
      ? `${baseName} ${modelNumberWithHyphen}`
      : baseName;

    // ドメインからメーカー名を確定（DB設定 > 静的マップ > AI出力の順で優先）
    const maker = getMakerFromUrl(url) || (productFields.maker as string) || '';

    const price = (productFields.price as string) || '';

    const normalizedGlossary = glossary.map(
      item => ({ [item.term]: item.description })
    );

    return NextResponse.json({
      data: {
        ...productFields,
        name,
        model_number: modelNumberNoHyphen,
        maker,
        price,
        glossary: normalizedGlossary,
        image_url: imageUrl,
      },
      categoryMatch: category_match,
    });
  } catch (err) {
    console.error('Gemini API error:', err);
    return NextResponse.json({ error: 'AI解析に失敗しました' }, { status: 500 });
  }
}
