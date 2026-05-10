import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { scoringRulesByCategory } from '@/lib/scoring-rules';

// 自動生成
export async function POST(req: NextRequest) {
  const { productId, categoryName } = await req.json() as {
    productId: string;
    categoryName: string;
  };

  const { data: spec } = await supabase
    .from('product_specs')
    .select('specs')
    .eq('product_id', productId)
    .single();

  if (!spec) {
    return NextResponse.json(
      { error: 'スペックデータがありません。先に「解析」を実行してください。' },
      { status: 404 }
    );
  }

  const rules = scoringRulesByCategory[categoryName];
  if (!rules) {
    return NextResponse.json(
      { error: `カテゴリ「${categoryName}」のスコアリングルールがありません` },
      { status: 400 }
    );
  }

  const rows = Object.entries(rules).map(([keyword, rule]) => {
    const { score, reason } = rule(spec.specs as Record<string, string | null>);
    return { product_id: productId, keyword, score, reason, auto_generated: true };
  });

  await supabase
    .from('wizard_scores')
    .upsert(rows, { onConflict: 'product_id,keyword' });

  return NextResponse.json({ rows });
}

// 手動編集後の保存
export async function PUT(req: NextRequest) {
  const { productId, rows } = await req.json() as {
    productId: string;
    rows: { keyword: string; score: number; reason: string }[];
  };

  // スコア5は1商品につき1つまで
  const fiveCount = rows.filter(r => r.score === 5).length;
  if (fiveCount > 1) {
    return NextResponse.json(
      { error: `スコア5（推し機能）は1商品につき1つだけ設定できます（現在${fiveCount}個）` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('wizard_scores')
    .upsert(
      rows.map(r => ({
        product_id:     productId,
        keyword:        r.keyword,
        score:          r.score,
        reason:         r.reason,
        auto_generated: false,
      })),
      { onConflict: 'product_id,keyword' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
