-- Bind'r Stock & Beurs App — databaseschema (versie 0.13: binders vooraan zonder achtergrond, een Instagram-strook en thema's per seizoen)
--
-- Uitvoeren: Supabase-dashboard › SQL Editor › New query › dit hele bestand plakken › Run.
-- Het script mag gerust een tweede keer lopen; het overschrijft geen gegevens.
--
-- Let op vanaf 0.5: klanten zien een kaart pas als het label geplakt is (label_status
-- 'gestickerd'). Kaarten met een geprint maar niet bevestigd label verdwijnen dus van de
-- klantenpagina tot je ze in de app bevestigt (Labels › Nog te plakken › Zijn geplakt).
--
-- Beveiliging in het kort:
--   * Enkel wie in de tabel `beheerders` staat, kan iets lezen of wijzigen.
--   * De publieke sleutel in de app geeft zonder login alleen leestoegang tot de
--     publieke weergaven (catalogus, binders, komende beurzen), nooit aankoopprijzen.
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

-- ── Omgevingen: Bind'r en Brent houden elk hun eigen stock en kassa bij ──────
-- Elke omgeving heeft een eigen catalogus, vault, kassa en beurzen. De klantenpagina
-- toont samen wat in de omgevingen met "zichtbaar voor klanten" ligt.
create table if not exists public.omgevingen (
  id                     uuid primary key default gen_random_uuid(),
  naam                   text not null unique,
  volgorde               integer not null default 0,
  zichtbaar_voor_klanten boolean not null default true,
  aangemaakt_op          timestamptz not null default now()
);
insert into public.omgevingen (naam, volgorde) values ('Bind''r', 1), ('Brent', 2) on conflict (naam) do nothing;

-- De eerste omgeving: daar komt alles terecht dat (nog) geen omgeving meekrijgt.
create or replace function public.standaard_omgeving()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.omgevingen order by volgorde, aangemaakt_op limit 1;
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
                     check (status in ('in voorraad', 'verkocht', 'geruild', 'weg')),
  gereserveerd_voor text,               -- niet meer gebruikt (reserveren is geschrapt)
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
alter table public.exemplaren add column if not exists vitrine_sinds timestamptz; -- sinds wanneer in de catalogus

-- Reserveren bestaat niet meer: wat nog gereserveerd stond, ligt gewoon in voorraad.
update public.exemplaren set status = 'in voorraad', gereserveerd_voor = null where status = 'gereserveerd';
alter table public.exemplaren drop constraint if exists exemplaren_status_check;
alter table public.exemplaren add constraint exemplaren_status_check
  check (status in ('in voorraad', 'verkocht', 'geruild', 'weg'));

create index if not exists exemplaren_kaart_idx  on public.exemplaren (kaart_id);
create index if not exists exemplaren_status_idx on public.exemplaren (status, opslag);

-- ── Artikelen: wat per aantal gaat (booster packs, 3D-prints) ───────────────
create table if not exists public.artikelen (
  id            uuid primary key default gen_random_uuid(),
  naam          text not null,
  soort         text not null default 'sealed' check (soort in ('sealed', 'eigen product', 'andere')),
  aantal        integer not null default 0 check (aantal >= 0),
  prijs         numeric(10, 2),
  opslag        text not null default 'vitrine' check (opslag in ('vitrine', 'stockdoos')),
  opmerking     text,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_door uuid,
  gewijzigd_op  timestamptz not null default now()
);

-- Bulk bestaat niet meer.
update public.artikelen set soort = 'andere' where soort = 'bulk';
alter table public.artikelen drop constraint if exists artikelen_soort_check;
alter table public.artikelen add constraint artikelen_soort_check check (soort in ('sealed', 'eigen product', 'andere'));

-- ── Instellingen die de drie beheerders delen (drempels, conditiefactoren) ───
create table if not exists public.instellingen (
  sleutel  text primary key,
  waarde   jsonb not null,
  gewijzigd_op timestamptz not null default now()
);

-- Standaard: ons Instagram-account (de klantenpagina linkt ernaar).
insert into public.instellingen (sleutel, waarde) values ('instagram', '"bindrstudio"') on conflict (sleutel) do nothing;

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

-- ── Omgeving koppelen aan alles; bestaande gegevens horen bij Bind'r ────────
do $$
declare
  tabel text;
begin
  foreach tabel in array array['exemplaren', 'artikelen', 'beurzen', 'transacties'] loop
    execute format('alter table public.%I add column if not exists omgeving_id uuid references public.omgevingen (id)', tabel);
    execute format('update public.%I set omgeving_id = public.standaard_omgeving() where omgeving_id is null', tabel);
    execute format('alter table public.%I alter column omgeving_id set default public.standaard_omgeving()', tabel);
    execute format('alter table public.%I alter column omgeving_id set not null', tabel);
    execute format('create index if not exists %I on public.%I (omgeving_id)', tabel || '_omgeving_idx', tabel);
  end loop;
end
$$;

-- Wat sinds 15 okt 2026 bijkwam:
alter table public.exemplaren add column if not exists nieuw_hartje numeric(10, 2); -- prijscheck: dit hartje moet erop (null = klopt)
alter table public.beurzen add column if not exists locatie text;                    -- voor "komende beurzen" op de klantenpagina
alter table public.transacties add column if not exists gewijzigd_op timestamptz not null default now();
alter table public.transacties add column if not exists gewijzigd_door uuid;

