# 管理者アプリ (guide-admin) 開発ログ

## アプリ概要

商品紹介アプリ（guide-app）に商品知識を登録するための**管理者専用ツール**。
メーカー公式URL・JANコード・型番から商品情報をAI自動解析し、Supabase DBに登録できる。

- **フォルダ**: `guide-admin/`
- **技術スタック**: Next.js / TypeScript / Tailwind CSS v4 / Supabase / Gemini AI / Google Custom Search
- **起動**: `cd guide-admin && npm install && npm run dev` → http://localhost:3001
- **使用AI**: Gemini 2.5 Flash（Google AI）

---

## クイックスタート

### 必要な環境

- Node.js 18 以上
- npm
- Supabase プロジェクト（初回のみ DB テーブルの作成が必要。下部「Supabase テーブル構成」を参照）

### セットアップ

```bash
cd guide-admin
npm install
```

`.env.local` をプロジェクトルートに作成して以下を記入：

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
GOOGLE_CUSTOM_SEARCH_API_KEY=...
GOOGLE_CUSTOM_SEARCH_CX=...
```

### 起動

```bash
npm run dev
```

→ http://localhost:3001 で起動します。
初回は `/login` からメールアドレスとパスワードでサインインしてください。

---

## 機能の使い方

### 商品登録（`/spec-search`）

右上のモードボタンで3種類の登録方法を切り替えられます。

| モード | 使いどき |
|--------|---------|
| **新規登録** | 未登録の商品をAIで解析して初めて登録する |
| **バッチ登録** | 複数商品のURLをまとめて貼り付けて順次AI登録する |
| **手動登録** | AIなしで商品情報をフォームに直接入力して登録する |

> **登録済み商品を再解析したい場合：** 新規登録モードで同じ型番を入力すると、既存商品が見つかったことを伝える警告モーダルが表示されます。「上書きして再解析」ボタンをクリックすると既存データを上書きして解析を続行できます。

#### 新規登録の流れ

1. カテゴリを選択し型番を入力 →「URL候補を探す」
2. **公式サイト / 比較情報 / その他** の3セクションに分類されたURL候補が表示される
   - 公式サイト・比較情報はデフォルトでチェックあり（変更可）
3. 解析に使うURLを確認して「解析」（Gemini AIが1〜2分で解析）
4. 解析結果を確認。価格欄は「タップして金額を入力」で手動入力
5. ウィザードスコアを確認・編集して「保存」→ 完了

#### 手動登録の流れ

1. カテゴリを選択し型番を入力 →「商品情報を入力」
2. 商品名・メーカー・価格・画像URL・売りポイント・接客トーク・スペックを入力
3.「保存してスコア編集へ」→ スコアを確認・編集して「保存」→ 完了

> 既登録の型番を手動登録モードで入力すると、既存データがフォームに自動表示されます（上書き更新）。

### 商品一覧（`/products`）

| 操作 | 方法 |
|------|------|
| 絞り込み | カテゴリ選択 or テキスト入力で絞り込み |
| 並び順変更 | 「並び順を変更」ボタン → ↑↓ ボタンで移動 →「保存」 |
| 一括削除 | 左のチェックボックスで複数選択 →「削除」 |
| CSVダウンロード | 「CSVダウンロード」ボタン（現在の絞り込み条件が反映される） |

バッジの見方：
- **スコアあり**（青）: ウィザードスコアが登録済み
- **未入力スコアあり**（オレンジ）: スコアの理由（reason）が未記入の項目がある
- **要更新 X項目**（黄）: カテゴリのスペック項目が未入力

### 商品編集（`/products/[id]`）

- 基本情報（名前・型番・メーカー・価格・画像など）の編集
- スペック・接客トーク・用語解説の編集
- **ホットスポット設定**: 商品画像をクリックしてタップポイントを配置。ラベル・説明・キラーフレーズを設定するとスタッフアプリの「解説」ボタンに反映される
- **ウィザードスコア編集**: キーワードごとのスコア（1=非搭載 〜 5=★推し）と理由を設定

> スコア5（★推し）は1商品につき1つだけ設定できます。

### カテゴリ管理（`/categories`）

- カテゴリの追加・編集・削除
- **スペック項目（spec_keys）**: 商品登録時にAIが抽出する項目を定義。カンマ区切りで入力
- **ウィザードボタン**: そのカテゴリのQ&Aフロー（ステップ・選択肢・キーワード）を編集
- **非表示トグル**: ONにするとスタッフアプリのカテゴリ一覧から非表示になる

### 設定（`/settings`）

- **ブロックドメイン**: AI検索時に除外するドメインを登録。不要なサイトが検索結果に頻出する場合に追加する

---

## バージョン履歴

---

### Ver1.33.0 — 2026-05-05

**ステータス**: 実装完了

#### 変更内容

| 機能 | 詳細 |
|------|------|
| 再解析ボタン廃止・警告モーダルに統合 | ヘッダーの「再解析」トグルを削除。新規登録で同型番を入力すると警告モーダルを表示し、「上書きして再解析」ボタンで継続できるよう変更 |
| 価格入力を手動方式に変更 | Step3の価格欄を「タップして金額を入力」に統一。AI取得値は初期値として表示されるが、スタッフが手動で確認・更新する運用に変更 |
| URLセクション分類 | URL候補を「公式サイト / 比較情報 / その他」の3セクションに分類。公式・比較はデフォルトチェック済、その他（YouTubeなど）はデフォルト未選択 |
| 比較データ抽出（第二段階） | 比較情報URLが選択された場合、Geminiが旧モデル比較・競合比較データを抽出して `product_comparisons` テーブルに保存。Step3に比較表とサマリーを表示 |
| ルールベーススペック抽出 | `spec-extraction-rules.ts` を追加。カテゴリ別の確定的ルールで wizard_specs を抽出（現在：電子レンジ・オーブンレンジ対応）。LLM使用による hallucination を排除 |
| jp.sharp ドメイン追加 | `allowedDomains.ts` にシャープの公式ドメイン `jp.sharp` を追加 |
| インバーター機能・テーブルタイプ削除 | 電子レンジカテゴリのウィザードスペック項目から「インバーター機能」「テーブルタイプ」を削除 |
| インフォメーション追加 | admin/app 双方に比較データの精度注意・ウィザードスペックの取得方法を説明するインフォバナーを設置 |

#### 新規ファイル

| ファイル | 内容 |
|----------|------|
| `src/lib/spec-extraction-rules.ts` | カテゴリ別ルールベーススペック抽出。電子レンジ: 色展開・種類・センサー・最大出力・庫内容量・オーブン最高温度・グリル方式・スチーム機能・スチーム発生方式 |

#### DB変更

```sql
-- 比較データ保存テーブル
CREATE TABLE IF NOT EXISTS product_comparisons (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id    uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  type          text NOT NULL CHECK (type IN ('old_model', 'competitor')),
  compared_model  text NOT NULL DEFAULT '',
  compared_maker  text NOT NULL DEFAULT '',
  points        jsonb NOT NULL DEFAULT '[]',
  summary       text NOT NULL DEFAULT '',
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE product_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all" ON product_comparisons FOR ALL TO anon USING (true) WITH CHECK (true);
```

---

### Ver1.32.0 — 2026-04-18

**ステータス**: 実装完了

#### 変更内容

| 機能 | 詳細 |
|------|------|
| 手動登録モード | AI解析なしで商品情報を直接入力して登録できる「手動登録」ボタンを追加。カテゴリ選択・型番入力 → フォーム入力（名前・メーカー・価格・画像URL・売りポイント・接客トーク・スペック）→ スコア編集 → 完了の3ステップ構成 |
| 手動登録：既存商品対応 | 既登録の型番を入力した場合、既存データをフォームに自動流し込みして上書き編集が可能 |
| 手動登録API | `POST /api/products/manual` — productsテーブルへの直接upsert（ハイフン除去・空のproduct_specs作成含む） |

---

### Ver1.31.0 — 2026-04-17

**ステータス**: 実装完了

#### 変更内容

| 機能 | 詳細 |
|------|------|
| バッチ登録機能 | 複数のURLを貼り付けて順次AI解析・保存できるキュー型UIを追加 |
| カテゴリ非表示フラグ | カテゴリ一覧にトグルスイッチを追加。ONにするとappのカテゴリ一覧から非表示 |
| スペック非表示機能 | 商品編集画面でスペック項目を個別に非表示設定できる機能を追加。非表示項目はウィザードバッジに含まれず、編集画面から復元可能 |
| 使い方ガイド | `docs/guide-admin-guide.md` としてadmin操作マニュアルを作成 |

---

### Ver1.30.0 — 2026-04-13

**ステータス**: 実装完了

#### 変更内容

| 機能 | 詳細 |
|------|------|
| ナビ整理 | 「商品登録」「一括登録」を削除。「スペック収集」→「商品登録」に改名し商品一覧の左隣へ移動。ダッシュボードをユーザー管理の左隣へ移動 |
| ルートリダイレクト | `/` → `/dashboard` へリダイレクト。`/bulk` ページを削除 |
| 商品一覧：スコアバッジ | ウィザードスコア登録済みの商品に「スコアあり」バッジを表示 |
| 商品一覧：未入力バッジ | スコアの reason が空の商品に「未入力スコアあり」（オレンジ）バッジを表示 |
| 商品一覧：一括削除 | チェックボックスで複数商品を選択して一括削除 |
| 商品一覧：登録ボタンリンク修正 | 「+商品を登録」が `/spec-search` へ正しく遷移するよう修正 |
| 商品登録：再解析モード | 新規登録 / 再解析 のトグルを追加。再解析モードでは確認ポップアップをスキップ |
| 商品登録：カテゴリ記憶 | 前回登録したカテゴリを `localStorage` で記憶し自動選択 |
| 商品登録：新規登録フロー | 新規登録モードではステップ1にカテゴリ選択画面を追加 |
| ブロックドメイン | 設定ページにブロックドメイン管理を追加。AI検索時に除外するドメインを登録・削除できる |
| 許可ドメイン廃止 | 許可ドメイン機能を全廃し、ブロックドメインに一本化 |
| ウィザードスコア 5段階化 | スコアを 0〜9 → 1〜5 に変更（1=非搭載 / 2=エントリー / 3=搭載 / 4=高精度 / 5=★推し） |
| スコア5の排他制御 | スコア5「推し機能」は1商品につき1つのみ。API・UIの両方でバリデーション |
| スコア管理廃止 | `/scores` ページを廃止し `/products` へリダイレクト |
| ウィザードスコア編集 | 商品詳細ページ（`/products/[id]`）にウィザードスコアセクションを追加。表示・編集・自動生成・保存が可能 |
| ウィザード変更の自動同期 | ウィザード保存時に `/api/diagnosis/sync` を呼び出し、カテゴリ内全商品へ不足キーワードを自動追加（score=1, reason=null） |
| 削除キーワード表示 | ウィザードで削除されたキーワードを商品編集ページで赤背景 + 「現在この項目は削除されています。」と表示 |
| ウィザード編集ページにスコア凡例追加 | 1〜5の意味を5列グリッドで説明するカードを追加 |
| rank フィールド廃止 | `rank` を型定義・API・UI・CSV インポートから全廃 |
| 型番・製品名のハイフン除去 | `model_number` と `name` は共にハイフンを除去して保存 |
| スタッフ画面プレビュー | `AdminCoordinatePicker` にスタッフ画面プレビューモードを追加済み（前バージョン） |

#### DBマイグレーション（要実行）

```sql
-- wizard_scores スコア制約を 1〜5 に変更（実行済みの場合スキップ）
ALTER TABLE wizard_scores DROP CONSTRAINT IF EXISTS wizard_scores_score_check;
ALTER TABLE wizard_scores ADD CONSTRAINT wizard_scores_score_check CHECK (score BETWEEN 1 AND 5);

-- blocked_domains テーブル
CREATE TABLE IF NOT EXISTS blocked_domains (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  domain text NOT NULL UNIQUE,
  reason text NOT NULL DEFAULT ''
);
ALTER TABLE blocked_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all" ON blocked_domains FOR ALL TO anon USING (true) WITH CHECK (true);

-- rank カラム削除
ALTER TABLE products DROP COLUMN IF EXISTS rank;
```

---

### Ver1.1.0 — 2026-03-29

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| ステップ式UI | ① カテゴリ選択 → ② 検索 → ③ プレビュー・保存 の3段階フロー |
| カテゴリ選択画面 | Supabase `categories` から取得、大きなボタンでタップしやすいUI |
| 3種類の検索方法 | URL / JANコード / 型番 をタブで切り替え |
| メーカーバリデーション（全方式共通） | 検索結果が許可ドメイン以外の場合はエラーで停止 |
| JANコード・型番検索 | Google Custom Search API で許可ドメイン内を検索 → URL取得 → AI解析 |
| カテゴリ不一致検出 | AI解析時に選択カテゴリとの一致を判定。不一致時は警告バナー表示 |
| 検索履歴 | Supabase `search_history` テーブルに保存（カテゴリ・方法・保存済フラグ付き）|
| 保存後の履歴更新 | DB保存完了時に履歴の `saved=true` を自動更新 |

#### 未実装・課題

| 項目 | 内容 |
|------|------|
| ❌ 管理者認証 | URLを知っていれば誰でもアクセス可能（要対応）|
| ❌ 登録済み商品一覧 | 登録した商品の確認・編集・削除ができない |
| ❌ カテゴリ管理 | カテゴリの追加・編集はSupabaseコンソールから直接操作が必要 |
| ⚠️ spec_dataが空になることがある | AIがスペックを抽出できないケースが存在 |

---

### Ver1.0.0 — 2026-03-29

**ステータス**: 完了（Ver1.1.0 に移行済み）

#### 実装済み（Ver1.0.0 時点）

| 機能 | 詳細 |
|------|------|
| URL入力 + AI解析 | メーカー公式URLからGemini 2.5 Flashで商品情報抽出 |
| DB保存 | Supabase `products` テーブルへのINSERT |
| ドメイン許可リスト | 10社のメーカー公式ドメインのみ受付 |
| Pythonツール | 初期データ作成用スクレイピング＆AI解析スクリプト |

---

### Ver1.2.0 — 2026-03-29

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| Supabase Auth ログイン | メール/パスワード認証（`/login`）|
| 認証ガード（全ページ共通） | `useAuth` フックで未ログイン時は `/login` にリダイレクト |
| AdminNav ナビゲーション | 商品登録 / 商品一覧 / カテゴリ管理 のリンク + ログアウトボタン |
| 登録済み商品一覧 | `/products` — カテゴリ・テキストフィルタ付きテーブル表示 |
| 商品詳細・編集ページ | `/products/[id]` — 全フィールド編集（スペック・用語解説の動的行追加） |
| 商品削除 | 一覧ページでのインライン削除確認UI |
| カテゴリ管理 | `/categories` — CRUD（追加・インライン編集・削除確認）+ spec_keys プレビュー |

---

### Ver1.3.0 — 2026-03-29

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| 解析結果の手動編集機能 | Step 3（プレビュー）を読み取り専用 → 全フィールド編集可能なフォームに変更 |
| 編集可能フィールド | 型番・製品名・メーカー・価格・ランク・接客トーク・売りポイント・スペック・用語解説 |
| スペック動的行管理 | 行の追加・削除・値の編集（`spec_entries` 中間ステート）|
| 用語解説動的行管理 | 行の追加・削除・値の編集（`glossary_entries` 中間ステート）|
| 保存データの反映 | 編集後の内容がそのままSupabaseへ保存される |

---

### Ver1.4.0 — 2026-03-29

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| 一括登録ページ（`/bulk`） | カテゴリ選択 → 複数URLを1行1件で入力 → 順次AI解析・自動保存 |
| 処理状況リアルタイム表示 | 各URLの状態（待機中 / 解析中 / 保存済 / エラー）をリスト表示 |
| カテゴリ不一致バッジ | 一括登録時もカテゴリ不一致を検出してバッジ表示 |
| 許可ドメイン設定ページ（`/settings`） | Supabaseの `allowed_domains` テーブルをUI上でCRUD管理 |
| 動的ドメインロード | `page.tsx` / `api/lookup` でSupabaseからドメインを取得（空時は静的リストにフォールバック）|
| AdminNavにリンク追加 | 「一括登録」「設定」をナビゲーションバーに追加 |

---

### Ver1.5.0 — 2026-03-30

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| `image_url` フィールド対応 | `products` テーブルに `image_url` カラム追加（要DB migration） |
| AI自動画像URL抽出 | analyze API: og:image / twitter:image メタタグからHTMLタグ除去前に抽出 |
| 商品登録 Step3 画像URL入力 | URL入力欄 + 即時プレビューサムネイル |
| 商品編集ページ画像URL入力 | 同上（`/products/[id]`） |
| save-product API 対応 | INSERT 時に `image_url` を保存 |

#### DB migration（Supabase SQLエディタで実行）

```sql
ALTER TABLE products ADD COLUMN image_url text NOT NULL DEFAULT '';
```

### Ver1.6.0 — 2026-04-05

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| `ImageUploadField.tsx` | ファイル選択 → Supabase Storage `product-images` バケットへアップロード → 公開URLを自動セット |
| URL手動入力との併用 | ファイルアップロードとURL直打ちの両方に対応 |
| 画像プレビュー | アップロード後にサムネイルプレビューを表示 |
| Storage RLS設定 | authenticated: INSERT/UPDATE可、public: SELECT可 |

---

### Ver1.7.0 — 2026-04-05

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| CSVダウンロード | 商品一覧ページに「CSVダウンロード」ボタンを追加 |
| フィルター反映 | カテゴリ・検索ワードのフィルター条件をエクスポートに反映 |
| BOM付きUTF-8 | Excel で日本語文字化けしないよう `\uFEFF` BOMを先頭に付与 |

---

### Ver1.8.0 — 2026-04-05

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| ダッシュボード（`/dashboard`） | 登録総数・過去7日・過去30日・画像なし商品数をカード表示 |
| フィルターカード | カードをクリックすると下のグラフがそのデータでフィルタリング |
| カテゴリ別登録数 | アコーディオン形式で展開すると商品一覧と編集リンクを表示 |
| おすすめランク分布 | ランク1〜5の分布を棒グラフで表示 |

---

### Ver1.9.0 — 実装予定

**目標**: ホットスポット座標ピッカー（AdminCoordinatePicker）

#### 概要

管理者が商品編集ページで製品画像をクリックし、ホットスポットの座標・ラベル・説明・キラーフレーズを登録・更新できるUI。

#### 実装予定

| 機能 | 詳細 |
|------|------|
| `AdminCoordinatePicker.tsx` | 画像プレビュー上をクリック → `offsetX / width * 100` でx/y（%）を計算 |
| ホットスポット一覧 | 登録済みの点を画像上にプレビュー表示（削除・編集可） |
| Supabase upsert | `product_features` テーブルへ座標・ラベル・説明・キラーフレーズを保存 |
| 商品編集ページに統合 | `/products/[id]` の編集フォーム下部に追加 |

---

### Ver1.10.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| フロー編集ページ（`/diagnosis/[categoryId]`） | ステップの追加・削除・質問文編集 |
| 選択肢の編集 | ラベル・補足テキストを設定 |
| カテゴリ管理に「ウィザード」ボタン追加 | カテゴリ一覧から各カテゴリのウィザード編集へ遷移 |
| Supabase upsert | 新規作成・既存更新を自動判定 |

---

### Ver1.11.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| スタッフ画面プレビュー | `AdminCoordinatePicker` に「スタッフ画面プレビュー」ボタンを追加 |
| Pingアニメーション表示 | スタッフが見るのと同じホットスポット（Pingアニメーション）を管理画面でプレビュー |
| タップ→ポップアップ | ホットスポットをクリックでラベル・説明・キラーフレーズのポップアップ確認 |
| タブナビゲーション | 画像下部にタブ一覧。スタッフ画面と同じ操作感で確認可能 |
| 編集/プレビュー切り替え | ボタンでモードを切り替え（編集中はプレビュー不可・逆も同様）|

---

### Ver1.12.0 — カテゴリ管理画面

**ステータス**: 実装済み（以前のバージョンで対応済み）

カテゴリの追加・編集・削除・ウィザード編集が `/categories` から操作可能。

---

### Ver1.13.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| 並び順変更モード | 商品一覧でカテゴリを選択 → 「並び順を変更」ボタンで専用UIに切り替え |
| ↑↓ボタン | 商品を1つずつ上下に移動。番号でリアルタイムに順位確認 |
| DB保存 | 「保存する」で `sort_order` カラムに一括書き込み |
| スタッフ側反映 | guide-app の商品一覧を `sort_order` 昇順で表示するよう変更 |

#### DB変更（実施済み）

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
```

---

### Ver1.14.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| CSV一括登録ページ（`/import`） | CSVファイルをアップロードして商品を一括登録 |
| CSVパース | クォート対応のカスタムパーサー。ヘッダー検証・行バリデーション付き |
| プレビューテーブル | 行ごとに ✓ OK / ✕ エラーを表示してから登録実行 |
| 注意表示 | script・spec・glossary・画像・ホットスポットはCSV登録不可の旨を明示 |

---

### Ver1.15.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| 設定画面にメーカー名フィールド追加 | ドメイン追加フォームにメーカー名入力欄を追加（省略可） |
| allowed_domains に maker_name カラム | ドメイン一覧にメーカー名バッジを表示 |
| analyze API の maker_name 対応 | Supabase の maker_name → 静的マップ → AI出力 の順で優先 |
| 価格フォーマット自動変換 | 管理画面の価格入力欄で数字入力時に ¥X,XXX 形式へ自動変換 |
| JANコード・型番検索の利用不可表示 | API key 未設定のため「現在ご利用いただけません」の警告を表示 |
| analyze API: ハイフン除去 | 型番から `-` を自動除去（例: ER-D7000B → ERD7000B） |
| analyze API: 価格取得 | AIが解析したページから価格情報を抽出 |

#### DB migration（実施済み）

```sql
ALTER TABLE allowed_domains ADD COLUMN IF NOT EXISTS maker_name text NOT NULL DEFAULT '';
```

---

### Ver1.16.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| スペック未更新バッジ | カテゴリの spec_keys と商品の spec_data を照合し、未入力項目がある商品に「要更新 X項目」バッジを黄色表示 |
| AI再解析ボタン | 要更新バッジのある商品（source_url 有り）に「AI再解析」ボタンを表示 |
| 一括AI再解析ボタン | 要更新商品が 1 件以上あるとヘッダーに「一括AI再解析（X件）」ボタンを表示。進捗を「解析中… X/Y」で表示 |
| 再解析マージ方式 | 不足キーのみ AI 結果で補完。既存値・手入力値は保持 |
| 商品編集ページ: 不足項目バナー | カテゴリの spec_keys に対して未入力の項目を黄色バナーで一覧表示 |
| 商品編集ページ: 不足項目ハイライト | 未入力の必須スペック欄をオレンジ枠・黄色背景でハイライト表示 |
| 商品編集ページ: 不足項目自動追加 | ページを開いた時点で不足キーを空エントリとして自動追加 |

---

### Ver1.17.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| 商品一覧テーブル横幅拡張 | コンテナを max-w-5xl → max-w-7xl に拡張、テーブル最小幅を 900px に設定 |
| 上部スクロールバー追加 | テーブル上部に横スクロールバーを追加。上下どちらを操作しても同期 |

---

### Ver1.18.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| スペック欄カード型レイアウト | 項目名をラベルとして上部に配置し、値入力欄を textarea（縦リサイズ可）に変更 |
| 用語解説欄カード型レイアウト | 同上。説明欄を rows=3 の textarea に変更 |
| 手入力バッジ | スペックの値を手動編集したキーに緑色「手入力」バッジを表示 |
| spec_manual_keys 追跡 | 手動編集したキーを DB の spec_manual_keys に保存。AI再解析時に上書きをスキップ |

#### DB migration（実施済み）

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS spec_manual_keys text[] NOT NULL DEFAULT '{}';
```

---

### Ver1.19.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| 下部ボタン右寄せ | 商品編集ページ下部の「キャンセル」「変更を保存」ボタンを右寄せに統一（`justify-end`） |

---

### Ver1.20.0 — 2026-04-06

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| 洗濯機 spec_keys 更新 | 洗濯機選び方ガイドをもとに12項目に再設計（タイプ・洗濯容量・乾燥容量・乾燥方式・洗浄方式・インバーター・標準使用水量・運転音（洗濯時）・洗剤自動投入・フィルター自動清掃・外形寸法・質量） |
| 洗濯機ウィザード登録 | `diagnosis_flows` に洗濯機向け4ステップのヒアリングフローを登録（乾燥機能の要否・重視ポイント・家族人数・設置スペース） |

#### DB変更（実施済み）

```sql
-- spec_keys 更新
UPDATE categories
SET spec_keys = ARRAY['タイプ','洗濯容量','乾燥容量','乾燥方式','洗浄方式','インバーター','標準使用水量','運転音（洗濯時）','洗剤自動投入','フィルター自動清掃','外形寸法','質量']
WHERE name = '洗濯機';

-- ウィザード登録
INSERT INTO diagnosis_flows (category_id, title, flow_data)
SELECT id, 'あなたにぴったりの洗濯機を探す', '{ ... }'::jsonb
FROM categories WHERE name = '洗濯機';
```

---

## Supabase テーブル構成

> **Supabase の SQL エディタで実行してください**

### categories テーブル

```sql
CREATE TABLE categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  spec_keys text[] NOT NULL DEFAULT '{}',
  script_hint text NOT NULL DEFAULT ''
);

