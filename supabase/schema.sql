-- Bind'r Stock & Beurs App — databaseschema (fase 1, 2 en 3)
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
alter table public.exemplaren add column if not exists transactie_id uuid;      -- verkoop of ruil waarmee het wegging
alter table public.exemplaren add column if not exists afgeboekt_op timestamptz;

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

-- ── Beurzen (fase 2) ─────────────────────────────────────────────────────────
create table if not exists public.beurzen (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null,
  datum           date not null default current_date,
  standgeld       numeric(10, 2),
  startkas        numeric(10, 2),
  status          text not null default 'gepland' check (status in ('gepland', 'actief', 'afgesloten')),
  gestart_op      timestamptz,
  afgesloten_op   timestamptz,
  getelde_kas     numeric(10, 2),
  sumup_bevestigd boolean not null default false,
  stand_start     jsonb,   -- {catalogus, catalogusWaarde, artikelenWaarde, voorraad}
  stand_einde     jsonb,
  opmerking       text,
  aangemaakt_door uuid default auth.uid(),
  aangemaakt_op   timestamptz not null default now(),
  gewijzigd_door  uuid,
  gewijzigd_op    timestamptz not null default now()
);

-- ── Transacties: verkoop, ruil, inkoop en retour (fase 2) ────────────────────
-- De regels staan als lijst in de transactie zelf; de functie boek_transactie
-- past ze toe op de voorraad, in één keer en hoogstens één keer per id.
create table if not exists public.transacties (
  id          uuid primary key,          -- gemaakt op de gsm, zodat offline boeken veilig opnieuw kan
  beurs_id    uuid references public.beurzen (id) on delete set null,
  soort       text not null check (soort in ('verkoop', 'ruil', 'inkoop', 'retour')),
  tijd        timestamptz not null default now(),
  beheerder   uuid default auth.uid(),
  regels      jsonb not null default '[]',
  totaal      numeric(10, 2) not null default 0,
  cash        numeric(10, 2) not null default 0,
  sumup       numeric(10, 2) not null default 0,
  status      text not null default 'ok' check (status in ('ok', 'conflict', 'ongedaan')),
  conflicten  jsonb not null default '[]',
  opmerking   text,
  geboekt_op  timestamptz not null default now()
);
create index if not exists transacties_beurs_idx on public.transacties (beurs_id, tijd);

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

drop trigger if exists beurzen_gewijzigd on public.beurzen;
create trigger beurzen_gewijzigd before update on public.beurzen
  for each row execute function public.zet_gewijzigd();
drop trigger if exists beurzen_log on public.beurzen;
create trigger beurzen_log after insert or update or delete on public.beurzen
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
alter table public.beurzen      enable row level security;
alter table public.transacties  enable row level security;

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

drop policy if exists "beheerders alles" on public.beurzen;
create policy "beheerders alles" on public.beurzen
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

drop policy if exists "beheerders alles" on public.transacties;
create policy "beheerders alles" on public.transacties
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

-- ── Rechten voor de app (REST-API) ───────────────────────────────────────────
-- Nieuwere Supabase-projecten geven nieuwe tabellen niet altijd automatisch vrij
-- aan de API. Daarom expliciet: ingelogde gebruikers mogen de tabellen aanspreken
-- (de rijbeveiliging hierboven beslist wat ze echt zien), de publieke sleutel niets.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.exemplaren, public.artikelen, public.instellingen, public.beurzen, public.transacties to authenticated;
grant select on public.beheerders, public.logboek to authenticated;
grant execute on function public.is_beheerder() to authenticated;
revoke all on public.beheerders, public.exemplaren, public.artikelen, public.instellingen, public.logboek, public.beurzen, public.transacties from anon;

