-- ---------------------------------------------------------------------
--  AJUSTES PÓS-FASE A — CHAT INTERNO (mensagens entre colaboradores)
--  Migrações: create_internal_chat + internal_chat_triggers_and_realtime
--  (APLICADAS em produção, 2026-06-24).
--
--  Chat interno tipo Slack/Telegram simplificado, isolado por empresa. 1:1 e
--  grupos; texto + anexos (bucket 'media' em {org_id}/internal-chat/); presença
--  online via Supabase Realtime Presence (SEM tabela); push reusando push-send.
--  NÃO altera nada pré-existente — só cria objetos novos.
--
--  3 tabelas novas (org_id + RLS POR PARTICIPANTE, não a política "ALL"):
--    internal_chats, internal_chat_members, internal_messages.
--  Helper SECURITY DEFINER is_internal_chat_member(chat_id) evita RLS recursivo.
--  RPC create_internal_chat(member_ids[], is_group, title): insere chat+membros
--    atomicamente (evita o gotcha do INSERT...RETURNING) e, no 1:1, REAPROVEITA a
--    conversa existente entre as 2 pessoas.
--  2 gatilhos AFTER INSERT em internal_messages:
--    bump_internal_chat_on_message   → last_message_* + unread_count (+1 p/ os outros)
--    notify_push_on_internal_message → push (espelha notify_push_on_inbound_message)
--  Realtime: as 3 tabelas entram na publicação supabase_realtime (replica identity
--    full em internal_messages e internal_chat_members).
--  Anexos: REUSA o bucket 'media' (RLS por org via is_member_of((foldername)[1])).
--    Leitura é por empresa (qualquer colega com o link do arquivo abre); as
--    MENSAGENS são fechadas por participante. Aceitável p/ ferramenta interna.
--  ATENÇÃO: v_secret (x-internal-secret) REDIGIDO abaixo — no banco está o valor
--    real (mesmo de antes; ver Bitwarden).
-- ---------------------------------------------------------------------

-- Migração 1: create_internal_chat
create table public.internal_chats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  is_group boolean not null default false,
  title text,
  avatar_path text,
  created_by uuid not null references auth.users(id),
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now()
);

