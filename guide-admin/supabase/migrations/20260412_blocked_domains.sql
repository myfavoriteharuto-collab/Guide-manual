create table if not exists blocked_domains (
  id     uuid default gen_random_uuid() primary key,
  domain text not null unique,
  reason text not null default ''
);

alter table blocked_domains enable row level security;
create policy "anon all" on blocked_domains for all to anon using (true) with check (true);
