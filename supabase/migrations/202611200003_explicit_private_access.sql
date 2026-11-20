-- Direct access is denied even if someone later adds a table grant by mistake.
-- The only public entry points are the four narrowly scoped mural_* functions.
create policy mural_no_direct_access on private.mural_recados
  for all to anon, authenticated using (false) with check (false);

comment on function public.mural_list_recados(text,timestamptz,uuid,integer)
  is 'Intentionally public guestbook read; returns no ownership secrets and caps pagination at 30 rows.';
comment on function public.mural_create_recado(text,text,text)
  is 'Intentionally public guestbook write; validates fields, deduplicates, stores only SHA-256 of a 256-bit ownership capability.';
comment on function public.mural_update_recado(uuid,text,text,text)
  is 'Intentionally public endpoint; modification requires the matching private browser capability. Not name-based authorization.';
comment on function public.mural_delete_recado(uuid,text)
  is 'Intentionally public endpoint; deletion requires the matching private browser capability.';

-- The dashboard's auto-RLS event trigger has no reason to be callable through REST.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
