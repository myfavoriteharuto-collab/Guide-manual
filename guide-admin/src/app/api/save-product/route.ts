import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ProductData } from '@/types/product';

export async function POST(req: NextRequest) {
  const body = await req.json() as ProductData & {
    category_id: string;
    source_url: string;
    jan_code?: string;
  };

  const { category_id, source_url, jan_code, ...productData } = body;

  if (!category_id || !productData.name) {
    return NextResponse.json({ error: 'category_id と name は必須です' }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from('products')
    .insert({
      category_id,
      source_url,
      jan_code: jan_code ?? null,
      name: productData.name,
      model_number: productData.model_number,
      maker: productData.maker,
      price: productData.price,
      spec_data: productData.spec_data,
      unique_selling_point: productData.unique_selling_point,
      script: productData.script,
      glossary: productData.glossary,
      image_url: productData.image_url ?? '',
    })
    .select('id')
    .single();

  if (error || !inserted) {
    console.error('Supabase insert error:', error);
    return NextResponse.json({ error: 'DB保存に失敗しました: ' + (error?.message ?? '不明なエラー') }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: inserted.id });
}