-- サンプルデータ（必要に応じて追加）
INSERT INTO categories (name, spec_keys, script_hint) VALUES
  ('電子レンジ・オーブンレンジ', ARRAY['定格高周波出力', '庫内容量', '最高温度', '奥行き', '質量'], '調理の手軽さ・時短・プロ級仕上がりを強調すること'),
  ('洗濯機', ARRAY['洗濯容量', '乾燥容量', '洗濯時消費電力', '運転音', '外形寸法'], '節水・静音・使いやすさを強調すること'),
  ('冷蔵庫', ARRAY['総庫内容量', '年間消費電力量', '外形寸法', 'ドアの向き'], '省エネ・収納力・鮮度保持を強調すること'),
  ('エアコン', ARRAY['畳数目安', '冷房能力', '暖房能力', '年間消費電力量', '室外機寸法'], '電気代の安さ・快適さ・空気清浄機能を強調すること'),
  ('掃除機', ARRAY['吸込仕事率', '集塵容量', '充電時間', '連続使用時間', '質量'], '軽さ・吸引力・手軽さを強調すること'),
  ('テレビ', ARRAY['画面サイズ', '解像度', 'HDR対応', 'スピーカー出力', '年間消費電力量'], '映像の美しさ・音質・スマート機能を強調すること');

