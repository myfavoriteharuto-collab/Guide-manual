// ============================================================
// スコアリングルール
//
// - keyword は diagnosis_flows の option.label と完全一致させること
// - カテゴリキーは categories テーブルの name と一致させること
// - スコア: 1=非搭載, 2=エントリー程度, 3=搭載, 4=高精度搭載
//   ※ スコア5（推し機能）は手動で設定。自動生成では付与しない
// ============================================================

type Specs = Record<string, string | null>;
type RuleResult = { score: number; reason: string };
export type RuleSet = Record<string, (specs: Specs) => RuleResult>;

// ── レンジ ──────────────────────────────────────────────────
const microwaveRules: RuleSet = {
  '温め・解凍だけできれば十分': (s) => {
    const hasOven  = s['オーブン最高温度'] && s['オーブン最高温度'] !== 'なし';
    const hasGrill = s['グリル方式']       && s['グリル方式']       !== 'なし';
    if (!hasOven && !hasGrill) return { score: 4, reason: '単機能レンジなのでシンプルに使えます' };
    if (!hasOven)              return { score: 3, reason: 'オーブン非搭載でコンパクトです' };
    return { score: 2, reason: 'オーブン・グリル付きの多機能モデルです' };
  },
  'グリルやオーブン料理もしたい': (s) => {
    const temp = parseInt(s['オーブン最高温度']?.replace(/\D/g, '') ?? '0');
    if (temp >= 250) return { score: 4, reason: `${temp}℃まで対応しており本格調理が楽しめます` };
    if (temp >= 200) return { score: 3, reason: `${temp}℃まで対応しています` };
    if (temp > 0)   return { score: 2, reason: `${temp}℃の簡易オーブンです` };
    return { score: 1, reason: 'オーブン非搭載です' };
  },
  '1〜2人': (s) => {
    const cap = parseInt(s['庫内容量']?.replace(/\D/g, '') ?? '0');
    if (cap === 0)  return { score: 1, reason: '容量情報がありません' };
    if (cap <= 22)  return { score: 4, reason: `${cap}Lのコンパクトサイズです` };
    if (cap <= 26)  return { score: 3, reason: `${cap}Lでやや大きめです` };
    return { score: 2, reason: `${cap}Lの大型モデルです` };
  },
  '3〜4人': (s) => {
    const cap = parseInt(s['庫内容量']?.replace(/\D/g, '') ?? '0');
    if (cap === 0)  return { score: 1, reason: '容量情報がありません' };
    if (cap >= 27)  return { score: 4, reason: `${cap}Lの大容量で家族にぴったりです` };
    if (cap >= 24)  return { score: 3, reason: `${cap}Lで標準的なサイズです` };
    return { score: 2, reason: `${cap}Lでやや小さめです` };
  },
  'スチーム・ヘルシー調理': (s) => {
    const steam = s['スチーム機能'];
    if (!steam || steam === 'なし') return { score: 1, reason: 'スチーム機能非搭載です' };
    return { score: 4, reason: `${steam}でヘルシー調理が可能です` };
  },
};

// ============================================================
// カテゴリ別エクスポート（キーは categories.name と一致させること）
// ============================================================

export const SPEC_FIELDS_BY_CATEGORY: Record<string, string[]> = {
  '電子レンジ・オーブンレンジ': [
    '色展開', '種類', 'センサーの種類', '最大出力',
    '庫内容量', 'オーブン最高温度', 'グリル方式',
    'スチーム機能', 'スチーム発生方式',
  ],
};

export const scoringRulesByCategory: Record<string, RuleSet> = {
  '電子レンジ・オーブンレンジ': microwaveRules,
};