-- ── Versie 0.5: artikels (binders, sealed) met foto en details, graded kaarten ─
alter table public.artikelen add column if not exists aankoopprijs numeric(10, 2);      -- per stuk: wat het ons kostte
alter table public.artikelen add column if not exists foto text;                        -- eigen foto, verkleind (data:image/…)
alter table public.artikelen add column if not exists details jsonb not null default '{}'::jsonb; -- type, grootte, artwork, techniek …
alter table public.artikelen add column if not exists cardmarket_id integer;            -- sealed: het product op Cardmarket
alter table public.exemplaren add column if not exists cert text;                       -- graded: certificaatnummer
alter table public.exemplaren add column if not exists verkopen jsonb;                  -- graded: opgezochte verkopen [{datum, prijs, bron}]
-- Een foto is altijd een kleine afbeelding, nooit een link of iets anders.
alter table public.artikelen drop constraint if exists artikelen_foto_check;
alter table public.artikelen add constraint artikelen_foto_check
  check (foto is null or (length(foto) <= 600000 and foto ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));
alter table public.artikelen drop constraint if exists artikelen_details_check;
alter table public.artikelen add constraint artikelen_details_check check (jsonb_typeof(details) = 'object');

-- ── Versie 0.6: eigen kaartfoto's en boekhouding ────────────────────────────
-- Een eigen foto voor een kaart waarvan nergens een foto bestaat (bv. een nieuwe Japanse promo).
alter table public.exemplaren add column if not exists foto text;
alter table public.exemplaren drop constraint if exists exemplaren_foto_check;
alter table public.exemplaren add constraint exemplaren_foto_check
  check (foto is null or (length(foto) <= 600000 and foto ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));
-- Overschrijving (boven de cashgrens van € 3.000) en de tegenpartij voor het aankoop- of ruilborderel:
-- naam, adres, particulier of handelaar, identiteit nagekeken, handtekeningen (SVG-pad). Nooit publiek.
alter table public.transacties add column if not exists bank numeric(10, 2) not null default 0;
alter table public.transacties add column if not exists tegenpartij jsonb;
alter table public.transacties drop constraint if exists transacties_tegenpartij_check;
alter table public.transacties add constraint transacties_tegenpartij_check
  check (tegenpartij is null or (jsonb_typeof(tegenpartij) = 'object' and length(tegenpartij::text) <= 40000));
-- "kas": geld in of uit de cashkoffer zonder verkoop (wisselgeld, bijleggen, afhalen). Geen omzet.
alter table public.transacties drop constraint if exists transacties_soort_check;
alter table public.transacties add constraint transacties_soort_check
  check (soort in ('verkoop', 'ruil', 'inkoop', 'retour', 'kas', 'prive'));
-- "prive" (0.7): kaarten tussen de privécollectie van de zaakvoerder en de zaak, zonder geld.