-- RLS: 管理者アプリからの読み取りを許可
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read" ON categories FOR SELECT TO anon USING (true);
```

### products テーブル

```sql
CREATE TABLE products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  source_url text NOT NULL DEFAULT '',
  jan_code text,
  name text NOT NULL,
  model_number text NOT NULL DEFAULT '',
  maker text NOT NULL DEFAULT '',
  price text NOT NULL DEFAULT '',
  spec_data jsonb NOT NULL DEFAULT '{}',
  unique_selling_point text NOT NULL DEFAULT '',
  script text NOT NULL DEFAULT '',
  glossary jsonb NOT NULL DEFAULT '[]',
  image_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  spec_manual_keys text[] NOT NULL DEFAULT '{}'
);

-- RLS: 管理者アプリからの読み書きを許可
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all" ON products FOR ALL TO anon USING (true) WITH CHECK (true);
```

### product_comparisons テーブル（Ver1.33.0 で追加）

```sql
CREATE TABLE product_comparisons (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  type            text NOT NULL CHECK (type IN ('old_model', 'competitor')),
  compared_model  text NOT NULL DEFAULT '',
  compared_maker  text NOT NULL DEFAULT '',
  points          jsonb NOT NULL DEFAULT '[]',  -- [{ field, this_value, other_value }]
  summary         text NOT NULL DEFAULT '',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE product_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all" ON product_comparisons FOR ALL TO anon USING (true) WITH CHECK (true);
```

### wizard_scores テーブル（Ver1.23.0 で追加）

```sql
CREATE TABLE wizard_scores (
  product_id     uuid REFERENCES products(id) ON DELETE CASCADE,
  keyword        text     NOT NULL,
  score          smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  reason         text,
  auto_generated boolean DEFAULT false,
  PRIMARY KEY (product_id, keyword)
);
```

### product_specs テーブル（Ver1.23.0 で追加）

ウィザード用スペック（wizard_specs）と出典URLを管理。

```sql
CREATE TABLE product_specs (
  product_id   uuid REFERENCES products(id) ON DELETE CASCADE,
  specs        jsonb NOT NULL DEFAULT '{}',
  sources      jsonb NOT NULL DEFAULT '{}',
  collected_at timestamptz DEFAULT now(),
  PRIMARY KEY (product_id)
);
```

### url_candidates テーブル（Ver1.23.0 で追加）

URL検索結果のキャッシュ。再検索を省略するために使用。

```sql
CREATE TABLE url_candidates (
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  url        text NOT NULL,
  title      text,
  snippet    text,
  selected   boolean DEFAULT true,
  PRIMARY KEY (product_id, url)
);
```

### search_history テーブル（Ver1.1.0 で追加）

```sql
CREATE TABLE search_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  category_name text NOT NULL DEFAULT '',
  search_method text NOT NULL CHECK (search_method IN ('url', 'jan', 'model')),
  query text NOT NULL,
  resolved_url text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  model_number text NOT NULL DEFAULT '',
  maker text NOT NULL DEFAULT '',
  category_match boolean NOT NULL DEFAULT true,
  saved boolean NOT NULL DEFAULT false,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL
);