-- ── Kassa: transacties boeken, ongedaan maken en conflicten oplossen ─────────
-- Dezelfde regels als src/lib/kassa.ts (pasToe, maakOngedaan, losConflictOp).
create or replace function public.boek_transactie(t jsonb)
returns public.transacties
language plpgsql
security invoker
set search_path = public
as $$
declare
  bestaand   public.transacties;
  uitkomst   public.transacties;
  r          jsonb;
  e          public.exemplaren;
  a_aantal   integer;
  n          integer;
  nieuw      jsonb;
  conflicten jsonb := '[]'::jsonb;
  v_soort    text := t->>'soort';
  tid        uuid := (t->>'id')::uuid;
  v_tijd     timestamptz := coalesce((t->>'tijd')::timestamptz, now());
begin
  if not public.is_beheerder() then
    raise exception 'Enkel beheerders kunnen boeken';
  end if;
  -- Hoogstens één keer: een transactie die opnieuw binnenkomt (offline, slecht netwerk) verandert niets.
  select * into bestaand from public.transacties where id = tid;
  if found then
    return bestaand;
  end if;

  for r in select value from jsonb_array_elements(coalesce(t->'regels', '[]'::jsonb)) loop
    n := coalesce((r->>'aantal')::integer, 1);

    if v_soort = 'retour' then
      if r->>'exemplaar_id' is not null then
        update public.exemplaren set status = 'in voorraad', transactie_id = null, afgeboekt_op = null
         where id = (r->>'exemplaar_id')::uuid;
        if not found then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'onbekend exemplaar');
        end if;
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = aantal + n where id = (r->>'artikel_id')::uuid;
      end if;
      continue;
    end if;

    if r->>'richting' = 'uit' then
      if r->>'exemplaar_id' is not null then
        select * into e from public.exemplaren where id = (r->>'exemplaar_id')::uuid for update;
        if not found then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'onbekend exemplaar');
        elsif e.status not in ('in voorraad', 'gereserveerd') then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'al ' || e.status);
        else
          update public.exemplaren
             set status = case when v_soort = 'ruil' then 'geruild' else 'verkocht' end,
                 transactie_id = tid, afgeboekt_op = v_tijd
           where id = e.id;
        end if;
      elsif r->>'artikel_id' is not null then
        select aantal into a_aantal from public.artikelen where id = (r->>'artikel_id')::uuid for update;
        if not found then
          conflicten := conflicten || jsonb_build_object('artikel_id', r->>'artikel_id', 'reden', 'onbekend artikel');
        else
          if a_aantal < n then
            conflicten := conflicten || jsonb_build_object('artikel_id', r->>'artikel_id', 'reden', 'nog maar ' || a_aantal || ' in voorraad');
          end if;
          update public.artikelen set aantal = greatest(0, aantal - n) where id = (r->>'artikel_id')::uuid;
        end if;
      end if;

    else -- 'in': wat binnenkomt bij ruil of inkoop
      if jsonb_typeof(r->'nieuw') = 'object' then
        nieuw := jsonb_build_object(
                   'soort', 'kaart', 'taal', 'EN', 'variant', 'normaal', 'opslag', 'stockdoos', 'prijs_handmatig', false,
                   'aankoopbron', case when v_soort = 'ruil' then 'ruil' else 'beurs' end,
                   'aangemaakt_door', auth.uid(), 'aangemaakt_op', v_tijd, 'gewijzigd_op', v_tijd)
                 || jsonb_strip_nulls(r->'nieuw')
                 || jsonb_build_object('status', 'in voorraad', 'label_status', 'te printen',
                                       'aankoopprijs', r->'prijs', 'aankoopdatum', (v_tijd at time zone 'Europe/Brussels')::date);
        insert into public.exemplaren
          select * from jsonb_populate_record(null::public.exemplaren, nieuw)
          on conflict (id) do nothing;
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = aantal + n where id = (r->>'artikel_id')::uuid;
        if not found then
          conflicten := conflicten || jsonb_build_object('artikel_id', r->>'artikel_id', 'reden', 'onbekend artikel');
        end if;
      end if;
    end if;
  end loop;

  insert into public.transacties (id, beurs_id, soort, tijd, regels, totaal, cash, sumup, status, conflicten, opmerking)
  values (tid, nullif(t->>'beurs_id', '')::uuid, v_soort, v_tijd, coalesce(t->'regels', '[]'::jsonb),
          coalesce((t->>'totaal')::numeric, 0), coalesce((t->>'cash')::numeric, 0), coalesce((t->>'sumup')::numeric, 0),
          case when jsonb_array_length(conflicten) > 0 then 'conflict' else 'ok' end, conflicten, t->>'opmerking')
  returning * into uitkomst;
  return uitkomst;
