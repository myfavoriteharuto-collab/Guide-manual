const BLOG_DOMAIN = process.env.NEXT_PUBLIC_BLOG_DOMAIN ?? '';

// ブログ内を型番で検索
// ハイフンあり/なし両方で検索し重複を除去（記事内の表記ゆれに対応）
export async function searchBlogUrls(
  modelNumber: string,
  maxResults = 3,
): Promise<{ url: string; title: string; snippet: string }[]> {
  const queries = [modelNumber.trim()];
  const withoutHyphen = modelNumber.replace(/-/g, '').trim();
  if (withoutHyphen !== queries[0]) queries.push(withoutHyphen);

  const seen = new Set<string>();
  const results: { url: string; title: string; snippet: string }[] = [];

  for (const q of queries) {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY':    process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: `site:${BLOG_DOMAIN} ${q}`, num: Math.min(maxResults, 10), gl: 'jp', hl: 'ja' }),
    });
    if (!res.ok) continue;

    const data = await res.json();
    for (const item of (data.organic ?? []) as { link: string; title: string; snippet?: string }[]) {
      if (!item.link.includes(BLOG_DOMAIN) || seen.has(item.link)) continue;
      seen.add(item.link);
      results.push({ url: item.link, title: `[ブログ] ${item.title}`, snippet: item.snippet ?? '' });
    }
    if (results.length >= maxResults) break;
  }

  return results.slice(0, maxResults);
}

export async function searchProductUrls(
  maker: string,
  modelNumber: string,
  maxResults = 10,
  blockedDomains: string[] = []
): Promise<{ url: string; title: string; snippet: string }[]> {
  const query = `${maker} ${modelNumber} 仕様`;

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY':    process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: Math.min(maxResults, 10), gl: 'jp', hl: 'ja' }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Serper API error: ${res.status} - ${JSON.stringify(body)}`);
  }

  const data = await res.json();

  const results: { url: string; title: string; snippet: string }[] =
    (data.organic ?? []).map((item: { link: string; title: string; snippet?: string }) => ({
      url:     item.link,
      title:   item.title,
      snippet: item.snippet ?? '',
    }));

  if (blockedDomains.length === 0) return results;

  return results.filter(r => {
    try {
      const hostname = new URL(r.url).hostname;
      return !blockedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
    } catch {
      return true;
    }
  });
}