-- RLS: 管理者アプリからの読み書きを許可
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all" ON search_history FOR ALL TO anon USING (true) WITH CHECK (true);
```

---

## 許可ドメイン一覧（`src/lib/allowedDomains.ts`）

```
panasonic.com / toshiba-lifestyle.com / sharp.co.jp
hitachi.co.jp / mitsubishielectric.co.jp / aqua-has.com
lg.com / sony.jp / iris-ohyama.co.jp / daikin.co.jp
```

---

## 環境変数（`.env.local`）

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
GOOGLE_CUSTOM_SEARCH_API_KEY=...
GOOGLE_CUSTOM_SEARCH_CX=...
```

---

## Google Custom Search のセットアップ手順

JANコード・型番検索に必要です（無料: 100クエリ/日 / 超過: $5/1,000クエリ）。

### ① Programmable Search Engine の作成

1. https://programmablesearchengine.google.com/ にアクセス
2. **「新しい検索エンジンを作成」** をクリック
3. **「検索するサイト」** に以下を1行ずつ入力：
   ```
   panasonic.com
   toshiba-lifestyle.com
   sharp.co.jp
   hitachi.co.jp
   mitsubishielectric.co.jp
   aqua-has.com
   lg.com
   sony.jp
   iris-ohyama.co.jp
   daikin.co.jp
   ```
