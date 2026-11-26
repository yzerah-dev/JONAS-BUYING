-- JONAS BUYING · 0004 : un fournisseur peut déposer le logo de sa société (portail)
-- Les règles d'accès (0001) ne laissaient pas un fournisseur modifier sa fiche « suppliers ».
-- On l'autorise pour SA fiche uniquement, et le garde-fou (0003) n'y laisse changer que le champ « logo »
-- (nom, conditions de paiement, contact… restent gérés par JONAS). À exécuter une fois dans l'éditeur SQL
-- de Supabase, après 0003.

drop policy if exists docs_write on public.docs;
create policy docs_write on public.docs for all to authenticated
  using (
    public.is_team()
    or (public.my_role() = 'fournisseur' and collection in ('suppliers','products','proformas','containers') and supplier_id = public.my_supplier())
    or (public.my_role() = 'transitaire' and collection in ('containers','proformas') and forwarder = public.my_forwarder())
    or (collection = 'journal')
  )
  with check (
    public.is_team()
    or (public.my_role() = 'fournisseur' and collection in ('suppliers','products','proformas','containers') and supplier_id = public.my_supplier())
    or (public.my_role() = 'transitaire' and collection in ('containers','proformas') and forwarder = public.my_forwarder())
    or (collection = 'journal')
  );

create or replace function public.docs_supplier_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  locked text[];
  k text;
begin
  if public.my_role() is distinct from 'fournisseur' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    -- Seule exception : ses propres conteneurs prévisionnels pas encore bookés
    if old.collection = 'containers' and old.data ->> 'status' in ('a_booker', 'booking_demande') and coalesce(old.data ->> 'bookingNo', '') = '' then
      return old;
    end if;
    raise exception 'JONAS BUYING : un fournisseur ne peut pas supprimer de données (%/%)', old.collection, old.id;
  end if;

  if new.collection = 'suppliers' then
    -- Sa propre fiche : seul le logo peut changer, et il ne peut pas en créer
    if tg_op = 'INSERT' then
      raise exception 'JONAS BUYING : un fournisseur ne peut pas créer de fiche fournisseur';
    end if;
    if (new.data - 'logo') is distinct from (old.data - 'logo') then
      raise exception 'JONAS BUYING : un fournisseur ne peut modifier que son logo (%)', new.id;
    end if;
    return new;
  elsif new.collection = 'proformas' then
    locked := array['supplierId', 'depositPaid', 'balancePaid', 'depositProof', 'balanceProof', 'cancelled'];
    if tg_op = 'INSERT' then
      if coalesce((new.data ->> 'depositPaid')::boolean, false) or coalesce((new.data ->> 'balancePaid')::boolean, false) or new.data ? 'cancelled' then
        raise exception 'JONAS BUYING : proforma créée par un fournisseur avec un paiement ou une annulation';
      end if;
      return new;
    end if;
  elsif new.collection = 'products' then
    locked := array['ref', 'ean', 'brandId', 'supplierId'];
    if tg_op = 'INSERT' then
      return new;
    end if;
  else
    return new;
  end if;

  foreach k in array locked loop
    if (new.data -> k) is distinct from (old.data -> k) then
      raise exception 'JONAS BUYING : champ « % » non modifiable par un fournisseur (%/%)', k, new.collection, new.id;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists docs_supplier_guard on public.docs;
create trigger docs_supplier_guard
  before insert or update or delete on public.docs
  for each row execute function public.docs_supplier_guard();
