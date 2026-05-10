// localStorage ユーティリティ（お気に入り・比較候補の永続化）

export function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('guide_favorites') ?? '[]'); }
  catch { return []; }
}

export function toggleFavorite(productId: string): boolean {
  const favs = getFavorites();
  const idx = favs.indexOf(productId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(productId);
  localStorage.setItem('guide_favorites', JSON.stringify(favs));
  return idx < 0; // true = 追加された
}

export function isFavorite(productId: string): boolean {
  return getFavorites().includes(productId);
}

// 比較候補（カテゴリ別）
export function getSavedCompare(categoryId: string): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(`guide_cmp_${categoryId}`) ?? '[]'); }
  catch { return []; }
}

export function setSavedCompare(categoryId: string, ids: string[]): void {
  if (ids.length === 0) localStorage.removeItem(`guide_cmp_${categoryId}`);
  else localStorage.setItem(`guide_cmp_${categoryId}`, JSON.stringify(ids));
}
