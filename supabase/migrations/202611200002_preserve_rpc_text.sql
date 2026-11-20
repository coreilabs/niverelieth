-- Preserve UTF-8 error messages if initial setup crossed a legacy shell encoding.
do $$
declare
  definition text;
  function_id regprocedure;
begin
  foreach function_id in array array[
    'public.mural_create_recado(text,text,text)'::regprocedure,
    'public.mural_update_recado(uuid,text,text,text)'::regprocedure,
    'public.mural_delete_recado(uuid,text)'::regprocedure
  ] loop
    definition := pg_get_functiondef(function_id);
    definition := replace(definition, 'Chave de autoria inv?lida.', 'Chave de autoria inválida.');
    definition := replace(definition, 'Voc? s? pode editar seus pr?prios recados.', 'Você só pode editar seus próprios recados.');
    definition := replace(definition, 'Voc? s? pode apagar seus pr?prios recados.', 'Você só pode apagar seus próprios recados.');
    execute definition;
  end loop;
end;
$$;
comment on table private.mural_recados is 'Mural de Elieth. API pública limitada às funções mural_*; autoria privada por navegador.';
