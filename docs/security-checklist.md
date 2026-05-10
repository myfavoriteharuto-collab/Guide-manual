# セキュリティチェックリスト

Next.js + Supabase + TypeScript プロジェクト向け。
新しいAPIルートやページを追加・変更するときに確認する。

---

## APIルート (`app/api/**/route.ts`)

- [ ] **認証チェックがある**
  - `supabaseServer.auth.getUser()` でセッションを検証している
  - 未認証の場合は `401` を返している
  - フロント側のリクエストに `Authorization: Bearer <token>` ヘッダーを付けている

- [ ] **エラーの内部情報を返していない**
  - `catch` 節では `console.error` でサーバーログに出力する
  - クライアントへは汎用メッセージのみ返す（DBのテーブル名・カラム名・SQL断片を含めない）

- [ ] **リクエストボディをバリデーションしている**
  - 必須フィールドの存在・型をチェックしている
  - 不正な値には `400` を返している
  - 可能なら `zod` でスキーマ定義する

---

## ページ・コンポーネント

- [ ] **管理者ページに `middleware.ts` のルートガードがある**
  - クライアントサイドの `useAuth` だけに頼らない
  - JS無効環境・直接アクセスでも保護されている

- [ ] **外部URLを `<img src>` に直接渡していない**
  - Next.js の `<Image>` コンポーネントを使う
  - `next.config.js` の `images.domains` で許可ドメインを制限する

- [ ] **URLパラメータを `encodeURIComponent` している**
  - ユーザー入力やDB値をURLに含める場合はエンコードする

---

## 認証・環境変数

- [ ] **APIキー・シークレットをハードコードしていない**
  - 全て `process.env` 経由で読み込む

- [ ] **`.env` 系ファイルが `.gitignore` に含まれている**
  - `.env`, `.env.local`, `.env*.local` が除外されていることを確認

- [ ] **Supabase の RLS が有効になっている**
  - テーブルに Row Level Security を設定している
  - anon key でアクセス可能な範囲が意図通りになっている

---

## クエリ・データ操作

- [ ] **生のSQL文字列を連結していない**
  - Supabase クライアントの `.eq()` `.insert()` `.update()` 等を使う
  - 生SQL（`rpc` など）を使う場合はパラメータをバインドしている

---

## XSS

- [ ] **`dangerouslySetInnerHTML` を使っていない**
  - 使う場合は DOMPurify 等でサニタイズしている

- [ ] **テキスト展開は React の `{}` 構文を使っている**
  - 自動エスケープが効いていることを確認

---

## 既知の未対応項目（2026-04-20 時点）

| 優先度 | 問題 | 対象ファイル |
|---|---|---|
| 🔴 今すぐ | APIルートに認証なし | `guide-admin/src/app/api/products/manual/route.ts` |
| 🔴 今すぐ | エラーの内部詳細をそのまま返している | `guide-admin/src/app/api/products/manual/route.ts:52` |
| 🟡 できれば | リクエストボディのバリデーション不足 | `guide-admin/src/app/api/products/manual/route.ts:6-17` |
| 🟡 できれば | Middleware がなくクライアント認証のみ | `guide-admin/src/app/spec-search/page.tsx` |
| 🟡 余裕があれば | `<img>` の直接使用 | `guide-app/src/app/categories/[id]/page.tsx`, `products/[id]/page.tsx` |
| 🟡 余裕があれば | URLパラメータの `encodeURIComponent` 漏れ | `guide-app/src/components/DiagnosisWizard.tsx:428` |
