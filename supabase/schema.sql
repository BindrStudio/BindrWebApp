-- Bind'r Stock & Beurs App — databaseschema, fase 1
--
-- Uitvoeren: Supabase-dashboard › SQL Editor › New query › dit hele bestand plakken › Run.
-- Het script mag gerust een tweede keer lopen; het overschrijft geen gegevens.
--
-- Beveiliging in het kort:
--   * Enkel wie in de tabel `beheerders` staat, kan iets lezen of wijzigen.
--   * De publieke sleutel in de app geeft zonder login alleen toegang tot de
--     weergave `publieke_vitrine` (kaart, conditie, prijs van wat in de vitrine ligt).
--   * Zet in Authentication › Sign In / Providers "Allow new users to sign up" UIT,
--     zodat niemand zelf een account kan maken.

create extension if not exists pgcrypto;

-- ── Beheerders ────────────────────────────────────────────────────────────────
create table if not exists public.beheerders (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  naam         text not null,
  aangemaakt_op timestamptz not null default now()
);

create or replace function public.is_beheerder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.beheerders where user_id = auth.uid());
$$;

-- ── Exemplaren: elke fysieke kaart, slab of binder met een eigen QR-code ─────
create table if not exists public.exemplaren (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{6}$'),
  soort            text not null default 'kaart' check (soort in ('kaart', 'slab', 'eigen product')),
  kaart_id         text,                 -- TCGdex-id, bv. me02-130 of SV2a-173
  catalogus        text check (catalogus in ('en', 'asia')),
  afbeelding       text,                 -- kaartfoto (TCGdex), voor de app en de publieke vitrine
  naam             text not null,        -- Engelse naam (ook op het label)
  naam_origineel   text,                 -- Japanse of Chinese naam, om op te zoeken
  set_naam         text,
  set_code         text,
  nummer           text,
  taal             text not null default 'EN',
  conditie         text check (conditie in ('M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO')),
  variant          text not null default 'normaal',
  grader           text,
  grade            text,
  cardmarket_id    integer,
  opslag           text not null default 'stockdoos' check (opslag in ('vitrine', 'stockdoos')),
  status           text not null default 'in voorraad'
                     check (status in ('in voorraad', 'gereserveerd', 'verkocht', 'geruild', 'weg')),
  gereserveerd_voor text,
  verkoopprijs     numeric(10, 2),
  prijs_handmatig  boolean not null default false,
  hartjesprijs     numeric(10, 2),       -- de prijs op het hartje vooraan
  hartjesdatum     date,                 -- de dag dat dat hartje geschreven werd
  aankoopprijs     numeric(10, 2),
  aankoopdatum     date,
  aankoopbron      text,
  label_status     text not null default 'te printen'
                     check (label_status in ('te printen', 'geprint', 'gestickerd')),
  opmerking        text,
  aangemaakt_door  uuid default auth.uid(),
  aangemaakt_op    timestamptz not null default now(),
  gewijzigd_door   uuid,
  gewijzigd_op     timestamptz not null default now()
);

-- Voor bestaande databases: kolommen die later bijkwamen.
alter table public.exemplaren add column if not exists afbeelding text;

create index if not exists exemplaren_kaart_idx  on public.exemplaren (kaart_id);
create index if not exists exemplaren_status_idx on public.exemplaren (status, opslag);

-- ── Artikelen: wat per aantal gaat (booster packs, 3D-prints, bulk) ──────────
create table if not exists public.artikelen (
  id            uuid primary key default gen_random_uuid(),
  naam          text not null,
  soort         text not null default 'sealed' check (soort in ('sealed', 'eigen product', 'bulk', 'andere')),
  aantal        integer not null default 0 check (aantal >= 0),
  prijs         numeric(10, 2),
  opslag        text not null default 'vitrine' check (opslag in ('vitrine', 'stockdoos')),
  opmerking     text,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_door uuid,
  gewijzigd_op  timestamptz not null default now()
);

-- ── Instellingen die de drie beheerders delen (drempels, conditiefactoren) ───
create table if not exists public.instellingen (
  sleutel  text primary key,
  waarde   jsonb not null,
  gewijzigd_op timestamptz not null default now()
);

