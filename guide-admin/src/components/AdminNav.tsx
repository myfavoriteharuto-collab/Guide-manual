'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

const NAV_LINKS = [
  { href: '/spec-search', label: '商品登録' },
  { href: '/products',    label: '商品一覧' },
  { href: '/categories',  label: 'カテゴリ管理' },
  { href: '/dashboard',   label: 'ダッシュボード' },
  { href: '/users',       label: 'ユーザー管理', superAdminOnly: true },
  { href: '/settings',    label: '設定' },
];

const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;

export default function AdminNav({ session }: { session: Session | null }) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <nav className="bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-5">
          <span className="text-sm font-black tracking-tight shrink-0">ガイド 管理者</span>
          <div className="flex gap-0.5">
            {NAV_LINKS.filter(({ superAdminOnly }) => !superAdminOnly || session?.user?.email === SUPER_ADMIN_EMAIL).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === href
                    ? 'bg-white/20 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 truncate max-w-[180px]">{session?.user?.email}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors shrink-0"
          >
            ログアウト
          </button>
        </div>
      </div>
    </nav>
  );
}