4. 言語: **日本語**
5. 名前: 任意（例: `guide-product-search`）
6. 作成後、**「検索エンジンID（cx）」** をコピー → `.env.local` の `GOOGLE_CUSTOM_SEARCH_CX` に設定

### ② Google Cloud Console で API キーを取得

1. https://console.cloud.google.com/ にアクセス
2. プロジェクトを選択（または新規作成）
3. **「APIとサービス」→「ライブラリ」** で `Custom Search API` を検索・有効化
4. **「APIとサービス」→「認証情報」→「認証情報を作成」→「APIキー」**
5. 作成されたAPIキーをコピー → `.env.local` の `GOOGLE_CUSTOM_SEARCH_API_KEY` に設定

---

### allowed_domains テーブル（Ver1.4.0 で追加）

```sql
CREATE TABLE allowed_domains (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  domain text NOT NULL UNIQUE
);

-- 初期データ（既存の許可ドメインを移行する場合）
INSERT INTO allowed_domains (domain) VALUES
  ('panasonic.com'), ('toshiba-lifestyle.com'), ('sharp.co.jp'),
  ('hitachi.co.jp'), ('mitsubishielectric.co.jp'), ('aqua-has.com'),
  ('lg.com'), ('sony.jp'), ('iris-ohyama.co.jp'), ('daikin.co.jp');

-- RLS: 管理者アプリからの読み書きを許可
ALTER TABLE allowed_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all" ON allowed_domains FOR ALL TO anon USING (true) WITH CHECK (true);
```