-- ── Logboek: wie deed wat en wanneer ─────────────────────────────────────────
create table if not exists public.logboek (
  id         bigint generated always as identity primary key,
  tijd       timestamptz not null default now(),
  beheerder  uuid default auth.uid(),
  tabel      text not null,
  rij_id     uuid,
  actie      text not null,
  wijziging  jsonb
);
create index if not exists logboek_rij_idx on public.logboek (rij_id, tijd desc);

-- ── Triggers: gewijzigd_op bijhouden en elke wijziging loggen ────────────────
create or replace function public.zet_gewijzigd()
returns trigger
language plpgsql
as $$
begin
  new.gewijzigd_op := now();
  new.gewijzigd_door := auth.uid();
  return new;
end;
$$;

create or replace function public.log_wijziging()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  verschil jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.logboek (tabel, rij_id, actie, wijziging)
    values (tg_table_name, new.id, 'toegevoegd', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('van', o.value, 'naar', n.value)), '{}'::jsonb)
      into verschil
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('gewijzigd_op', 'gewijzigd_door');
    if verschil <> '{}'::jsonb then
      insert into public.logboek (tabel, rij_id, actie, wijziging)
      values (tg_table_name, new.id, 'gewijzigd', verschil);
    end if;
    return new;
  else
    insert into public.logboek (tabel, rij_id, actie, wijziging)
    values (tg_table_name, old.id, 'verwijderd', to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists exemplaren_gewijzigd on public.exemplaren;
create trigger exemplaren_gewijzigd before update on public.exemplaren
  for each row execute function public.zet_gewijzigd();
drop trigger if exists exemplaren_log on public.exemplaren;
create trigger exemplaren_log after insert or update or delete on public.exemplaren
  for each row execute function public.log_wijziging();

drop trigger if exists artikelen_gewijzigd on public.artikelen;
create trigger artikelen_gewijzigd before update on public.artikelen
  for each row execute function public.zet_gewijzigd();
drop trigger if exists artikelen_log on public.artikelen;
create trigger artikelen_log after insert or update or delete on public.artikelen
  for each row execute function public.log_wijziging();

-- ── Rijbeveiliging: enkel beheerders ─────────────────────────────────────────
alter table public.beheerders   enable row level security;
alter table public.exemplaren   enable row level security;
alter table public.artikelen    enable row level security;
alter table public.instellingen enable row level security;
alter table public.logboek      enable row level security;

drop policy if exists "beheerders lezen" on public.beheerders;
create policy "beheerders lezen" on public.beheerders
  for select to authenticated using (public.is_beheerder());

drop policy if exists "beheerders alles" on public.exemplaren;
create policy "beheerders alles" on public.exemplaren
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

drop policy if exists "beheerders alles" on public.artikelen;
create policy "beheerders alles" on public.artikelen
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

drop policy if exists "beheerders alles" on public.instellingen;
create policy "beheerders alles" on public.instellingen
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

drop policy if exists "beheerders lezen" on public.logboek;
create policy "beheerders lezen" on public.logboek
  for select to authenticated using (public.is_beheerder());

-- ── Publieke vitrine (voor de klantencatalogus, fase 2) ──────────────────────
-- Een weergave met de rechten van de eigenaar: ze toont enkel deze kolommen en
-- enkel wat in de vitrine ligt, ook al kan de publieke sleutel de tabel zelf niet lezen.
create or replace view public.publieke_vitrine as
  select kaart_id, catalogus, afbeelding, soort, naam, set_naam, set_code, nummer, taal, conditie,
         variant, grader, grade, hartjesprijs as prijs
    from public.exemplaren
   where opslag = 'vitrine' and status = 'in voorraad';

revoke all on public.publieke_vitrine from anon;
grant select on public.publieke_vitrine to anon, authenticated;

-- ── Beheerders toevoegen ─────────────────────────────────────────────────────
-- 1. Maak de drie accounts aan in Authentication › Users › Add user (met e-mail en wachtwoord).
-- 2. Vul hieronder de e-mailadressen en namen in en voer enkel dit stuk uit:
--
-- insert into public.beheerders (user_id, naam)
-- select id, 'Naam 1' from auth.users where email = 'eerste@voorbeeld.be'
-- on conflict (user_id) do nothing;
