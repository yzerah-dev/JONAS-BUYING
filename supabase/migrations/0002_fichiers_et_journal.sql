-- JONAS BUYING — 0002 : accès aux fichiers par fournisseur / transitaire, journal en ajout seul.
-- À exécuter après 0001 (SQL Editor). Rejouable sans effet de bord.
--
-- Convention de chemin dans le bucket « files » (appliquée par l'application, src/lib/files.ts) :
--   suppliers/<supplier_id>/…   fichiers d'un fournisseur (proformas, bons de commande, packs)
--   forwarders/<transitaire>/…  fichiers d'un transitaire (« logfret », « kuehne-nagel »)
--   internal/…                  fichiers internes JONAS
-- Tout autre chemin (anciens fichiers sans préfixe) reste réservé à l'équipe JONAS.

-- ---------------------------------------------------------------------------
-- Transitaire du compte, au format du chemin : « Kuehne + Nagel » → « kuehne-nagel »

create or replace function public.my_forwarder_slug() returns text
  language sql stable security definer set search_path = public as $$
  select trim(both '-' from regexp_replace(lower(coalesce(public.my_forwarder(), '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Un fichier du bucket est-il accessible à ce compte ?
create or replace function public.can_access_file(object_name text) returns boolean
  language sql stable security definer set search_path = public, storage as $$
  select
    public.is_team()
    or (public.my_role() = 'fournisseur'
        and (storage.foldername(object_name))[1] = 'suppliers'
        and (storage.foldername(object_name))[2] = public.my_supplier())
    or (public.my_role() = 'transitaire'
        and (storage.foldername(object_name))[1] = 'forwarders'
        and (storage.foldername(object_name))[2] = public.my_forwarder_slug()
        and public.my_forwarder_slug() <> '')
$$;

-- ---------------------------------------------------------------------------
-- Fichiers : lecture, dépôt et remplacement limités au périmètre du compte ; suppression : équipe

drop policy if exists files_read   on storage.objects;
drop policy if exists files_write  on storage.objects;
drop policy if exists files_update on storage.objects;
drop policy if exists files_delete on storage.objects;

create policy files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.can_access_file(name));

create policy files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.can_access_file(name));

-- Remplacement d'un fichier existant (dépôt avec écrasement)
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and public.can_access_file(name))
  with check (bucket_id = 'files' and public.can_access_file(name));

create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.is_team());

-- ---------------------------------------------------------------------------
-- Documents : le journal est en ajout seul, au nom du compte connecté.
-- L'ancienne règle « for all » est remplacée par une règle par opération.

drop policy if exists docs_write  on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;

-- Périmètre d'écriture des objets métier (hors journal)
create or replace function public.can_write_doc(c text, sup text, fwd text) returns boolean
  language sql stable security definer set search_path = public as $$
  select c <> 'journal' and (
    public.is_team()
    or (public.my_role() = 'fournisseur' and c in ('products','proformas','containers') and sup = public.my_supplier())
    or (public.my_role() = 'transitaire' and c in ('containers','proformas') and fwd = public.my_forwarder())
  )
$$;

create policy docs_insert on public.docs for insert to authenticated
  with check (
    public.can_write_doc(collection, supplier_id, forwarder)
    -- journal : tout compte actif peut ajouter une entrée, signée de son identifiant (posé par le déclencheur)
    or (collection = 'journal' and public.my_member() is not null and updated_by = auth.uid())
  );

create policy docs_update on public.docs for update to authenticated
  using (public.can_write_doc(collection, supplier_id, forwarder))
  with check (public.can_write_doc(collection, supplier_id, forwarder));

create policy docs_delete on public.docs for delete to authenticated
  using (public.can_write_doc(collection, supplier_id, forwarder));