create table public.internal_chat_members (
  chat_id uuid not null references public.internal_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  is_admin boolean not null default false,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.internal_chats(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id),
  content text,
  media_path text,
  media_name text,
  media_type text,
  reply_to_id uuid references public.internal_messages(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.internal_chat_members (user_id);
create index on public.internal_messages (chat_id, created_at desc);

create or replace function public.is_internal_chat_member(p_chat_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.internal_chat_members m
    where m.chat_id = p_chat_id and m.user_id = auth.uid()
  );
$$;

alter table public.internal_chats        enable row level security;
alter table public.internal_chat_members enable row level security;
alter table public.internal_messages     enable row level security;

create policy chats_select on public.internal_chats
  for select using (public.is_internal_chat_member(id));
create policy chats_update on public.internal_chats
  for update using (public.is_internal_chat_member(id));
create policy members_select on public.internal_chat_members
  for select using (public.is_internal_chat_member(chat_id));
create policy members_update_self on public.internal_chat_members
  for update using (user_id = auth.uid());
create policy msgs_select on public.internal_messages
  for select using (public.is_internal_chat_member(chat_id));
create policy msgs_insert on public.internal_messages
  for insert with check (public.is_internal_chat_member(chat_id) and sender_user_id = auth.uid());
create policy msgs_update_own on public.internal_messages
  for update using (sender_user_id = auth.uid());

create or replace function public.create_internal_chat(
  p_member_ids uuid[], p_is_group boolean, p_title text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_chat uuid; v_uid uuid := auth.uid(); v_all uuid[];
begin
  select org_id into v_org from public.org_members where user_id = v_uid limit 1;
  if v_org is null then raise exception 'sem organização'; end if;
  v_all := (select array(select distinct unnest(p_member_ids || v_uid)));

  if not p_is_group and array_length(v_all,1) = 2 then
    select c.id into v_chat from public.internal_chats c
      where c.org_id = v_org and c.is_group = false
        and (select count(*) from public.internal_chat_members m where m.chat_id = c.id) = 2
        and not exists (
          select 1 from public.internal_chat_members m
          where m.chat_id = c.id and m.user_id <> all(v_all))
        and (select count(*) from public.internal_chat_members m
             where m.chat_id = c.id and m.user_id = any(v_all)) = 2
      limit 1;
    if v_chat is not null then return v_chat; end if;
  end if;

  insert into public.internal_chats (org_id, is_group, title, created_by)
    values (v_org, p_is_group, p_title, v_uid) returning id into v_chat;
  insert into public.internal_chat_members (chat_id, user_id, org_id, is_admin)
    select v_chat, uid, v_org, (uid = v_uid) from unnest(v_all) as uid;
  return v_chat;
end; $$;

-- Migração 2: internal_chat_triggers_and_realtime
alter table public.internal_messages     replica identity full;
alter table public.internal_chat_members replica identity full;
alter publication supabase_realtime add table public.internal_chats;
alter publication supabase_realtime add table public.internal_chat_members;
alter publication supabase_realtime add table public.internal_messages;

create or replace function public.bump_internal_chat_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_preview text;
begin
  v_preview := case
    when NEW.media_type like 'image/%' then '📷 Imagem'
    when NEW.media_type like 'audio/%' then '🎤 Áudio'
    when NEW.media_type like 'video/%' then '🎥 Vídeo'
    when NEW.media_type is not null    then '📄 ' || coalesce(NEW.media_name, 'Arquivo')
    else left(coalesce(NEW.content, ''), 120)
  end;
  if v_preview is null or v_preview = '' then v_preview := 'Nova mensagem'; end if;
  update public.internal_chats
     set last_message_at = NEW.created_at, last_message_preview = v_preview
   where id = NEW.chat_id;
  update public.internal_chat_members
     set unread_count = unread_count + 1
   where chat_id = NEW.chat_id and user_id <> NEW.sender_user_id;
  return NEW;
end; $$;

create trigger trg_bump_internal_chat
  after insert on public.internal_messages
  for each row execute function public.bump_internal_chat_on_message();

create or replace function public.notify_push_on_internal_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sender text; v_is_group boolean; v_group_title text;
  v_title text; v_preview text; v_user_ids uuid[];
  v_url text := 'https://lnkctnmmxltsbpnqqnwf.supabase.co/functions/v1/push-send';
  v_secret text := '<<segredo x-internal-secret — ver Bitwarden>>';
begin
  select coalesce(nullif(p.full_name, ''), p.email, 'Colega') into v_sender
  from public.profiles p where p.id = NEW.sender_user_id;
  select c.is_group, c.title into v_is_group, v_group_title
  from public.internal_chats c where c.id = NEW.chat_id;
  v_preview := case
    when NEW.media_type like 'image/%' then '📷 Imagem'
    when NEW.media_type like 'audio/%' then '🎤 Áudio'
    when NEW.media_type like 'video/%' then '🎥 Vídeo'
    when NEW.media_type is not null    then '📄 ' || coalesce(NEW.media_name, 'Arquivo')
    else left(coalesce(NEW.content, ''), 120)
  end;
  if v_preview is null or v_preview = '' then v_preview := 'Nova mensagem'; end if;
  if v_is_group then
    v_title := coalesce(nullif(v_group_title, ''), 'Grupo');
    v_preview := v_sender || ': ' || v_preview;
  else
    v_title := v_sender;
  end if;
  select array_agg(distinct m.user_id) into v_user_ids
  from public.internal_chat_members m
  where m.chat_id = NEW.chat_id and m.user_id <> NEW.sender_user_id;
  if v_user_ids is null or array_length(v_user_ids, 1) is null then return NEW; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', v_secret),
    body := jsonb_build_object(
      'userIds', to_jsonb(v_user_ids),
      'title', coalesce(v_title, 'ConectaChat'),
      'body', v_preview, 'url', '/team-chat',
      'tag', 'ichat-' || NEW.chat_id::text
    )
  );
  return NEW;
exception when others then
  return NEW;
end; $$;

create trigger trg_notify_push_internal
  after insert on public.internal_messages
  for each row execute function public.notify_push_on_internal_message();


-- ---------------------------------------------------------------------
--  AJUSTES PÓS-FASE A — NOTIFICAÇÕES POR ATENDENTE/DEPARTAMENTO
--  Migração: push_notify_route_by_assignee_and_department (APLICADA em produção).
--
--  NÃO cria tabela/coluna/enum/índice. Apenas SUBSTITUI a função de gatilho
--  public.notify_push_on_inbound_message para ROTEAR o push:
--    - assigned_user_id preenchido  → notifica SÓ o atendente;
--    - sem atendente + department_id → notifica os membros do departamento
--      (department_members); depto sem membros → fallback todos os org_members;
--    - sem atendente e sem depto     → todos os org_members.
--  Manda a lista pronta em { userIds } para a Edge Function push-send (que já
--  aceita userIds no modo interno). Sem mudança no frontend e sem redeploy de
--  Edge Function. push-send permanece v2.
--
--  Tabelas lidas: conversations, contacts, department_members, org_members.
--  SECURITY DEFINER (bypassa RLS, igual à versão anterior).
--  ATENÇÃO: o valor real de v_secret (x-internal-secret) está REDIGIDO abaixo —
--  no banco está o valor verdadeiro (mesmo de antes; ver Bitwarden).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_push_on_inbound_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_title text;
  v_preview text;
  v_assigned uuid;
  v_department uuid;
  v_user_ids uuid[];
  v_url text := 'https://lnkctnmmxltsbpnqqnwf.supabase.co/functions/v1/push-send';
  v_secret text := '<<segredo x-internal-secret — ver Bitwarden>>';
begin
  if NEW.direction is distinct from 'inbound' then
    return NEW;
  end if;
  if NEW.content like 'system:%' then
    return NEW;
  end if;

  select coalesce(nullif(ct.name, ''), ct.external_id, 'Contato'),
         cv.assigned_user_id,
         cv.department_id
    into v_title, v_assigned, v_department
  from public.conversations cv
  join public.contacts ct on ct.id = cv.contact_id
  where cv.id = NEW.conversation_id;

  v_preview := case NEW.content_type
    when 'text'     then left(coalesce(NEW.content, ''), 120)
    when 'image'    then '📷 Imagem'
    when 'audio'    then '🎤 Áudio'
    when 'video'    then '🎥 Vídeo'
    when 'document' then '📄 Documento'
    when 'sticker'  then 'Figurinha'
    when 'location' then '📍 Localização'
    else coalesce(left(NEW.content, 120), 'Nova mensagem')
  end;
  if v_preview is null or v_preview = '' then
    v_preview := 'Nova mensagem';
  end if;
  if NEW.sender_name is not null and NEW.sender_name <> '' then
    v_preview := NEW.sender_name || ': ' || v_preview;
  end if;

  -- ===== Decide QUEM recebe =====
  if v_assigned is not null then
    v_user_ids := array[v_assigned];                       -- em atendimento: só o atendente
  elsif v_department is not null then
    select array_agg(distinct dm.user_id) into v_user_ids  -- aguardando: membros do depto
    from public.department_members dm
    where dm.department_id = v_department;
    if v_user_ids is null or array_length(v_user_ids, 1) is null then
      select array_agg(distinct om.user_id) into v_user_ids   -- depto vazio: todos da empresa
      from public.org_members om
      where om.org_id = NEW.org_id;
    end if;
  else
    select array_agg(distinct om.user_id) into v_user_ids  -- sem depto: todos da empresa
    from public.org_members om
    where om.org_id = NEW.org_id;
  end if;

  if v_user_ids is null or array_length(v_user_ids, 1) is null then
    return NEW;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(v_user_ids),
      'title', coalesce(v_title, 'ConectaChat'),
      'body', v_preview,
      'url', '/inbox',
      'tag', 'conv-' || NEW.conversation_id::text
    )
  );

  return NEW;
