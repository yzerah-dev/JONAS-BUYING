-- JONAS BUYING · 0003 : garde-fou « fournisseur » dans la base
-- Les règles d'accès (0001) laissent un fournisseur écrire ses propres produits, proformas et conteneurs
-- (c'est nécessaire au portail : dépôt de proforma, die cut, validation du pack, plan de chargement, documents).
-- Ce déclencheur empêche en plus, même en passant hors de l'application :
--   · toute suppression par un fournisseur (sauf ses conteneurs prévisionnels pas encore bookés) ;
--   · de marquer un acompte ou un solde comme payé (ou d'en changer la copie du virement), d'annuler une proforma, de la rattacher à un autre fournisseur ;
--   · de changer la référence JONAS, l'EAN, la marque ou le fournisseur d'un produit.
-- L'équipe JONAS et les transitaires ne sont pas concernés. À exécuter une fois dans l'éditeur SQL de Supabase.

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

  if new.collection = 'proformas' then
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