end;
$$;

create or replace function public.maak_ongedaan(tid uuid)
returns public.transacties
language plpgsql
security invoker
set search_path = public
as $$
declare
  t   public.transacties;
  r   jsonb;
  n   integer;
  in_conflict text[];
begin
  select * into t from public.transacties where id = tid for update;
  if not found then
    raise exception 'Onbekende transactie';
  end if;
  if t.status = 'ongedaan' then
    return t;
  end if;
  in_conflict := array(select c->>'exemplaar_id' from jsonb_array_elements(t.conflicten) c where c->>'exemplaar_id' is not null);

  for r in select value from jsonb_array_elements(t.regels) loop
    n := coalesce((r->>'aantal')::integer, 1);
    if t.soort = 'retour' then
      if r->>'exemplaar_id' is not null then
        update public.exemplaren set status = coalesce(r->>'vorige_status', 'verkocht'), afgeboekt_op = t.tijd
         where id = (r->>'exemplaar_id')::uuid;
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = greatest(0, aantal - n) where id = (r->>'artikel_id')::uuid;
      end if;
    elsif r->>'richting' = 'uit' then
      if r->>'exemplaar_id' is not null and not (r->>'exemplaar_id' = any (in_conflict)) then
        update public.exemplaren
           set status = case when gereserveerd_voor is not null then 'gereserveerd' else 'in voorraad' end,
               transactie_id = null, afgeboekt_op = null
         where id = (r->>'exemplaar_id')::uuid and transactie_id = tid;
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = aantal + n where id = (r->>'artikel_id')::uuid;
      end if;
    else
      if jsonb_typeof(r->'nieuw') = 'object' then
        delete from public.exemplaren where id = (r->'nieuw'->>'id')::uuid and status = 'in voorraad';
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = greatest(0, aantal - n) where id = (r->>'artikel_id')::uuid;
      end if;
    end if;
  end loop;

  update public.transacties set status = 'ongedaan' where id = tid returning * into t;
  return t;
end;
$$;

-- Een conflict oplossen: de regel hoorde bij een ander exemplaar (bv. het verkeerde label getypt).
create or replace function public.los_conflict_op(tid uuid, oud uuid, nieuw uuid)
returns public.transacties
language plpgsql
security invoker
set search_path = public
as $$
declare
  t public.transacties;
  e public.exemplaren;
  nieuwe_conflicten jsonb;
begin
  select * into t from public.transacties where id = tid for update;
  if not found then
    raise exception 'Onbekende transactie';
  end if;
  select * into e from public.exemplaren where id = nieuw for update;
  if not found then
    raise exception 'Dat exemplaar bestaat niet';
  end if;
  if e.status not in ('in voorraad', 'gereserveerd') then
    raise exception 'Dat exemplaar is ook al %', e.status;
  end if;

  update public.exemplaren
     set status = case when t.soort = 'ruil' then 'geruild' else 'verkocht' end, transactie_id = tid, afgeboekt_op = t.tijd
   where id = e.id;

  select coalesce(jsonb_agg(c), '[]'::jsonb) into nieuwe_conflicten
    from jsonb_array_elements(t.conflicten) c
   where c->>'exemplaar_id' is distinct from oud::text;

  update public.transacties
     set regels = (
           select jsonb_agg(
                    case when x->>'exemplaar_id' = oud::text and x->>'richting' = 'uit'
                         then x || jsonb_build_object('exemplaar_id', e.id, 'code', e.code, 'naam', e.naam,
                                                      'hartjesprijs', coalesce(e.hartjesprijs, e.verkoopprijs),
                                                      'aankoopprijs', e.aankoopprijs)
                         else x end
                    order by nr)
             from jsonb_array_elements(t.regels) with ordinality as lijst (x, nr)),
         conflicten = nieuwe_conflicten,
         status = case when jsonb_array_length(nieuwe_conflicten) > 0 then 'conflict' else 'ok' end
   where id = tid
  returning * into t;
  return t;