exception when others then
  return NEW;
end;
$function$;


-- ---------------------------------------------------------------------
--  AJUSTES PÓS-FASE A (round de pequenas melhorias antes da Fase B)
--  — RESPOSTAS RÁPIDAS COM MÍDIA —
--  Migração: add_media_columns_to_quick_replies (APLICADA e VERIFICADA em
--  produção via information_schema.columns).
--  Adiciona 3 colunas NULAS à tabela JÁ EXISTENTE public.quick_replies:
--    media_path  text   -- caminho do arquivo no bucket de Storage 'media'
--    media_name  text   -- nome original do arquivo (para baixar/exibir)
--    media_type  text   -- 'image' | 'audio' | 'video' | 'document'
--  Aditiva e segura: NÃO altera dados existentes, NÃO cria enum/índice e
--  NÃO mexe em RLS — a política "ALL" is_member_of(org_id) que a quick_replies
--  já tem cobre automaticamente as colunas novas.
--  content CONTINUA NOT NULL — respostas só de mídia gravam content = '' (vazio).
--  Os arquivos ficam no MESMO bucket 'media' das mensagens, no caminho
--    {org_id}/quick-replies/{uuid}.{ext}
--  (o bucket tem RLS por org_id: o caminho precisa começar com o org_id).
--  IMPORTANTE: após esta migração o types.ts FOI regenerado pelo Lovable
--  (Row/Insert/Update de quick_replies já incluem media_path/name/type),
--  então o frontend acessa essas colunas COM tipo (não precisa de `as any`).
-- ---------------------------------------------------------------------

