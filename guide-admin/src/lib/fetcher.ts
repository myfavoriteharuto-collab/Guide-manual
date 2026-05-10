import * as cheerio from 'cheerio';

const TIMEOUT_MS = 15_000;

// charset を考慮してレスポンスをデコード（Shift-JIS等の非UTF-8サイト対応）
export async function decodeResponse(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') ?? '';
  const m = contentType.match(/charset=([^\s;]+)/i);
  const charset = (m?.[1] ?? 'utf-8').toLowerCase().replace(/_/g, '-');
  if (charset === 'utf-8') return res.text();
  const buf = await res.arrayBuffer();
  return new TextDecoder(charset).decode(buf);
}

// 日本語カラー名リスト（色展開抽出で使用）
const COLOR_WORDS = [
  'ホワイト', 'ブラック', 'シルバー', 'レッド', 'ピンク', 'ゴールド',
  'ベージュ', 'ブラウン', 'グレー', 'グリーン', 'ブルー', 'パープル',
  'オレンジ', 'グラン', 'パール', 'シャンパン', 'グラファイト', 'クリーム',
  'アイボリー', 'ネイビー', 'スレート', 'ルージュ', 'サテン',
];

// テーブルをパースしてキーバリューマップとして返す（ルールベース抽出に使用）
// スペック表（table）・定義リスト（dl/dt/dd）・カラー選択UIの3種類から情報を取得する
export function extractSpecTableMap(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, aside').remove();
  const map: Record<string, string> = {};

  // 1. <table> の th/td ペアを抽出
  $('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells = $(row).find('th, td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().replace(/\s+/g, ' ').trim();
        const val = $(cells[1]).text().replace(/\s+/g, ' ').trim();
        if (key && val && !map[key]) map[key] = val; // 最初の出現を優先
      }
    });
  });

  // 2. <dl>/<dt>/<dd> リストを抽出（Hitachi等の一部メーカーがこの形式でスペックを記述）
  $('dl').each((_, dl) => {
    $(dl).find('dt').each((_, dt) => {
      const key = $(dt).text().replace(/\s+/g, ' ').trim();
      const val = $(dt).next('dd').text().replace(/\s+/g, ' ').trim();
      if (key && val && !map[key]) map[key] = val;
    });
  });

  // 3. カラー選択UIから色展開を取得
  //    スペック表に「カラー」系キーがない場合のみ実行（テーブルの値を上書きしない）
  const hasColorInMap = ['カラー', '本体カラー', 'カラーバリエーション', '色'].some(k => k in map);
  if (!hasColorInMap) {

    // Strategy A: "color" / "colour" / "カラー" を含むクラス名・IDを持つ要素 = 色選択UI
    const containers = $('[class*="color" i], [id*="color" i], [class*="colour" i], [class*="カラー"]');
    for (const container of containers.toArray()) {
      const colors = new Set<string>();

      // img[alt] から色名を取得
      $(container).find('img[alt]').each((_, img) => {
        const alt = ($(img).attr('alt') ?? '').trim();
        if (alt.length <= 20 && COLOR_WORDS.some(c => alt.includes(c))) colors.add(alt);
      });

      // data-color-name / data-color 属性から取得
      $(container).find('[data-color-name], [data-color], [data-colorname]').each((_, el) => {
        const v = (
          $(el).attr('data-color-name') ||
          $(el).attr('data-color') ||
          $(el).attr('data-colorname') || ''
        ).trim();
        if (v && v.length <= 20 && COLOR_WORDS.some(c => v.includes(c))) colors.add(v);
      });

      // 短いテキストを持つ子要素（li, a, span, button, label）から取得
      $(container).find('li, a, span, button, label').each((_, el) => {
        const text = $(el).clone().children('img, span, i, svg').remove().end()
          .text().replace(/\s+/g, ' ').trim();
        if (text.length > 0 && text.length <= 20 && COLOR_WORDS.some(c => text.includes(c))) {
          colors.add(text);
        }
      });

      if (colors.size >= 2) {
        map['__color_variants'] = [...colors].join('・');
        break;
      }
    }

    // Strategy B: img[alt] のカラーコード + テキストの (X)カラー名 パターン
    // Toshiba等、class名にcolor/colorがないページに対応
    // 例: alt="ER-60B(K)正面カット" → K=ブラック、テキスト "(W)ホワイト" → ホワイト
    if (!('__color_variants' in map)) {
      const COLOR_CODE_MAP: Record<string, string> = {
        'W': 'ホワイト', 'WH': 'ホワイト',
        'K': 'ブラック', 'BK': 'ブラック',
        'R': 'レッド',   'S': 'シルバー',
        'T': 'ブラウン', 'N': 'シャンパン',
        'G': 'グレー',   'P': 'ピンク',
        'C': 'クリーム', 'B': 'ブルー',
        'GW': 'グランホワイト', 'GK': 'グランブラック',
      };
      const detected = new Set<string>();

      // img[alt] からモデル番号に付随するカラーコードを抽出
      // 例: "ER-60B(K)正面カット" → "(K)" → ブラック
      $('img[alt]').each((_, img) => {
        const alt = $(img).attr('alt') ?? '';
        for (const [, code] of alt.matchAll(/\(([A-Z]{1,2})\)/g)) {
          const colorName = COLOR_CODE_MAP[code];
          if (colorName) detected.add(colorName);
        }
      });

      // リンク・リスト要素から "(X)カラー名" パターンを抽出
      // 例: "(W)ホワイト", "(K)ブラック"
      $('a, li').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        const m = text.match(/^\([A-Z]{1,2}\)\s*(.{1,15})$/);
        if (m && COLOR_WORDS.some(c => m[1].includes(c))) {
          detected.add(m[1].trim());
        }
      });

      if (detected.size >= 2) {
        map['__color_variants'] = [...detected].join('・');
      }
    }
  }

  return map;
}

export function extractFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, aside').remove();

  // テーブルを「キー: 値」形式に変換（Geminiが解析しやすい構造化テキストにする）
  const seenRows = new Set<string>();
  const tableLines: string[] = [];
  $('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells = $(row).find('th, td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().replace(/\s+/g, ' ').trim();
        const val = $(cells[1]).text().replace(/\s+/g, ' ').trim();
        if (key && val) {
          const line = `${key}: ${val}`;
          if (!seenRows.has(line)) {
            seenRows.add(line);
            tableLines.push(line);
          }
        }
      }
    });
  });

  const body =
    $('main, article, [class*="spec"], [id*="spec"]').text() ||
    $('body').text();

  // テーブルが取れた場合はそちらを優先、なければ本文
  const content = tableLines.length > 0
    ? tableLines.join('\n') + '\n\n' + body.replace(/\s+/g, ' ').trim()
    : body.replace(/\s+/g, ' ').trim();

  return content.slice(0, 30_000);
}

export async function fetchAndExtract(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpecBot/1.0)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/pdf')) {
    return `[PDF] ${url} - PDF形式のため自動抽出できません`;
  }

  const html = await decodeResponse(res);
  return extractFromHtml(html);
}
