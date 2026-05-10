// ドメイン → 正式メーカー名マッピング
const DOMAIN_MAKER_MAP: Record<string, string> = {
  'panasonic.com':           'パナソニック',
  'panasonic.jp':            'パナソニック',
  'toshiba-lifestyle.com':   '東芝',
  'sharp.co.jp':             'シャープ',
  'jp.sharp':                'シャープ',
  'hitachi.co.jp':           '日立',
  'mitsubishielectric.co.jp':'三菱電機',
  'aqua-has.com':            'AQUA',
  'lg.com':                  'LG',
  'sony.jp':                 'ソニー',
  'iris-ohyama.co.jp':       'アイリスオーヤマ',
  'daikin.co.jp':            'ダイキン',
};

// URLからメーカー名を確定（マッピングにあれば優先、なければ空文字）
export function getMakerFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    for (const [domain, maker] of Object.entries(DOMAIN_MAKER_MAP)) {
      if (hostname.endsWith(domain)) return maker;
    }
  } catch { /* ignore */ }
  return '';
}
