import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ユーザー一覧取得
export async function GET() {
  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data.users });
}

// ユーザー追加（ログインリンクをメール送信）
export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'メールアドレスが必要です' }, { status: 400 });

  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://guide-admin.vercel.app',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data.user });
}

// ユーザー削除
export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