end;
$$;

-- Een conflict laten zoals het is: het geld telt, de voorraad verandert niet.
create or replace function public.aanvaard_conflict(tid uuid, item text)
returns public.transacties
language plpgsql
security invoker
set search_path = public
as $$
declare
  t public.transacties;
  rest jsonb;
begin
  select * into t from public.transacties where id = tid for update;
  if not found then
    raise exception 'Onbekende transactie';
  end if;
  select coalesce(jsonb_agg(c), '[]'::jsonb) into rest
    from jsonb_array_elements(t.conflicten) c
   where c->>'exemplaar_id' is distinct from item and c->>'artikel_id' is distinct from item;
  update public.transacties
     set conflicten = rest, status = case when jsonb_array_length(rest) > 0 then 'conflict' else 'ok' end
   where id = tid
  returning * into t;
  return t;
end;
$$;

revoke all on function public.boek_transactie(jsonb), public.maak_ongedaan(uuid),
  public.los_conflict_op(uuid, uuid, uuid), public.aanvaard_conflict(uuid, text) from public, anon;
grant execute on function public.boek_transactie(jsonb), public.maak_ongedaan(uuid),
  public.los_conflict_op(uuid, uuid, uuid), public.aanvaard_conflict(uuid, text) to authenticated;

-- ── Publieke catalogus (de klantenpagina) ────────────────────────────────────
-- Weergaven met de rechten van de eigenaar: ze tonen enkel deze kolommen en enkel wat
-- in de catalogus (vitrine) ligt, ook al kan de publieke sleutel de tabellen zelf niet lezen.
-- Nooit zichtbaar voor klanten: de vault (stockdoos), aankoopprijzen, reservaties, transacties.
create or replace view public.publieke_vitrine as
  select kaart_id, catalogus, afbeelding, soort, naam, set_naam, set_code, nummer, taal, conditie,
         variant, grader, grade, hartjesprijs as prijs,
         code, naam_origineel, hartjesdatum as sinds
    from public.exemplaren
   where opslag = 'vitrine' and status = 'in voorraad' and hartjesprijs is not null;

create or replace view public.publieke_artikelen as
  select id, naam, soort, prijs, aantal
    from public.artikelen
   where opslag = 'vitrine' and aantal > 0 and prijs is not null;

-- Instellingen die de klantenpagina nodig heeft (bv. de Instagram-naam).
create or replace view public.publieke_instellingen as
  select sleutel, waarde
    from public.instellingen
   where sleutel in ('instagram', 'catalogus_tekst');

revoke all on public.publieke_vitrine, public.publieke_artikelen, public.publieke_instellingen from anon;
grant select on public.publieke_vitrine, public.publieke_artikelen, public.publieke_instellingen to anon, authenticated;

-- ── Beheerders toevoegen ─────────────────────────────────────────────────────
-- Doe dit pas nadat de drie accounts bestaan (Authentication › Users › Add user).
-- Kopieer het stuk hieronder naar een nieuwe query, haal de -- weg, vul de
-- e-mailadressen en namen in en voer het uit:
--
-- insert into public.beheerders (user_id, naam)
-- select id, naam
--   from auth.users
--   join (values
--     ('eerste@voorbeeld.be', 'Naam 1'),
--     ('tweede@voorbeeld.be', 'Naam 2'),
--     ('derde@voorbeeld.be',  'Naam 3')
--   ) as lijst (mail, naam) on lower(auth.users.email) = lower(lijst.mail)
-- on conflict (user_id) do update set naam = excluded.naam;
--
-- Controle (moet 3 rijen geven):
-- select b.naam, u.email from public.beheerders b join auth.users u on u.id = b.user_id;
