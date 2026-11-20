-- JONAS BUYING : base partagée (Supabase / PostgreSQL)
--
-- Les objets de l'application (produits, proformas, conteneurs, fournisseurs, utilisateurs, journal,
-- paramètres) sont rangés en documents JSON par collection, comme dans l'application. Les colonnes
-- calculées (fournisseur, transitaire) servent aux règles d'accès et aux recherches.
-- Les comptes Supabase Auth sont reliés aux utilisateurs de l'application par la table members.

-- ---------------------------------------------------------------------------
-- Documents

create table if not exists public.docs (
  collection  text        not null check (collection in ('suppliers','brands','products','proformas','containers','users','journal','settings')),
  id          text        not null,
  data        jsonb       not null,
  supplier_id text        generated always as (case when collection = 'suppliers' then id else data->>'supplierId' end) stored,
  forwarder   text        generated always as (coalesce(data->>'forwarder', data->'booking'->>'forwarder')) stored,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        default auth.uid(),
  primary key (collection, id)
);
create index if not exists docs_supplier_idx  on public.docs (collection, supplier_id);
create index if not exists docs_forwarder_idx on public.docs (collection, forwarder);
create index if not exists docs_updated_idx   on public.docs (updated_at);

create or replace function public.touch_docs() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.touch_docs();

-- ---------------------------------------------------------------------------
-- Comptes : un compte Supabase = un utilisateur de l'application (rôle, fournisseur, transitaire)

create table if not exists public.members (
  user_id     uuid primary key references auth.users on delete cascade,
  app_user_id text not null unique,
  role        text not null check (role in ('pilote','direction','acheteur','designer','validateur','finance','logistique','fournisseur','transitaire')),
  supplier_id text,
  forwarder   text,
  active      boolean not null default true
);

create or replace function public.my_member() returns public.members
  language sql stable security definer set search_path = public as $$
  select * from public.members where user_id = auth.uid() and active
$$;
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as $$ select (public.my_member()).role $$;
create or replace function public.my_supplier() returns text language sql stable security definer set search_path = public as $$ select (public.my_member()).supplier_id $$;
create or replace function public.my_forwarder() returns text language sql stable security definer set search_path = public as $$ select (public.my_member()).forwarder $$;
create or replace function public.is_team() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() not in ('fournisseur','transitaire'), false)
$$;

-- ---------------------------------------------------------------------------
-- Règles d'accès (RLS) : l'équipe JONAS voit tout ; un fournisseur ses propres données ;
-- un transitaire ses conteneurs et les bookings qui lui sont confiés.
-- Les règles métier fines (qui peut signer, booker…) restent vérifiées par l'application.

alter table public.docs enable row level security;
alter table public.members enable row level security;

drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated using (
  public.is_team()
  or collection in ('brands','settings')
  or (public.my_role() = 'fournisseur' and collection in ('suppliers','products','proformas','containers') and supplier_id = public.my_supplier())
  or (public.my_role() = 'transitaire' and (
        (collection in ('containers','proformas') and forwarder = public.my_forwarder())
        or collection in ('suppliers','products')))
  or (collection = 'users' and id = (public.my_member()).app_user_id)
);

drop policy if exists docs_write on public.docs;
create policy docs_write on public.docs for all to authenticated
  using (
    public.is_team()
    or (public.my_role() = 'fournisseur' and collection in ('products','proformas','containers') and supplier_id = public.my_supplier())
    or (public.my_role() = 'transitaire' and collection in ('containers','proformas') and forwarder = public.my_forwarder())
    or (collection = 'journal')
  )
  with check (
    public.is_team()
    or (public.my_role() = 'fournisseur' and collection in ('products','proformas','containers') and supplier_id = public.my_supplier())
    or (public.my_role() = 'transitaire' and collection in ('containers','proformas') and forwarder = public.my_forwarder())
    or (collection = 'journal')
  );

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (user_id = auth.uid() or public.is_team());
drop policy if exists members_admin on public.members;
create policy members_admin on public.members for all to authenticated
  using (public.my_role() = 'pilote') with check (public.my_role() = 'pilote');

-- ---------------------------------------------------------------------------
-- Temps réel : chaque modification est poussée aux navigateurs ouverts (selon leurs droits)

do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Fichiers (proformas déposées, packs, bons de commande) : bucket privé

insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;

drop policy if exists files_read on storage.objects;
create policy files_read on storage.objects for select to authenticated using (bucket_id = 'files');
drop policy if exists files_write on storage.objects;
create policy files_write on storage.objects for insert to authenticated with check (bucket_id = 'files');
drop policy if exists files_delete on storage.objects;
create policy files_delete on storage.objects for delete to authenticated using (bucket_id = 'files' and public.is_team());
