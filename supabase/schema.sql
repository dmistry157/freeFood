-- Berkeley Free Food Map schema. Safe to re-run.
-- The pipeline uses the secret key (bypasses RLS); the app uses the
-- publishable key, which can only read events.

-- Raw scraped items, one row per post/email/feed entry.
create table if not exists raw_items (
  id          bigint generated always as identity primary key,
  source      text not null,             -- berkeley_events | callink | gmail | instagram
  source_id   text not null,
  fetched_at  timestamptz not null default now(),
  text        text,
  media_paths text[] not null default '{}',
  posted_at   timestamptz,
  processed   boolean not null default false,
  unique (source, source_id)
);
create index if not exists raw_items_unprocessed on raw_items (fetched_at) where not processed;

-- Extracted, geocoded, deduped events shown in the app.
create table if not exists events (
  id           bigint generated always as identity primary key,
  title        text not null,
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  building     text,
  room         text,
  lat          double precision,          -- null = list view, not map
  lng          double precision,
  food         text,
  requirements text,
  link         text,
  open_to      text,
  confidence   real,
  fingerprint  text not null unique,      -- date + start hour + building
  source_urls  text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists events_time on events (start_time, end_time);

-- Phase 4: food certainty. stated = food mentioned; likely = event type usually has food.
alter table events add column if not exists food_status text not null default 'stated'
  check (food_status in ('stated', 'likely'));
alter table events add column if not exists food_reason text;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists events_updated_at on events;
create trigger events_updated_at before update on events
  for each row execute function set_updated_at();

-- Building lookup for geocoding.
create table if not exists buildings (
  name    text primary key,
  aliases text[] not null default '{}',
  lat     double precision not null,
  lng     double precision not null
);

-- Clubs to watch on CalLink / Instagram.
create table if not exists clubs (
  name             text primary key,
  callink_url      text,
  instagram_handle text,
  is_public        boolean not null default true,
  active           boolean not null default true
);

-- Row-level security: everything locked down except public read of events.
alter table raw_items enable row level security;
alter table events    enable row level security;
alter table buildings enable row level security;
alter table clubs     enable row level security;

drop policy if exists "public read events" on events;
create policy "public read events" on events for select to anon, authenticated using (true);