alter table public.quick_replies add column if not exists media_path text;
alter table public.quick_replies add column if not exists media_name text;
alter table public.quick_replies add column if not exists media_type text;

-- ---------------------------------------------------------------------
--  NOTA (Fase A — ENCERRADA, atualização pós-F6):
--  Os blocos F4 (motor de execução), F5a (IA real + Marketplace de chaves),
--  F5b (modo "IA assume a conversa") e F6 (polimento: reabertura de conversa,
--  saídas múltiplas no editor, menu com resposta inválida + limite de
--  tentativas) NÃO criaram nenhuma tabela, coluna, enum ou índice novos.
--  Foram implementados inteiramente em:
--    - Edge Function whatsapp-webhook (motor + execução de IA + reabertura +
--      menu inválido), atualmente na VERSÃO 34;
--    - Edge Function ai-credentials (gestão de chaves);
--    - frontend Lovable (Marketplace /integracoes, campos do nó de IA,
--      saídas múltiplas no editor, campos invalidMessage/maxTries do menu,
--      faixa de reabertura no inbox).
--
--  As configs novas dos nós ficam todas dentro de flows.definition (jsonb),
--  em node.data.config — SEM coluna nova. Exemplos:
--    - nó de IA: provider, model, systemPrompt, temperature, maxTokens,
--      history, responseVariable, behavior, exitKeywords.
--    - nó de menu (menu_text/buttons/list): text, options[], e (F6)
--      invalidMessage, maxTries.
--  As chaves de IA usam a tabela ai_credentials já criada no F1.
--
--  O contador de tentativas do menu (F6) vive em flow_sessions.variables
--  (jsonb), na chave __menu_tries — SEM coluna nova.
--
--  O marcador de reabertura (F6) é uma LINHA na tabela messages já existente,
--  com external_message_id = 'system:reopen' (não há índice UNIQUE nessa
--  coluna — verificado — então o valor pode repetir sem conflito).
--
--  Portanto, o schema da FASE A continua EXATAMENTE como no bloco "FASE A / F1"
--  abaixo. A ÚNICA DDL posterior à Fase A até agora é o bloco "AJUSTES PÓS-FASE A
--  — Respostas Rápidas (mídia)" no TOPO deste arquivo (3 colunas em quick_replies).
--  A próxima DDL prevista deve surgir na Fase B (Relatórios — inclui o número de
--  chamado sequencial #NNNN, adiado do F6) ou Fase E (Stripe/enforcement).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
--  FASE A / F1 — Construtor de Fluxos de Chatbot (fundação de dados)
--  4 tabelas + 3 enums. Todas com org_id e RLS política única "ALL"
--  usando is_member_of(org_id) — padrão do projeto.
--  types.ts NÃO foi regenerado (o frontend acessa estas tabelas com
--  casts `as any` de propósito).
-- ---------------------------------------------------------------------

-- Enums
create type public.flow_trigger_type as enum ('welcome', 'keyword', 'default');
create type public.flow_session_status as enum ('active', 'ended');
create type public.ai_provider as enum ('openai', 'gemini', 'claude');

-- 1) FLOWS — o desenho do fluxo (nós + conexões em JSON)
create table public.flows (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  description text,
  is_active   boolean not null default false,
  definition  jsonb not null default '{"nodes": [], "edges": []}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index flows_org_idx on public.flows (org_id);

alter table public.flows enable row level security;
create policy "flows acesso" on public.flows
  for all using (is_member_of(org_id)) with check (is_member_of(org_id));

-- 2) FLOW_TRIGGERS — gatilhos que iniciam um fluxo
--  (O "Fluxo Inicial" do canal, do F6, é um gatilho type='welcome' com
--   channel_id setado para o canal específico.)
create table public.flow_triggers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  flow_id     uuid not null references public.flows(id) on delete cascade,
  channel_id  uuid references public.channels(id) on delete set null,
  type        public.flow_trigger_type not null,
  keyword     text,
  is_active   boolean not null default true,
  priority    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index flow_triggers_org_idx    on public.flow_triggers (org_id);