-- ── Versie 0.7: foto's bij een aankoop (het bewijs: de gekochte kaarten, een screenshot) ──
-- Apart van de transacties: die worden bij elke synchronisatie geladen, de foto's enkel als je ze bekijkt.
create table if not exists public.aankoopfotos (
  id             uuid primary key,                 -- gemaakt op de gsm (veilig opnieuw te versturen)
  transactie_id  uuid not null references public.transacties (id),
  foto           text not null,
  omgeving_id    uuid references public.omgevingen (id) default public.standaard_omgeving(),
  aangemaakt_door uuid default auth.uid(),
  aangemaakt_op  timestamptz not null default now()
);
alter table public.aankoopfotos drop constraint if exists aankoopfotos_foto_check;
alter table public.aankoopfotos add constraint aankoopfotos_foto_check
  check (length(foto) <= 900000 and foto ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$');
create index if not exists aankoopfotos_transactie_idx on public.aankoopfotos (transactie_id);

-- ── Wie is er bezig? Elk toestel meldt zich om de minuut ────────────────────
create table if not exists public.aanwezig (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  omgeving_id uuid references public.omgevingen (id) on delete set null,
  scherm      text,
  laatst      timestamptz not null default now()
);

-- ── Versie 0.9: beurzen op de klantenpagina, artikels per stuk zichtbaar ──────
alter table public.beurzen add column if not exists uren text;  -- bv. "10:00–17:00", komt op de klantenpagina
alter table public.beurzen add column if not exists link text;  -- website van de beurs (enkel http/https)
alter table public.beurzen drop constraint if exists beurzen_link_check;
alter table public.beurzen add constraint beurzen_link_check
  check (link is null or (link ~* '^https?://[^[:space:]<>"]+$' and length(link) <= 500));
alter table public.beurzen drop constraint if exists beurzen_uren_check;
alter table public.beurzen add constraint beurzen_uren_check check (uren is null or length(uren) <= 80);
-- Op de klantenpagina: true = altijd, false = nooit, leeg = zoals vroeger (in de catalogus, of een binder).
alter table public.artikelen add column if not exists zichtbaar boolean;

-- ── Versie 0.10: etalage, meer foto's per artikel, aanvragen voor een eigen binder ──
-- Etalage: foto's van ons werk die op de startpagina van de klanten zweven (zoals op Instagram).
create table if not exists public.etalage (
  id            uuid primary key,                  -- gemaakt op de gsm (veilig opnieuw te versturen)
  foto          text not null,
  titel         text,
  link          text,                              -- bv. het bericht op Instagram (enkel http/https)
  volgorde      integer not null default 0,
  omgeving_id   uuid references public.omgevingen (id) default public.standaard_omgeving(),
  aangemaakt_door uuid default auth.uid(),
  aangemaakt_op timestamptz not null default now()
);
alter table public.etalage drop constraint if exists etalage_foto_check;
alter table public.etalage add constraint etalage_foto_check
  check (length(foto) <= 700000 and foto ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') not valid;
alter table public.etalage drop constraint if exists etalage_tekst_check;
alter table public.etalage add constraint etalage_tekst_check
  check ((titel is null or length(titel) <= 120) and (link is null or (link ~* '^https?://[^[:space:]<>"]+$' and length(link) <= 500))) not valid;

-- Meer foto's bij een artikel (de eerste blijft artikelen.foto).
create table if not exists public.artikelfotos (
  id            uuid primary key,
  artikel_id    uuid not null references public.artikelen (id) on delete cascade,
  foto          text not null,
  volgorde      integer not null default 0,
  aangemaakt_op timestamptz not null default now()
);
alter table public.artikelfotos drop constraint if exists artikelfotos_foto_check;
alter table public.artikelfotos add constraint artikelfotos_foto_check
  check (length(foto) <= 600000 and foto ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') not valid;
create index if not exists artikelfotos_artikel_idx on public.artikelfotos (artikel_id, volgorde);

-- Aanvragen van klanten voor een eigen binder (het formulier op de klantenpagina). Klanten kunnen
-- enkel een aanvraag toevoegen, nooit lezen; beheerders zien ze in de app (Profiel › Aanvragen).
create table if not exists public.aanvragen (
  id            uuid primary key default gen_random_uuid(),
  naam          text not null,
  email         text not null,
  telefoon      text,
  grootte       text,
  kleur         text,
  idee          text not null,
  artwork       text,                              -- hun ontwerp (omgezet naar een afbeelding)
  voorbeeld     text,                              -- hoe het er op de binder uitzag
  status        text not null default 'nieuw' check (status in ('nieuw', 'bekeken', 'beantwoord', 'gesloten')),
  omgeving_id   uuid references public.omgevingen (id) default public.standaard_omgeving(),
  aangemaakt_op timestamptz not null default now()
);
alter table public.aanvragen drop constraint if exists aanvragen_velden_check;
alter table public.aanvragen add constraint aanvragen_velden_check check (
  length(trim(naam)) between 1 and 120
  and length(email) <= 200 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  and (telefoon is null or length(telefoon) <= 40)
  and (grootte is null or length(grootte) <= 40) and (kleur is null or length(kleur) <= 40)
  and length(trim(idee)) between 1 and 4000
  and (artwork is null or (length(artwork) <= 450000 and artwork ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'))
  and (voorbeeld is null or (length(voorbeeld) <= 250000 and voorbeeld ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'))
) not valid;
create index if not exists aanvragen_tijd_idx on public.aanvragen (aangemaakt_op desc);

-- 0.11: toploader ja/nee en tot drie afbeeldingen van het idee (foto's, schetsen, screenshots).
alter table public.aanvragen add column if not exists toploader boolean;
alter table public.aanvragen add column if not exists beelden text[];
create or replace function public.beelden_ok(b text[])
returns boolean
language sql
immutable
as $$
  select b is null or (
    coalesce(array_length(b, 1), 0) <= 3
    and not exists (select 1 from unnest(b) x where x is null or length(x) > 250000 or x !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
  )
$$;
alter table public.aanvragen drop constraint if exists aanvragen_beelden_check;
alter table public.aanvragen add constraint aanvragen_beelden_check check (public.beelden_ok(beelden)) not valid;

-- Tegen spam en een volle database: hoogstens 20 aanvragen per uur en 60 per dag in totaal, 3 per e-mailadres
-- per dag. Afbeeldingen bewaren we van hoogstens 10 aanvragen per dag en zolang er minder dan 40 open aanvragen
-- met afbeeldingen zijn (daarna enkel de tekst): zo blijven de afbeeldingen samen onder ~30 MB. Het slot zorgt
-- dat veel aanvragen tegelijk elkaar zien (anders tellen ze allemaal enkel wat al bewaard was).
create or replace function public.aanvraag_rem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('bindr-aanvragen'));
  if coalesce(array_length(new.beelden, 1), 0) = 0 then
    new.beelden := null; -- een lege lijst telt niet als afbeeldingen
  end if;
  if (select count(*) from public.aanvragen where aangemaakt_op > now() - interval '1 hour') >= 20
     or (select count(*) from public.aanvragen where aangemaakt_op > now() - interval '1 day') >= 60 then
    raise exception 'Te veel aanvragen op korte tijd. Probeer het straks opnieuw.';
  end if;
  if (select count(*) from public.aanvragen where lower(email) = lower(new.email) and aangemaakt_op > now() - interval '1 day') >= 3 then
    raise exception 'Je stuurde vandaag al drie aanvragen. We antwoorden zo snel mogelijk.';
  end if;
  if (new.artwork is not null or new.voorbeeld is not null or new.beelden is not null) and (
       (select count(*) from public.aanvragen where aangemaakt_op > now() - interval '1 day' and (artwork is not null or voorbeeld is not null or beelden is not null)) >= 10
       or (select count(*) from public.aanvragen where status in ('nieuw', 'bekeken') and (artwork is not null or voorbeeld is not null or beelden is not null)) >= 40) then
    new.artwork := null;
    new.voorbeeld := null;
    new.beelden := null;
  end if;
  new.status := 'nieuw';
  new.aangemaakt_op := now();
  return new;
end;
$$;
drop trigger if exists aanvragen_rem on public.aanvragen;
create trigger aanvragen_rem before insert on public.aanvragen
  for each row execute function public.aanvraag_rem();

-- ── Versie 0.13: binders vooraan, de Instagram-strook en thema's per seizoen ──
-- De etalage krijgt twee plaatsen: 'voorpagina' (uitgeknipte foto's van onze binders, bovenaan in de waaier)
-- en 'instagram' (de doorlopende strook met onze laatste berichten). Wat er al stond, komt in de strook.
alter table public.etalage add column if not exists plek text not null default 'instagram';
alter table public.etalage drop constraint if exists etalage_plek_check;
alter table public.etalage add constraint etalage_plek_check check (plek in ('instagram', 'voorpagina'));
create index if not exists etalage_plek_idx on public.etalage (plek, volgorde);

-- Thema's: een feest of seizoen (Halloween, kerst …) met een eigen logo, kleur, versiering en een korte tekst op
-- de klantenpagina. Elk jaar opnieuw tussen van en tot (maand-dag, ook over nieuwjaar heen), of met de hand aan of uit.
create table if not exists public.themas (
  id            text primary key,                  -- 'halloween', 'kerst' … (de versiering hangt eraan)
  naam          text not null,
  van           text,                              -- 'MM-DD'
  tot           text,                              -- 'MM-DD' (mag vóór van liggen: dan over nieuwjaar)
  aan           text not null default 'periode',   -- 'periode', 'aan' (nu, met de hand) of 'uit'
  kleur         text,                              -- '#rrggbb'
  tekst         text,                              -- een korte zin bovenaan de klantenpagina
  logo          text,                              -- een eigen logo voor dat feest (data-URL)
  gewijzigd_op  timestamptz not null default now()
);
alter table public.themas drop constraint if exists themas_check;
alter table public.themas add constraint themas_check check (
  id ~ '^[a-z0-9-]{1,30}$' and length(trim(naam)) between 1 and 40
  and (van is null or van ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
  and (tot is null or tot ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
  and aan in ('periode', 'aan', 'uit')
  and (kleur is null or kleur ~ '^#[0-9a-fA-F]{6}$')
  and (tekst is null or length(tekst) <= 120)
  and (logo is null or (length(logo) <= 400000 and logo ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$'))
);

-- ── Triggers: gewijzigd_op bijhouden en elke wijziging loggen ────────────────
-- Ook bij een nieuwe rij zet de server zelf gewijzigd_op: zo ziet de 30-secondensynchronisatie van de
-- andere gsm's ook kaarten die offline werden toegevoegd (met een oudere tijd van de gsm).
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

create or replace function public.zonder_foto(r jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when r ? 'foto' then (r - 'foto') || jsonb_build_object('foto', case when r->>'foto' is null then null else md5(r->>'foto') end) else r end
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
  -- Foto's (tot ~450 kB) niet in het logboek: enkel dat er een foto is of dat ze wijzigde.
  if tg_op = 'INSERT' then
    insert into public.logboek (tabel, rij_id, actie, wijziging)
    values (tg_table_name, new.id, 'toegevoegd', zonder_foto(to_jsonb(new)));
    return new;
  elsif tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('van', o.value, 'naar', n.value)), '{}'::jsonb)
      into verschil
      from jsonb_each(zonder_foto(to_jsonb(new))) n
      join jsonb_each(zonder_foto(to_jsonb(old))) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('gewijzigd_op', 'gewijzigd_door');
    if verschil <> '{}'::jsonb then
      insert into public.logboek (tabel, rij_id, actie, wijziging)
      values (tg_table_name, new.id, 'gewijzigd', verschil);
    end if;
    return new;
  else
    insert into public.logboek (tabel, rij_id, actie, wijziging)
    values (tg_table_name, old.id, 'verwijderd', zonder_foto(to_jsonb(old)));
    return old;
  end if;
end;
$$;

-- Sinds wanneer ligt een exemplaar in de catalogus? Voor "Nieuw" op de klantenpagina.
create or replace function public.zet_vitrine_sinds()
returns trigger
language plpgsql
as $$
begin
  if new.opslag = 'vitrine' and (tg_op = 'INSERT' or old.opslag is distinct from 'vitrine') then
    new.vitrine_sinds := now();
  elsif new.opslag <> 'vitrine' then
    new.vitrine_sinds := null;
  end if;
  return new;
end;
$$;

drop trigger if exists exemplaren_vitrine_sinds on public.exemplaren;
create trigger exemplaren_vitrine_sinds before insert or update on public.exemplaren
  for each row execute function public.zet_vitrine_sinds();

update public.exemplaren
   set vitrine_sinds = coalesce(hartjesdatum::timestamptz, aangemaakt_op)
 where opslag = 'vitrine' and vitrine_sinds is null;

create or replace function public.zet_laatst()
returns trigger
language plpgsql
as $$
begin
  new.laatst := now();
  return new;
end;
$$;

drop trigger if exists aanwezig_laatst on public.aanwezig;
create trigger aanwezig_laatst before insert or update on public.aanwezig
  for each row execute function public.zet_laatst();

drop trigger if exists transacties_gewijzigd on public.transacties;
create trigger transacties_gewijzigd before insert or update on public.transacties
  for each row execute function public.zet_gewijzigd();

-- De transacties zijn het dagontvangstenboek: elke wijziging blijft zichtbaar in het logboek.
drop trigger if exists transacties_log on public.transacties;
create trigger transacties_log after insert or update or delete on public.transacties
  for each row execute function public.log_wijziging();

drop trigger if exists exemplaren_gewijzigd on public.exemplaren;
create trigger exemplaren_gewijzigd before insert or update on public.exemplaren
  for each row execute function public.zet_gewijzigd();
drop trigger if exists exemplaren_log on public.exemplaren;
create trigger exemplaren_log after insert or update or delete on public.exemplaren
  for each row execute function public.log_wijziging();

drop trigger if exists beurzen_gewijzigd on public.beurzen;
create trigger beurzen_gewijzigd before insert or update on public.beurzen
  for each row execute function public.zet_gewijzigd();
drop trigger if exists beurzen_log on public.beurzen;
create trigger beurzen_log after insert or update or delete on public.beurzen
  for each row execute function public.log_wijziging();

drop trigger if exists artikelen_gewijzigd on public.artikelen;
create trigger artikelen_gewijzigd before insert or update on public.artikelen
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
alter table public.omgevingen   enable row level security;
alter table public.aanwezig     enable row level security;

drop policy if exists "beheerders alles" on public.omgevingen;
create policy "beheerders alles" on public.omgevingen
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

drop policy if exists "beheerders lezen" on public.aanwezig;
create policy "beheerders lezen" on public.aanwezig
  for select to authenticated using (public.is_beheerder());
drop policy if exists "eigen rij" on public.aanwezig;
create policy "eigen rij" on public.aanwezig
  for all to authenticated using (public.is_beheerder() and user_id = auth.uid()) with check (public.is_beheerder() and user_id = auth.uid());

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

-- Transacties worden nooit gewist (verbeteren gebeurt met een nieuwe boeking of "ongedaan"):
-- lezen, toevoegen en wijzigen wel, verwijderen niet.
drop policy if exists "beheerders alles" on public.transacties;
drop policy if exists "beheerders lezen" on public.transacties;
drop policy if exists "beheerders toevoegen" on public.transacties;
drop policy if exists "beheerders wijzigen" on public.transacties;
create policy "beheerders lezen" on public.transacties
  for select to authenticated using (public.is_beheerder());
create policy "beheerders toevoegen" on public.transacties
  for insert to authenticated with check (public.is_beheerder());
create policy "beheerders wijzigen" on public.transacties
  for update to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

alter table public.aankoopfotos enable row level security;
drop policy if exists "beheerders alles" on public.aankoopfotos;
create policy "beheerders alles" on public.aankoopfotos
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

alter table public.etalage enable row level security;
drop policy if exists "beheerders alles" on public.etalage;
create policy "beheerders alles" on public.etalage
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

alter table public.themas enable row level security;
drop policy if exists "beheerders alles" on public.themas;
create policy "beheerders alles" on public.themas
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

alter table public.artikelfotos enable row level security;
drop policy if exists "beheerders alles" on public.artikelfotos;
create policy "beheerders alles" on public.artikelfotos
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

-- Aanvragen: iedereen mag er één toevoegen (enkel deze kolommen), enkel beheerders lezen en beheren.
alter table public.aanvragen enable row level security;
drop policy if exists "beheerders alles" on public.aanvragen;
create policy "beheerders alles" on public.aanvragen
  for all to authenticated using (public.is_beheerder()) with check (public.is_beheerder());
drop policy if exists "iedereen indienen" on public.aanvragen;
create policy "iedereen indienen" on public.aanvragen
  for insert to anon, authenticated with check (status = 'nieuw');

-- ── Rechten voor de app (REST-API) ───────────────────────────────────────────
-- Nieuwere Supabase-projecten geven nieuwe tabellen niet altijd automatisch vrij
-- aan de API. Daarom expliciet: ingelogde gebruikers mogen de tabellen aanspreken
-- (de rijbeveiliging hierboven beslist wat ze echt zien), de publieke sleutel niets.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.exemplaren, public.artikelen, public.instellingen, public.beurzen, public.transacties, public.omgevingen, public.aanwezig, public.aankoopfotos,
  public.etalage, public.artikelfotos, public.aanvragen, public.themas to authenticated;
grant select on public.beheerders, public.logboek to authenticated;
grant execute on function public.is_beheerder(), public.standaard_omgeving() to authenticated;
revoke all on public.beheerders, public.exemplaren, public.artikelen, public.instellingen, public.logboek, public.beurzen, public.transacties, public.omgevingen, public.aanwezig, public.aankoopfotos,
  public.etalage, public.artikelfotos, public.themas from anon;
-- Een aanvraag indienen (Ontwerp je binder): enkel toevoegen, met deze kolommen; de omgeving komt van standaard_omgeving().
revoke all on public.aanvragen from anon;
grant insert (naam, email, telefoon, grootte, kleur, idee, artwork, voorbeeld, toploader, beelden) on public.aanvragen to anon;
grant execute on function public.standaard_omgeving() to anon;
grant execute on function public.beelden_ok(text[]) to anon, authenticated;

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
  verworven  text[];  -- kaarten die al gekocht of ingebracht zijn (pas berekend als het nodig is)
  v_soort    text := t->>'soort';
  tid        uuid := (t->>'id')::uuid;
  v_tijd     timestamptz := coalesce((t->>'tijd')::timestamptz, now());
  v_omgeving uuid := coalesce(nullif(t->>'omgeving_id', '')::uuid, public.standaard_omgeving());
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

    if v_soort = 'kas' then
      continue; -- geld in of uit de koffer: geen voorraad
    end if;

    if v_soort in ('retour', 'prive') and r->>'richting' = 'uit' then
      -- Een ruil of inkoop terugdraaien (we geven hun stuk terug), of naar privé: het moet nog in voorraad zijn.
      if r->>'exemplaar_id' is not null then
        select * into e from public.exemplaren where id = (r->>'exemplaar_id')::uuid for update;
        if not found then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'onbekend exemplaar');
        elsif e.status <> 'in voorraad' then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'al ' || e.status);
        else
          update public.exemplaren set status = 'weg', transactie_id = tid, afgeboekt_op = v_tijd where id = e.id;
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
      continue;
    end if;

    if v_soort = 'retour' then
      if r->>'exemplaar_id' is not null then
        select * into e from public.exemplaren where id = (r->>'exemplaar_id')::uuid for update;
        if not found then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'onbekend exemplaar');
        elsif e.status = 'in voorraad' then
          -- Twee keer terugnemen kan niet.
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'al in voorraad');
        else
          update public.exemplaren set status = 'in voorraad', transactie_id = null, afgeboekt_op = null where id = e.id;
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
        elsif e.status <> 'in voorraad' then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'al ' || e.status);
        elsif e.omgeving_id <> v_omgeving then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'van een andere omgeving');
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
                   'aankoopbron', case when v_soort = 'ruil' then 'ruil' when v_soort = 'prive' then 'privé' else 'beurs' end, 'omgeving_id', v_omgeving,
                   'aangemaakt_door', auth.uid(), 'aangemaakt_op', v_tijd, 'gewijzigd_op', v_tijd)
                 || jsonb_strip_nulls(r->'nieuw')
                 || jsonb_build_object('status', 'in voorraad', 'label_status', 'te printen', 'omgeving_id', v_omgeving,
                                       'aankoopprijs', r->'prijs', 'aankoopdatum', (v_tijd at time zone 'Europe/Brussels')::date);
        insert into public.exemplaren
          select * from jsonb_populate_record(null::public.exemplaren, nieuw)
          on conflict (id) do nothing;
      elsif v_soort = 'prive' and r->>'exemplaar_id' is not null then
        -- 0.8: een kaart die al in de app stond, uit privé ingebracht. Ze krijgt haar inbrengwaarde als
        -- aankoopprijs; nooit twee keer, en enkel als ze nog in voorraad ligt (zoals pasToe in kassa.ts).
        if verworven is null then
          verworven := array(
            select coalesce(x->'nieuw'->>'id', x->>'exemplaar_id')
              from public.transacties t2, jsonb_array_elements(t2.regels) x
             where t2.status <> 'ongedaan' and t2.soort <> 'retour' and x->>'richting' = 'in'
               and (jsonb_typeof(x->'nieuw') = 'object' or (t2.soort = 'prive' and x->>'exemplaar_id' is not null))
               and not exists (select 1 from jsonb_array_elements(t2.conflicten) c
                                where c->>'exemplaar_id' = coalesce(x->'nieuw'->>'id', x->>'exemplaar_id')));
        end if;
        select * into e from public.exemplaren where id = (r->>'exemplaar_id')::uuid for update;
        if not found then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'onbekend exemplaar');
        elsif e.status <> 'in voorraad' then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'al ' || e.status);
        elsif e.omgeving_id <> v_omgeving then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'van een andere omgeving');
        elsif e.id::text = any (verworven) then
          conflicten := conflicten || jsonb_build_object('exemplaar_id', r->>'exemplaar_id', 'reden', 'al gekocht of ingebracht');
        else
          update public.exemplaren
             set aankoopprijs = (r->>'prijs')::numeric, aankoopbron = 'privé',
                 aankoopdatum = (v_tijd at time zone 'Europe/Brussels')::date
           where id = e.id;
          verworven := verworven || e.id::text;
        end if;
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = aantal + n where id = (r->>'artikel_id')::uuid;
        if not found then
          conflicten := conflicten || jsonb_build_object('artikel_id', r->>'artikel_id', 'reden', 'onbekend artikel');
        end if;
      end if;
    end if;
  end loop;

  insert into public.transacties (id, omgeving_id, beurs_id, soort, tijd, regels, totaal, cash, sumup, bank, tegenpartij, status, conflicten, opmerking)
  values (tid, v_omgeving, nullif(t->>'beurs_id', '')::uuid, v_soort, v_tijd, coalesce(t->'regels', '[]'::jsonb),
          coalesce((t->>'totaal')::numeric, 0), coalesce((t->>'cash')::numeric, 0), coalesce((t->>'sumup')::numeric, 0),
          coalesce((t->>'bank')::numeric, 0), case when jsonb_typeof(t->'tegenpartij') = 'object' then t->'tegenpartij' end,
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
    if t.soort in ('retour', 'prive') and r->>'richting' = 'uit' then
      -- Het teruggegeven (of naar privé gebrachte) stuk komt weer in voorraad.
      if r->>'exemplaar_id' is not null and not (r->>'exemplaar_id' = any (in_conflict)) then
        update public.exemplaren
           set status = 'in voorraad', transactie_id = null, afgeboekt_op = null
         where id = (r->>'exemplaar_id')::uuid and transactie_id = tid;
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = aantal + n where id = (r->>'artikel_id')::uuid;
      end if;
    elsif t.soort = 'retour' then
      if r->>'exemplaar_id' is not null and not (r->>'exemplaar_id' = any (in_conflict)) then
        update public.exemplaren
           set status = case when r->>'vorige_status' in ('verkocht', 'geruild', 'weg') then r->>'vorige_status' else 'verkocht' end,
               afgeboekt_op = coalesce(nullif(r->>'vorige_afgeboekt_op', '')::timestamptz, t.tijd),
               transactie_id = coalesce(nullif(r->>'vorige_transactie_id', '')::uuid, transactie_id)
         where id = (r->>'exemplaar_id')::uuid;
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = greatest(0, aantal - n) where id = (r->>'artikel_id')::uuid;
      end if;
    elsif r->>'richting' = 'uit' then
      if r->>'exemplaar_id' is not null and not (r->>'exemplaar_id' = any (in_conflict)) then
        update public.exemplaren
           set status = 'in voorraad', transactie_id = null, afgeboekt_op = null
         where id = (r->>'exemplaar_id')::uuid and transactie_id = tid;
      elsif r->>'artikel_id' is not null then
        update public.artikelen set aantal = aantal + n where id = (r->>'artikel_id')::uuid;
      end if;
    else
      if jsonb_typeof(r->'nieuw') = 'object' then
        delete from public.exemplaren where id = (r->'nieuw'->>'id')::uuid and status = 'in voorraad';
      elsif t.soort = 'prive' and r->>'exemplaar_id' is not null then
        -- Ingebracht terwijl ze al in de app stond: de vorige aankoopgegevens terug.
        if not (r->>'exemplaar_id' = any (in_conflict)) then
          update public.exemplaren
             set aankoopprijs = nullif(r->>'vorige_aankoopprijs', '')::numeric,
                 aankoopbron = r->>'vorige_aankoopbron',
                 aankoopdatum = nullif(r->>'vorige_aankoopdatum', '')::date
           where id = (r->>'exemplaar_id')::uuid;
        end if;
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
  if e.status <> 'in voorraad' then
    raise exception 'Dat exemplaar is ook al %', e.status;
  end if;
  if e.omgeving_id <> t.omgeving_id then
    raise exception 'Dat exemplaar hoort bij een andere omgeving';
  end if;

  update public.exemplaren
     set status = case when t.soort = 'ruil' then 'geruild' when t.soort in ('retour', 'prive') then 'weg' else 'verkocht' end,
         transactie_id = tid, afgeboekt_op = t.tijd
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

-- Prijzen nakijken: welke hartjes moeten wisselen, gedeeld door alle toestellen van een omgeving.
-- lijst = [{ "id": "...", "nieuw": 12 }, ...]; wat niet in de lijst staat, klopt weer.
create or replace function public.markeer_prijzen(omgeving uuid, lijst jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_beheerder() then
    raise exception 'Enkel beheerders kunnen prijzen nakijken';
  end if;
  update public.exemplaren
     set nieuw_hartje = null
   where omgeving_id = omgeving and nieuw_hartje is not null
     and id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(lijst, '[]'::jsonb)) x);
  update public.exemplaren e
     set nieuw_hartje = (x->>'nieuw')::numeric
    from jsonb_array_elements(coalesce(lijst, '[]'::jsonb)) x
   where e.id = (x->>'id')::uuid and e.omgeving_id = omgeving
     and e.nieuw_hartje is distinct from (x->>'nieuw')::numeric;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.boek_transactie(jsonb), public.maak_ongedaan(uuid),
  public.los_conflict_op(uuid, uuid, uuid), public.aanvaard_conflict(uuid, text), public.markeer_prijzen(uuid, jsonb) from public, anon;
grant execute on function public.boek_transactie(jsonb), public.maak_ongedaan(uuid),
  public.los_conflict_op(uuid, uuid, uuid), public.aanvaard_conflict(uuid, text), public.markeer_prijzen(uuid, jsonb) to authenticated;

-- Welke versie van dit schema draait er? De app vraagt het na het inloggen (0.8 = 8, 0.9 = 9, 0.10 = 10, 0.11 = 11, 0.13 = 13).
create or replace function public.schema_versie()
returns integer
language sql
stable
as $$ select 13 $$;
revoke all on function public.schema_versie() from public, anon;
grant execute on function public.schema_versie() to authenticated;

-- ── Publieke catalogus (de klantenpagina) ────────────────────────────────────
-- Weergaven met de rechten van de eigenaar: ze tonen enkel deze kolommen en enkel wat
-- in de catalogus (vitrine) ligt, ook al kan de publieke sleutel de tabellen zelf niet lezen.
-- Nooit zichtbaar voor klanten: de vault (stockdoos), aankoopprijzen, transacties,
-- omgevingen die niet aangevinkt staan, en kaarten waarvan het hartje eerst moet wisselen.
-- Klanten zien enkel wat echt klaar is: in de catalogus, met een hartje dat klopt én een geplakt label.
drop view if exists public.publieke_vitrine;
create view public.publieke_vitrine as
  select kaart_id, catalogus, afbeelding, soort, naam, set_naam, set_code, nummer, taal, conditie,
         variant, grader, grade, hartjesprijs as prijs,
         code, naam_origineel, hartjesdatum as sinds, vitrine_sinds as toegevoegd,
         foto  -- eigen foto (enkel als er nergens een foto van de kaart is); de klantenpagina laadt ze apart
    from public.exemplaren
   where opslag = 'vitrine' and status = 'in voorraad' and hartjesprijs is not null and nieuw_hartje is null
     and (label_status = 'gestickerd' or soort = 'eigen product')  -- eigen producten krijgen geen label
     and omgeving_id in (select id from public.omgevingen where zichtbaar_voor_klanten);

-- Artikels op de klantenpagina: wat je per stuk aanzet (zichtbaar), en anders zoals vroeger: wat in de
-- catalogus ligt en al onze binders (ook die in de vault liggen: "vraag ernaar").
-- Enkel wat de klant mag zien: nooit de aankoopprijs of opmerkingen.
drop view if exists public.publieke_artikelen;
create view public.publieke_artikelen as
  select id, naam, soort, prijs, aantal, foto,
         details->>'type' as type, details->>'merk' as merk, details->>'grootte' as grootte,
         case when jsonb_typeof(details->'toploader') = 'boolean' then (details->>'toploader')::boolean end as toploader, details->>'techniek' as techniek, details->>'artwork' as artwork,
         opslag = 'vitrine' as uitgestald
    from public.artikelen
   where aantal > 0 and prijs is not null
     and coalesce(zichtbaar, opslag = 'vitrine' or details->>'type' = 'binder')
     and omgeving_id in (select id from public.omgevingen where zichtbaar_voor_klanten);

-- Meer foto's van de artikels die klanten zien (dezelfde regel als publieke_artikelen).
drop view if exists public.publieke_artikelfotos;
create view public.publieke_artikelfotos as
  select f.id, f.artikel_id, f.foto, f.volgorde
    from public.artikelfotos f
    join public.artikelen a on a.id = f.artikel_id
   where a.aantal > 0 and a.prijs is not null
     and coalesce(a.zichtbaar, a.opslag = 'vitrine' or a.details->>'type' = 'binder')
     and a.omgeving_id in (select id from public.omgevingen where zichtbaar_voor_klanten);

-- De etalage op de startpagina: de binders vooraan (plek 'voorpagina') en de Instagram-strook (plek 'instagram').
drop view if exists public.publieke_etalage;
create view public.publieke_etalage as
  select id, foto, titel, link, volgorde, plek
    from public.etalage
   where omgeving_id in (select id from public.omgevingen where zichtbaar_voor_klanten);

-- Thema's (Halloween, kerst …): allemaal, zodat je er een vooraf kan bekijken (?thema=halloween); de klantenpagina
-- rekent zelf uit welk thema vandaag geldt en haalt enkel dat logo op. Niets geheims: een logo, een kleur en een zin.
drop view if exists public.publieke_themas;
create view public.publieke_themas as
  select id, naam, van, tot, aan, kleur, tekst, logo
    from public.themas;

-- Instellingen die de klantenpagina nodig heeft: Instagram en Facebook, de sleutel om aanvragen te mailen en de
-- wettelijke gegevens van de onderneming (naam, vestigingsadres, ondernemingsnummer, contact).
create or replace view public.publieke_instellingen as
  select sleutel, waarde
    from public.instellingen
   where sleutel in ('instagram', 'catalogus_tekst', 'aanvraag_sleutel', 'facebook', 'bedrijf_publiek');

-- Komende beurzen ("kom langs op onze stand"), met uren en de website van de beurs.
drop view if exists public.publieke_beurzen;
create view public.publieke_beurzen as
  select distinct on (datum, lower(naam)) naam, datum, locatie, uren, link
    from public.beurzen
   where status in ('gepland', 'actief') and datum >= current_date
     and omgeving_id in (select id from public.omgevingen where zichtbaar_voor_klanten)
   order by datum, lower(naam);

-- Enkel lezen. Supabase geeft nieuwe weergaven standaard alle rechten aan anon én authenticated;
-- een eenvoudige weergave is aanpasbaar en loopt met de rechten van de eigenaar (zonder RLS),
-- dus zonder deze revoke kon elke ingelogde gebruiker via de weergave de voorraad wijzigen.
revoke all on public.publieke_vitrine, public.publieke_artikelen, public.publieke_instellingen, public.publieke_beurzen,
  public.publieke_artikelfotos, public.publieke_etalage, public.publieke_themas from public, anon, authenticated;
grant select on public.publieke_vitrine, public.publieke_artikelen, public.publieke_instellingen, public.publieke_beurzen,
  public.publieke_artikelfotos, public.publieke_etalage, public.publieke_themas to anon, authenticated;

-- ── Eenmalig (0.9): de 30th Celebration Classic Collection op het gedrukte nummer ──
-- TCGdex nummert die 30 kaarten 001–030; gedrukt staat het nummer van de oude set (Charizard 4/102).
update public.exemplaren e
   set nummer = m.nr
  from (values ('001', '4'), ('002', '5'), ('003', '11'), ('004', '11'), ('005', '18'), ('006', '19'), ('007', '25'),
               ('008', '33'), ('009', '41'), ('010', '43'), ('011', '47'), ('012', '50'), ('013', '57'), ('014', '58'),
               ('015', '69'), ('016', '85'), ('017', '89'), ('018', '94'), ('019', '99'), ('020', '100'), ('021', '101'),
               ('022', '106'), ('023', '106'), ('024', '106'), ('025', '108'), ('026', '114'), ('027', '123'), ('028', '138'),
               ('029', '149'), ('030', '203')) as m (lokaal, nr)
 where e.kaart_id = '30th-c-' || m.lokaal and e.nummer = m.lokaal;

-- ── Eenmalig (0.9): onze komende beurzen in de omgeving Bind'r ────────────────
-- Loopt één keer (de sleutel seed:beurzen-2026-10 onthoudt het); daarna beheer je ze in de app
-- (Profiel › Beurzen). Een beurs die je schrapt, komt dus niet terug als je dit opnieuw uitvoert.
do $$
begin
  if not exists (select 1 from public.instellingen where sleutel = 'seed:beurzen-2026-10') then
    insert into public.beurzen (naam, datum, locatie, uren, link, status, omgeving_id)
    select v.naam, v.datum::date, v.locatie, v.uren, v.link, 'gepland', public.standaard_omgeving()
      from (values
        ('Toeroets Card Carnival', '2026-10-24', 'De Mast, Industrielaan 2, 8820 Torhout', '9:00–17:00', 'https://toeroetscardcarnival.be/'),
        ('Fairy Tradingcards Ruilbeurs', '2026-11-08', 'Festivalhal Donkmeer, Berlare (Overmere)', 'vanaf 10:00', 'https://www.fairytradingcards.be/beurzen'),
        ('CardKingdom – Fall Edition', '2026-11-15', 'Evenementenhal De Ark, Melkerijstraat 2, 8850 Ardooie', 'vanaf 10:00', null),
        ('Pokémon & attributenbeurs Sint-Niklaas', '2026-11-29', '''t Bauhuis, Slachthuisstraat 60, 9100 Sint-Niklaas', 'vanaf 9:30', 'https://www.ontdeksintniklaas.be/nl/agenda/alle-resultaten/pokemon-kaarten-beurs-te-sint-niklaas'),
        ('Pokémonbeurs Oudenaarde', '2026-12-05', 'De Qubus, Lindestraat 47, 9700 Oudenaarde', '9:30–17:00', 'https://www.oudenaarde.be/nl/evenementen/pokemon-kaarten-beurs-te-oudenaarde'),
        ('Geekfest Maldegem', '2026-12-19', 'Eventhall-ME, Industrielaan 6/3, 9990 Maldegem', '10:00–19:00', 'https://tickets.eventhall-me.be/event/geekfest-maldegem/'),
        ('TCG Madness Ranst', '2027-01-16', 'GC Den Boomgaard, Antwerpsesteenweg 43, 2520 Ranst', '11:00–17:00', 'https://tcgmadness.be/ranst'),
        ('Bruges TCG Premiere', '2027-01-31', 'Kinepolis Brugge, Koning Albert I-laan 200, 8200 Brugge', '10:00–16:00', 'https://chudartz-collectibles.com/nl/evenement/Bruges-TCG-Premiere/'),
        ('Brick & Toy', '2027-02-06', null, null, null)
      ) as v (naam, datum, locatie, uren, link)
     where v.datum::date >= current_date
       and not exists (select 1 from public.beurzen b where b.datum = v.datum::date and lower(b.naam) = lower(v.naam));
    insert into public.instellingen (sleutel, waarde) values ('seed:beurzen-2026-10', to_jsonb(now()::text))
      on conflict (sleutel) do nothing;
  end if;
end;
$$;

-- ── Inloggen met een pincode ─────────────────────────────────────────────────
-- In de app log je in met een pincode van 6 cijfers: dat is het wachtwoord van je account.
-- Eerste keer: log in met je huidige wachtwoord en kies in Meer › Pincode wijzigen je pincode.
-- Supabase › Authentication › Sign In / Providers › Email: "Minimum password length" op 6
-- laten staan (standaard) en geen extra eisen aan tekens.

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
