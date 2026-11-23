-- Portland Grow Map — shared notes database (Supabase / Postgres).
-- Paste this into Supabase → SQL Editor → Run.
--
-- Anyone can read and add. Nobody can edit or delete through the public API;
-- moderators hide rows from the Supabase dashboard by setting hidden = true.

create table if not exists public.spots (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('tree', 'yard', 'garden')),
  type        text not null check (char_length(type) <= 30),
  name        text not null check (char_length(name) between 1 and 80),
  lat         double precision not null check (lat between 45.40 and 45.66),   -- Portland, roughly
  lng         double precision not null check (lng between -122.85 and -122.46),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  -- A community spot's uuid, or a city record like 'city-tree:12345' / 'city-garden:7'.
  spot_id     text not null check (char_length(spot_id) <= 80),
  status      text not null check (status in ('info', 'ripe', 'pick', 'ask', 'leave')),
  author      text check (char_length(author) <= 40),
  body        text not null check (char_length(body) between 1 and 500),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notes_spot_idx on public.notes (spot_id, created_at desc);

alter table public.spots enable row level security;
alter table public.notes enable row level security;

drop policy if exists "read visible spots" on public.spots;
create policy "read visible spots" on public.spots for select using (hidden = false);
drop policy if exists "anyone can add spots" on public.spots;
create policy "anyone can add spots" on public.spots for insert with check (hidden = false);

drop policy if exists "read visible notes" on public.notes;
create policy "read visible notes" on public.notes for select using (hidden = false);
drop policy if exists "anyone can add notes" on public.notes;
create policy "anyone can add notes" on public.notes for insert with check (hidden = false);

-- Only the columns the app sends may be written by the public.
revoke all on public.spots, public.notes from anon;
grant select on public.spots, public.notes to anon;
grant insert (kind, type, name, lat, lng) on public.spots to anon;
grant insert (spot_id, status, author, body) on public.notes to anon;
