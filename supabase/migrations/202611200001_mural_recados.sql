-- Public guestbook; ownership uses a 256-bit browser capability, stored only as SHA-256.
-- No login, pending approval, or publicly readable ownership secrets.
create schema if not exists private;

create table private.mural_recados (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 80 and nome ~ '\S'),
  mensagem text not null check (char_length(mensagem) between 1 and 1000 and mensagem ~ '\S'),
  owner_hash bytea not null check (octet_length(owner_hash) = 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dedupe_key text generated always as (
    md5(lower(regexp_replace(btrim(nome), '\s+', ' ', 'g')) || chr(31) ||
        lower(regexp_replace(btrim(mensagem), '\s+', ' ', 'g')))
  ) stored,
  constraint mural_recados_no_duplicates unique (dedupe_key)
);
create index mural_recados_newest on private.mural_recados (created_at desc, id desc);
alter table private.mural_recados enable row level security;
revoke all on private.mural_recados from public, anon, authenticated;
comment on table private.mural_recados is 'Mural de Elieth. API pública limitada às funções mural_*; autoria privada por navegador.';

create function public.mural_list_recados(
  p_owner_token text default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 16
)
returns table (id uuid, nome text, mensagem text, created_at timestamptz, updated_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.nome, r.mensagem, r.created_at, r.updated_at,
    coalesce(r.owner_hash = pg_catalog.sha256(pg_catalog.convert_to(p_owner_token, 'UTF8')), false)
  from private.mural_recados r
  where p_before is null or
    (r.created_at, r.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
  order by r.created_at desc, r.id desc
  limit greatest(1, least(coalesce(p_limit,16),30));
$$;

create function public.mural_create_recado(p_nome text, p_mensagem text, p_owner_token text)
returns table (id uuid, nome text, mensagem text, created_at timestamptz, updated_at timestamptz, is_mine boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_owner_token is null or p_owner_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Chave de autoria inválida.' using errcode = '22023';
  end if;
  return query
  insert into private.mural_recados as r (nome, mensagem, owner_hash)
  values (
    btrim(regexp_replace(p_nome, '\s+', ' ', 'g')),
    regexp_replace(p_mensagem, '^\s+|\s+$', '', 'g'),
    pg_catalog.sha256(pg_catalog.convert_to(p_owner_token, 'UTF8'))
  )
  returning r.id, r.nome, r.mensagem, r.created_at, r.updated_at, true;
end;
$$;

create function public.mural_update_recado(p_id uuid, p_nome text, p_mensagem text, p_owner_token text)
returns table (id uuid, nome text, mensagem text, created_at timestamptz, updated_at timestamptz, is_mine boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_owner_token is null or p_owner_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Você só pode editar seus próprios recados.' using errcode = '42501';
  end if;
  return query
  update private.mural_recados as r
  set nome = btrim(regexp_replace(p_nome, '\s+', ' ', 'g')),
      mensagem = regexp_replace(p_mensagem, '^\s+|\s+$', '', 'g'),
      updated_at = pg_catalog.now()
  where r.id = p_id and r.owner_hash = pg_catalog.sha256(pg_catalog.convert_to(p_owner_token, 'UTF8'))
  returning r.id, r.nome, r.mensagem, r.created_at, r.updated_at, true;
  if not found then
    raise exception 'Você só pode editar seus próprios recados.' using errcode = '42501';
  end if;
end;
$$;

create function public.mural_delete_recado(p_id uuid, p_owner_token text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_owner_token is null or p_owner_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Você só pode apagar seus próprios recados.' using errcode = '42501';
  end if;
  delete from private.mural_recados r
  where r.id = p_id and r.owner_hash = pg_catalog.sha256(pg_catalog.convert_to(p_owner_token, 'UTF8'));
  if not found then
    raise exception 'Você só pode apagar seus próprios recados.' using errcode = '42501';
  end if;
  return true;
end;
$$;

revoke all on function public.mural_list_recados(text,timestamptz,uuid,integer) from public;
revoke all on function public.mural_create_recado(text,text,text) from public;
revoke all on function public.mural_update_recado(uuid,text,text,text) from public;
revoke all on function public.mural_delete_recado(uuid,text) from public;
grant execute on function public.mural_list_recados(text,timestamptz,uuid,integer) to anon,authenticated;
grant execute on function public.mural_create_recado(text,text,text) to anon,authenticated;
grant execute on function public.mural_update_recado(uuid,text,text,text) to anon,authenticated;
grant execute on function public.mural_delete_recado(uuid,text) to anon,authenticated;