> テーブルが空の場合は `src/lib/allowedDomains.ts` の静的リストが自動的にフォールバックとして使われます。

---

## Supabase Auth セットアップ手順（Ver1.2.0 で必要）

### ① Email 認証を有効化

1. Supabase Dashboard → **Authentication → Providers → Email** を有効化
2. 「Confirm email」は **オフ** にする（管理者専用なのでメール確認不要）

### ② 管理者ユーザーを作成

1. Supabase Dashboard → **Authentication → Users → Add user**
2. メールアドレスとパスワードを入力して作成
3. 作成したメール/パスワードで `/login` からログイン

---

### Ver1.21.0 — 2026-04-07

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| product_keyword_scores テーブル作成 | ウィザード2段階フィルター用のスコアテーブルをDB追加。商品×キーワードで0〜9点のスコアと個別reasonテキストを管理 |

#### DB変更（実施済み）

```sql
CREATE TABLE IF NOT EXISTS product_keyword_scores (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  keyword    text    NOT NULL,
  score      integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 9),
  reason     text,
  UNIQUE(product_id, keyword)
);
CREATE INDEX IF NOT EXISTS idx_pks_product ON product_keyword_scores(product_id);
CREATE INDEX IF NOT EXISTS idx_pks_keyword ON product_keyword_scores(keyword);
```

