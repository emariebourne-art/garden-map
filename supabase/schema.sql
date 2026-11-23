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

-- ---------------------------------------------------------------------------
-- Photos
-- Visitors can READ approved photos and REPORT them. They cannot add photos
-- directly: only the upload-photo Edge Function (which checks every image with
-- Claude) can insert rows or files, using the service role key.
-- ---------------------------------------------------------------------------

create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  spot_id     text not null check (char_length(spot_id) <= 80),
  path        text not null unique,                       -- object path in the "photos" bucket
  caption     text check (char_length(caption) <= 140),
  author      text check (char_length(author) <= 40),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists photos_spot_idx on public.photos (spot_id, created_at desc);

alter table public.photos enable row level security;
drop policy if exists "read visible photos" on public.photos;
create policy "read visible photos" on public.photos for select using (hidden = false);
revoke all on public.photos from anon;
grant select on public.photos to anon;

-- Reports: two reports from different visitors hide a photo until a moderator looks at it.
create table if not exists public.photo_reports (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos(id) on delete cascade,
  reason      text check (char_length(reason) <= 200),
  created_at  timestamptz not null default now()
);
alter table public.photo_reports enable row level security;
drop policy if exists "anyone can report" on public.photo_reports;
create policy "anyone can report" on public.photo_reports for insert with check (true);
revoke all on public.photo_reports from anon;
grant insert (photo_id, reason) on public.photo_reports to anon;

create or replace function public.hide_reported_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from photo_reports where photo_id = new.photo_id) >= 2 then
    update photos set hidden = true where id = new.photo_id;
  end if;
  return new;
end $$;
drop trigger if exists photo_reported on public.photo_reports;
create trigger photo_reported after insert on public.photo_reports
  for each row execute function public.hide_reported_photo();

-- Upload attempts, for rate limiting. Holds a salted hash of the IP, never the IP itself.
create table if not exists public.photo_attempts (
  id          bigint generated always as identity primary key,
  visitor     text not null,
  allowed     boolean not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists photo_attempts_idx on public.photo_attempts (visitor, created_at);
alter table public.photo_attempts enable row level security;   -- no policies: service role only
revoke all on public.photo_attempts from anon;

-- Storage bucket: public to read, no public write (no insert/update policies are created).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

-- ---------------------------------------------------------------------------
-- Corrections: neighbours saying a tree is gone, unreachable, or a different
-- kind. The app hides or relabels a spot once two reports agree, and a
-- "still_here" report cancels the problem reports before it. Moderators can
-- set hidden = true on a bad-faith report.
-- ---------------------------------------------------------------------------
create table if not exists public.spot_reports (
  id              uuid primary key default gen_random_uuid(),
  spot_id         text not null check (char_length(spot_id) <= 80),
  kind            text not null check (kind in ('still_here', 'gone', 'wrong_type', 'unreachable')),
  corrected_type  text check (char_length(corrected_type) <= 30),
  hidden          boolean not null default false,
  created_at      timestamptz not null default now(),
  check (kind = 'wrong_type' or corrected_type is null)
);
create index if not exists spot_reports_spot_idx on public.spot_reports (spot_id, created_at);
alter table public.spot_reports enable row level security;
drop policy if exists "read visible reports" on public.spot_reports;
create policy "read visible reports" on public.spot_reports for select using (hidden = false);
drop policy if exists "anyone can report" on public.spot_reports;
create policy "anyone can report" on public.spot_reports for insert with check (hidden = false);
revoke all on public.spot_reports from anon;
grant select on public.spot_reports to anon;
grant insert (spot_id, kind, corrected_type) on public.spot_reports to anon;
