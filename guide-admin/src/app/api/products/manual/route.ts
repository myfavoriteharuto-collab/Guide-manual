import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  // Authorizationヘッダーからトークンを取得して認証チェック
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  try {
    const {
      productId,
      categoryId,
      modelNumber,
      name,
      maker,
      price,
      image_url,
      unique_selling_point,
      script,
      spec_data,
    } = await req.json();

    const normModelNumber = (modelNumber as string).replace(/-/g, '');
    const normName        = (name        as string).replace(/-/g, '');

    let pid = productId as string | null;

    if (pid) {
      const { error } = await supabase.from('products').update({
        name: normName, maker, price, image_url,
        unique_selling_point, script, spec_data: spec_data ?? {},
      }).eq('id', pid);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('products').insert({
        category_id: categoryId,
        model_number: normModelNumber,
        name: normName,
        maker, price, image_url,
        unique_selling_point, script,
        spec_data: spec_data ?? {},
        glossary: [],
      }).select('id').single();
      if (error) throw error;
      pid = data.id;
    }

    // product_specs を空で upsert してスコア自動生成が動けるようにする
    await supabase.from('product_specs').upsert(
      { product_id: pid, specs: {}, sources: {}, collected_at: new Date().toISOString() },
      { onConflict: 'product_id' },
    );

    return NextResponse.json({ productId: pid });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