#### 設計メモ

- `keyword` は `diagnosis_flows.flow_data` の `steps[].options[].label` と一致させて紐付け
- `reason` が NULL の場合はウィザード側でキーワード共通のデフォルト文言を使用
- ハードフィルター（score=0 を除外）とソフトスコアリング（score 合算）の2段階ロジックで使用予定

---

### Ver1.22.0 — 2026-04-07

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| スコアCSVインポート画面 | `/scores` ページを新規追加。CSVアップロード→プレビュー→UPSERT登録の3ステップ。サンプルCSVダウンロード機能付き |
| AdminNavにスコア管理リンク追加 | ナビゲーションに「スコア管理」を追加 |

#### CSVフォーマット

```csv
model_number,keyword,score,reason
ER-D7000B,温め・解凍,8,赤外線センサーがお弁当の温度を賢く感知するので、ムラなく温まりますよ
ER-D7000B,料理・お菓子,9,300℃の高火力でパンやグラタンもお店のような仕上がりになりますよ
```

- `keyword` はウィザードのタイルのラベルと完全一致させる
- `score=0` の商品はハードフィルター使用時に除外される
- `reason` は自然な接客トーンで記入（空欄可、NULLの場合はデフォルト文言を使用予定）

---

### Ver1.23.0 — 2026-04-11

**ステータス**: 実装完了

#### 実装済み

