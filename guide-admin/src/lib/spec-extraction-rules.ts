// ============================================================
// カテゴリ別ルールベーススペック抽出
//
// HTMLのスペックテーブルを key:value マップとして受け取り、
// wizard_specs フィールドを確定的に抽出する。
// LLMを使わないため hallucination がなく、精度が高い。
// ============================================================

type SpecMap = Record<string, string>;
export type WizardSpecs = Record<string, string | null>;

// ※1 ※2 などの脚注記号を除去
function clean(v: string): string {
  return v.replace(/※\d+/g, '').trim();
}

// キーに指定パターンが含まれるエントリの値を返す（最初にマッチしたもの）
function findVal(map: SpecMap, ...patterns: string[]): string | null {
  for (const pattern of patterns) {
    const entry = Object.entries(map).find(([k]) => k.includes(pattern));
    if (entry) return clean(entry[1]);
  }
  return null;
}

// ── 電子レンジ・オーブンレンジ ──────────────────────────────────

function extractMicrowaveSpecs(map: SpecMap): WizardSpecs {
  // 庫内容量: "30L（2段調理）" → "30L"
  const capRaw = findVal(map, '総庫内容量', '庫内容量', '庫内有効');
  const capMatch = capRaw?.match(/(\d+)\s*L/);
  const capacity = capMatch ? `${capMatch[1]}L` : null;

  // オーブン最高温度: "65～250・300℃" → "300℃"（最大値を取得）
  const tempRaw = findVal(map, 'オーブン温度調節範囲', 'オーブン最高温度');
  const temps = tempRaw
    ? [...tempRaw.matchAll(/(\d{2,3})℃/g)].map(m => parseInt(m[1]))
    : [];
  const maxTemp = temps.length > 0 ? `${Math.max(...temps)}℃` : null;

  // 最大出力: "1000W・600W・500W..." → "1000W"（先頭の値）
  const powerRaw = findVal(map, 'レンジ出力', '最大出力', '電子レンジ出力');
  const powerMatch = powerRaw?.match(/(\d{3,4})\s*W/);
  const maxPower = powerMatch ? `${powerMatch[1]}W` : null;

  // センサーの種類
  const sensor = findVal(map, '搭載センサー', 'センサー');

  // 加熱方式（スチーム・グリル・インバーター判定の基礎）
  const heatingRaw = findVal(map, 'オーブン・グリル加熱方式', '加熱方式', '調理方式');

  // スチーム機能: 加熱方式に過熱水蒸気/スチーム/ウォーターが含まれるか
  const hasSteam = !!(
    heatingRaw?.includes('スチーム') ||
    heatingRaw?.includes('過熱水蒸気') ||
    heatingRaw?.includes('ウォーター')
  );
  const steamFeature = heatingRaw ? (hasSteam ? 'あり' : 'なし') : null;

  // スチーム発生方式: "過熱水蒸気（ヘルシオエンジン）" などを抽出
  const steamMethodRaw = findVal(map, 'スチーム発生方式');
  const steamMethod = steamMethodRaw ?? (hasSteam
    ? (heatingRaw?.match(/過熱水蒸気[^、,\s]*/)?.[0] ?? 'スチーム')
    : null);

  // グリル方式: 専用キーがなければ加熱方式からコンベクション/石窯を抽出
  const grillRaw = findVal(map, 'グリル方式', 'グリル加熱方式', 'グリル');
  const convectionMatch = heatingRaw?.match(/[\w]+コンベクション/);
  const grill = grillRaw
    ?? (convectionMatch?.[0] ?? null)
    ?? (maxTemp ? 'ヒーター式' : null);

  // 種類: スチームオーブン > オーブン > 単機能
  const kind = hasSteam
    ? 'スチームオーブンレンジ'
    : maxTemp
    ? 'オーブンレンジ'
    : maxPower
    ? '電子レンジ（単機能）'
    : null;

  // 色展開（スペック表→定義リスト→カラー選択UIの順でフォールバック）
  const color = findVal(map, 'カラー', '本体カラー', 'カラーバリエーション', '色', '__color_variants');

  return {
    '色展開':       color,
    '種類':         kind,
    'センサーの種類': sensor,
    '最大出力':     maxPower,
    '庫内容量':     capacity,
    'オーブン最高温度': maxTemp,
    'グリル方式':   grill,
    'スチーム機能': steamFeature,
    'スチーム発生方式': steamMethod,
  };
}

// ── カテゴリ別ルールマップ ────────────────────────────────────────
// キーは categories テーブルの name と一致させること
export const EXTRACTION_RULES_BY_CATEGORY: Record<string, (map: SpecMap) => WizardSpecs> = {
  '電子レンジ・オーブンレンジ': extractMicrowaveSpecs,
};
