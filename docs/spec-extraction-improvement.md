# スペック抽出精度改善 — 実装記録

## 背景と課題

ウィザード作成に必要な wizard_specs（オーブン最高温度・最大出力・スチーム機能など）が
Gemini による抽出では null や誤値を頻発しており、スコアリングが正しく動作しなかった。

主な症状：
- `オーブン最高温度: null`（公式ページに値があるのに取得できない）
- `インバーター機能: 搭載`（実際は非搭載のヘルシオに誤って hallucination）
- `グリル方式: null`（加熱方式の記述から読み取れていない）

根本原因は「Gemini にフィールドのマッピング（ラベル変換）と値の解釈を同時にやらせていた」こと。
`オーブン温度調節範囲: 65～250・300℃` → `オーブン最高温度: 300℃` のような変換は LLM には不安定。

---

## 改善方針

**役割を分離する**

| 処理 | 担当 |
|---|---|
| wizard_specs の抽出（数値・フラグ） | ルールベース（コード） |
| 接客トーク・売りポイントの生成 | Gemini |
| 用語解説・商品名の取得 | Gemini |

---

## 変更ファイル一覧

### 新規作成

#### `src/lib/spec-extraction-rules.ts`
カテゴリ別のルールベース抽出関数。HTML のスペックテーブルを
`Record<string, string>` として受け取り、wizard_specs を確定的に返す。

```
電子レンジ・オーブンレンジ の抽出ルール：

庫内容量        : 「総庫内容量」等のキーから数値+L を取得
オーブン最高温度 : 「オーブン温度調節範囲」の値から℃の最大値を取得
                  例: "65～250・300℃" → "300℃"
最大出力        : 「レンジ出力」の先頭W値を取得
                  例: "1000W・600W・500W" → "1000W"
センサーの種類   : 「搭載センサー」の値をそのまま使用
スチーム機能    : 加熱方式に「過熱水蒸気」「スチーム」が含まれれば「あり」
スチーム発生方式 : 加熱方式から「過熱水蒸気〜」を正規表現で抽出
グリル方式      : 専用キーがなければ加熱方式から「〜コンベクション」を抽出
テーブルタイプ   : 「フラット」「ターンテーブル」を検索して分類
種類           : スチーム有 → スチームオーブンレンジ / 温度有 → オーブンレンジ / その他 → 単機能
色展開         : 「カラー」「本体カラー」等から取得
```

新カテゴリ追加時は `EXTRACTION_RULES_BY_CATEGORY` に関数を登録するだけ。

---

### 変更: `src/lib/fetcher.ts`

`extractSpecTableMap(html)` を追加。
HTML のスペックテーブルを `{ "オーブン温度調節範囲": "65～250・300℃" }` 形式の
辞書オブジェクトとして返す。ルールベース抽出の入力として使用。

```typescript
// 追加関数
export function extractSpecTableMap(html: string): Record<string, string>
```

既存の `extractFromHtml`（Gemini 向けテキスト生成）はそのまま維持。

---

### 変更: `src/app/api/spec-search/analyze/route.ts`

1. **ルールベース抽出を優先**
   各 URL のフェッチ時に `extractSpecTableMap` も実行し、複数ページのマップを統合。
   カテゴリに対応するルールがあれば wizard_specs はルールで確定する。

2. **Gemini スキーマを簡素化**
   ルールベースが使えるカテゴリでは wizard_specs/wizard_sources を
   Gemini のレスポンススキーマから除外（出力トークン削減・hallucination 排除）。

3. **Sharp の `/spec/` サブページを自動追加**
   `jp.sharp` ドメインの `/products/[model]/` URL を検出したとき、
   `/products/[model]/spec/` を解析対象に自動追加。

4. **OGP 画像取得の修正**
   ブログが先頭に来た場合に画像が取れなくなるバグを修正。
   `if (firstHtml === '' && !isBlogUrl(url))` で条件判定。

---

### 変更: `src/lib/google-cse.ts`

- `searchProductUrls` の検索クエリに `仕様` を追加（スペックページが上位に来やすくなる）
- `searchBlogUrls` を新規追加（設定したブログドメイン内を型番で検索）

---

### 変更: `src/app/api/spec-search/discover/route.ts`

- URL候補に `kind: 'official' | 'comparison' | 'other'` フラグを追加
- `getMakerFromUrl` でメーカー公式ドメインを判定し kind を自動分類
- ブログ記事 = `comparison`（デフォルト選択）
- メーカー公式 = `official`（デフォルト選択）
- YouTube 等 = `other`（デフォルト未選択）

---

### 変更: `src/app/spec-search/page.tsx`

URL選択UIを3セクションに分離：

```
公式サイト     ← スペック抽出に使用。デフォルト選択
比較情報       ← 接客トーク・他社比較生成に使用。デフォルト選択
その他         ← YouTube等。デフォルト未選択
```

---

### 変更: `src/lib/allowedDomains.ts`

`jp.sharp`（シャープのブランドTLDドメイン）をメーカー公式として追加。

---

### 変更: `src/lib/scoring-rules.ts`

- `インバーター機能` を `SPEC_FIELDS_BY_CATEGORY` から削除
- `インバーター（ムラなく温め）` スコアリングルールを削除

---

## Gemini の利用範囲（改善後）

Gemini が担当するのは以下のみ：

| フィールド | 内容 |
|---|---|
| name | 商品名 |
| maker | メーカー名 |
| price | 価格 |
| unique_selling_point | 売りポイント |
| script | 接客トーク |
| spec_data | DB保存用の生スペック |
| glossary | 用語解説 |

wizard_specs はコードで確定的に抽出するため hallucination が起きない。

---

## 今後の課題（第二・第三段階）

- **第二段階**: ブログの比較・新旧比較を構造化して出力
- **第三段階**: ご案内例の特長を箇条書き形式で出力