| 機能 | 詳細 |
|------|------|
| スペック収集ページ（`/spec-search`） | 型番入力 → URL候補選択 → スペック解析 → スコア確認・編集 の4ステップUI |
| 新規商品登録との統合 | 既存商品の更新だけでなく、未登録商品も本ページから新規登録可能（旧・商品登録ページを実質統合）|
| Serper.dev による URL 自動検索 | 型番を入力するだけでメーカー公式ページ候補を自動取得（Google CSE から移行）|
| URL候補キャッシュ | 既存商品のURL候補を `url_candidates` テーブルにキャッシュし、再検索を省略 |
| Gemini 一括抽出 | 複数URLから商品情報（名前・価格・接客トーク等）＋ウィザードスペックを1回の Gemini 呼び出しで抽出 |
| ルールベース自動スコア生成 | `scoring-rules.ts` に定義したルールで wizard_specs → スコア（0〜9）と理由文を自動生成 |
| スコア手動編集 | 自動生成後に各キーワードのスコア・理由を手動調整して保存可能 |
| `wizard_scores` テーブル移行 | 旧 `product_keyword_scores` テーブルを廃止し `wizard_scores` に一本化（主キー変更・auto_generated フラグ追加）|
| `product_specs` テーブル追加 | ウィザード用スペック（`wizard_specs`）と出典URL（`sources`）を別テーブルで管理 |
| `url_candidates` テーブル追加 | 検索したURL候補をキャッシュするテーブル |
| AdminNav にスペック収集リンク追加 | ナビゲーションに「スペック収集」を追加 |
| Gemini 503 リトライ | Gemini API が 503 を返した場合、最大3回（5s/10s/15s バックオフ）自動リトライ |
| OGP 画像 URL 自動抽出 | 解析URLの og:image メタタグから画像URLを自動取得して `image_url` に保存 |
| 価格自動取得 | AIが解析したページから価格情報を抽出して保存 |
| guide-app のウィザードを wizard_scores に対応 | `DiagnosisWizard.tsx` のクエリ先を `wizard_scores` テーブルに変更 |

#### DB migration（Supabase SQL エディタで実行）

```sql
-- 旧テーブルを置き換える場合は事前に DROP TABLE product_keyword_scores;

CREATE TABLE IF NOT EXISTS wizard_scores (
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  keyword    text     NOT NULL,
  score      smallint NOT NULL CHECK (score BETWEEN 0 AND 9),
  reason     text,
  auto_generated boolean DEFAULT false,
  PRIMARY KEY (product_id, keyword)
);

CREATE TABLE IF NOT EXISTS product_specs (
  product_id   uuid REFERENCES products(id) ON DELETE CASCADE,
  specs        jsonb NOT NULL DEFAULT '{}',
  sources      jsonb NOT NULL DEFAULT '{}',
  collected_at timestamptz DEFAULT now(),
  PRIMARY KEY (product_id)
);

CREATE TABLE IF NOT EXISTS url_candidates (
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  url        text NOT NULL,
  title      text,
  snippet    text,
  selected   boolean DEFAULT true,
  PRIMARY KEY (product_id, url)
);
```

#### 環境変数追加

```
SERPER_API_KEY=...   # Serper.dev の API キー（Google 検索代替）
```

#### 関連ファイル

| ファイル | 変更種別 | 内容 |
|----------|----------|------|
| `src/app/spec-search/page.tsx` | 新規 | 4ステップUI |
| `src/app/api/spec-search/discover/route.ts` | 新規 | 型番検索・URL候補取得 |
| `src/app/api/spec-search/analyze/route.ts` | 新規 | Gemini 解析・products/product_specs 保存 |
| `src/app/api/spec-search/score/route.ts` | 新規 | スコア自動生成・手動保存 |
| `src/lib/google-cse.ts` | 書き換え | Serper.dev API に移行 |
| `src/lib/fetcher.ts` | 新規 | cheerio による HTML テキスト抽出 |
| `src/lib/scoring-rules.ts` | 新規 | カテゴリ別スコアリングルール定義 |
| `src/app/scores/page.tsx` | 修正 | `product_keyword_scores` → `wizard_scores` |
| `src/components/AdminNav.tsx` | 修正 | スペック収集リンク追加 |
| `guide-app/src/components/DiagnosisWizard.tsx` | 修正 | `wizard_scores` テーブルに対応 |

---

## ファイル構成

```
guide-admin/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 商品登録（3ステップUI + 検索履歴）
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── login/
│   │   │   └── page.tsx          # ログイン画面
│   │   ├── products/
│   │   │   ├── page.tsx          # 商品一覧
│   │   │   └── [id]/
│   │   │       └── page.tsx      # 商品編集
│   │   ├── categories/
│   │   │   └── page.tsx          # カテゴリ管理
│   │   ├── bulk/
│   │   │   └── page.tsx          # 一括登録
│   │   ├── settings/
│   │   │   └── page.tsx          # 設定（許可ドメイン管理）
│   │   └── api/
│   │       ├── lookup/
│   │       │   └── route.ts      # JANコード・型番 → Google Custom Search → URL
│   │       ├── analyze/
│   │       │   └── route.ts      # URL → Gemini解析（category_match付き）
│   │       └── save-product/
│   │           └── route.ts      # Supabase products INSERT（ID返却）
│   ├── components/
│   │   └── AdminNav.tsx          # 共通ナビゲーションバー
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── useAuth.ts            # 認証フック（全保護ページで使用）
│   │   └── allowedDomains.ts
│   └── types/
│       └── product.ts
├── tools/
│   ├── extract.py
│   ├── check_models.py
│   └── data/
└── .env.local
```

## 初回セットアップ

```bash
cd guide-admin
npm install
npm run dev
# http://localhost:3001
```

Supabase の SQL エディタで上記3テーブルの SQL を実行してから起動してください。