create index flow_triggers_lookup_idx on public.flow_triggers (org_id, channel_id, type) where is_active;

alter table public.flow_triggers enable row level security;
create policy "flow_triggers acesso" on public.flow_triggers
  for all using (is_member_of(org_id)) with check (is_member_of(org_id));

-- 3) FLOW_SESSIONS — o estado (em que nó cada contato parou)
--  variables (jsonb) guarda também as chaves de controle do motor:
--   __awaiting ('menu'|'question'|'ai'), __awaiting_node, __question_var,
--   __menu_tries (F6 — contador de tentativas inválidas no menu).
create table public.flow_sessions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  flow_id         uuid not null references public.flows(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  current_node_id text,
  status          public.flow_session_status not null default 'active',
  variables       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index flow_sessions_org_idx on public.flow_sessions (org_id);
-- garante NO MÁXIMO uma sessão ativa por conversa:
create unique index flow_sessions_active_conv_idx
  on public.flow_sessions (conversation_id) where status = 'active';

alter table public.flow_sessions enable row level security;
create policy "flow_sessions acesso" on public.flow_sessions
  for all using (is_member_of(org_id)) with check (is_member_of(org_id));

-- 4) AI_CREDENTIALS — chave de IA por empresa (1 por provedor)
--  api_key NÃO é criptografada: protegida só por RLS + service role.
--  Lida apenas pela Edge Function (servidor), nunca enviada ao navegador
--  (no Marketplace é retornada mascarada, ••••XXXX).
create table public.ai_credentials (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  provider    public.ai_provider not null,
  label       text,
  api_key     text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, provider)
);
create index ai_credentials_org_idx on public.ai_credentials (org_id);

alter table public.ai_credentials enable row level security;
create policy "ai_credentials acesso" on public.ai_credentials
  for all using (is_member_of(org_id)) with check (is_member_of(org_id));
