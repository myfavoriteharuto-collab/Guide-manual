# Guide App — 家電接客サポートツール

家電量販店のスタッフが接客中にタブレットで使える、商品案内・比較・ウィザードアプリです。
管理者がAIで商品情報を自動登録し、スタッフアプリに反映されます。

---

## 構成

```
Guide-manual/
├── guide-app/    # スタッフ向けアプリ (Next.js, port 3000)
└── guide-admin/  # 管理者向けアプリ (Next.js, port 3001)
```

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 / TypeScript / Tailwind CSS v4 |
| バックエンド/DB | Supabase (PostgreSQL + Auth + Storage) |
| AI解析 | Gemini 2.5 Flash |
| URL探索 | Google Custom Search API |
| デプロイ | Vercel |

---

## 主な機能

### guide-app（スタッフアプリ）
- **商品一覧・詳細表示** — スペック・接客トーク・用語解説をまとめて確認
- **比較画面** — 複数商品をカード形式で横並び比較、他モデルとの比較ポイントを表示
- **おすすめウィザード** — お客様の条件に合った商品をステップ形式で提案
- **お気に入り** — localStorage で端末内に保存
- **PWA対応** — ホーム画面追加でアプリライクに使用可能

### guide-admin（管理者アプリ）
- **AI商品登録** — メーカー公式URLを入力するだけでスペック・接客トークをAI自動抽出
- **色展開取得** — table / dl / カラーUIコンテナ / img alt など複数戦略でカラーバリエーションを抽出
- **ブログ検索** — 型番で家電レビューブログ記事を自動検索し、接客トークの参考情報として活用
- **比較データ管理** — 旧モデル・競合モデルとの比較ポイントをDB管理
- **ユーザー管理** — マジックリンクで管理者を招待

---

## セットアップ

### 必要なもの
- Node.js 18以上
- Supabase プロジェクト
- Gemini API キー
- Google Custom Search API キー

### guide-app

```bash
cd guide-app
npm install
```

`.env.local` を作成：
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

```bash
npm run dev  # http://localhost:3000
```

### guide-admin

```bash
cd guide-admin
npm install
```

`.env.local` を作成：
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CUSTOM_SEARCH_API_KEY=your_cse_api_key
GOOGLE_CUSTOM_SEARCH_CX=your_cse_cx
NEXT_PUBLIC_SUPER_ADMIN_EMAIL=your_admin_email
```

```bash
npm run dev  # http://localhost:3001
```

---

## Supabase テーブル構成

主要テーブル：`products` / `categories` / `product_specs` / `product_comparisons` / `wizard_scores` / `url_candidates`

詳細は [`docs/guide-admin-guide.md`](docs/guide-admin-guide.md) を参照してください。

---

## ドキュメント

- [スタッフアプリ 使い方ガイド](docs/guide-app-guide.md)
- [管理者アプリ 使い方ガイド](docs/guide-admin-guide.md)
