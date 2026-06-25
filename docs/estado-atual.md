/* ============================================================
 * FASE C — INTEGRAÇÃO CALENDLY (C1–C6) — ✅ ENTREGUE e testado na Duli
 * (próximo: C7 nó no fluxo, depende do F4). Plano e progresso completos:
 * docs/conectachat-calendly-plano.md (seção 0). Resumo:
 * ============================================================
 * Card único adaptativo no Marketplace (/integracoes/calendly): conecta a conta
 * Calendly da empresa (OAuth) e DETECTA o plano — Light (grátis) ou Pro (pago).
 *
 * C1 — Conexão (OAuth + Vault): tabela calendly_connections; tokens OAuth no
 *   Supabase VAULT (a tabela guarda só os IDs; funções calendly_* só service_role).
 *   Detecção de plano: POST /webhook_subscriptions → 201 (apaga na hora) = Pro / 403 = Light.
 *   Edge Functions: calendly-oauth-start (jwt on; state HMAC c/ a service key),
 *   calendly-oauth-callback (jwt off; valida state; troca code; grava no Vault; redireciona
 *   p/ app.conectachat.online/integracoes/calendly), calendly-disconnect (jwt on).
 *   Secrets no Supabase: CALENDLY_CLIENT_ID/CLIENT_SECRET/WEBHOOK_SIGNING_KEY.
 * C2 — Leitura: Edge calendly-api (jwt on): event_types + available_times
 *   (paginação de 7 dias) + RENOVAÇÃO de token com rotação de refresh. Card lista os
 *   tipos de evento. Sem cache (ao vivo).
 * C3 — Agendamento + card: tabela appointments (RLS+realtime; índice único
 *   NÃO-parcial em calendly_invitee_uri — parcial quebra o upsert). calendly-api ganhou
 *   capture_booking e cancel. Frontend: painel "Agendar" no painel de dados do contato
 *   (src/components/inbox/calendly-appointment-panel.tsx) — botão Agendar abre o EMBED do
 *   Calendly (script assets.calendly.com), captura calendly.event_scheduled, mostra card
 *   (data/hora no fuso, Entrar, Remarcar, Cancelar). Remarcar abre o reschedule_url no
 *   MESMO embed (não há API de remarcação) e marca o antigo como rescheduled. Prefill com %20.
 * C4 — Mensagens automáticas (WhatsApp): REUSA scheduled_messages + a Edge run-scheduled
 *   (cron 1 min; já resolve {{nome}}/{{primeiro_nome}}). NÃO criar fila nova. calendly-api (v4)
 *   gera confirmação/lembrete ao capturar (variáveis Calendly resolvidas na geração:
 *   {{tipo_evento}}/{{data_reuniao}}/{{hora_reuniao}}/{{link_reuniao}}/{{link_remarcar}}/
 *   {{link_cancelar}}; scheduled_at = início − offset; só se habilitado e no futuro) e cancela
 *   pendentes em cancelar/remarcar. Banco: calendly_message_settings (por org) + colunas
 *   appointment_id/kind em scheduled_messages. Config na página da integração Calendly
 *   (calendly-messages-settings.tsx): toggles, tempos, textos com chips, aviso sobre lembretes nativos.
 *
 * C5 — Pro nativo (Scheduling API, sem iframe): calendly-api v6 ganhou a ação `book`
 *   (POST https://api.calendly.com/invitees; escopo scheduled_events:write JÁ na app OAuth da Duli —
 *   verificado, não recriou app). `book` lê o detalhe do event type, valida e-mail do convidado +
 *   perguntas obrigatórias, monta `location` (omite se sem local/round_robin; ask_invitee/outbound_call
 *   pedem string da UI) e questions_and_answers, e REUSA o helper de captura (appointments source='manual'
 *   + confirmação/lembrete). event_types passou a devolver locations/custom_questions. `cancel` ficou
 *   robusto: evento de OUTRA conta Calendly (403/404/410) → remove só localmente (localOnly), não trava.
 *   Frontend (calendly-appointment-panel.tsx): lê plan_tier; Pro = nativo (tipo → seletor de horário por
 *   dia, 14d + "ver mais" → formulário com e-mail obrigatório + perguntas dinâmicas); Light = embed.
 *   Remarcar (ambos) = embed do reschedule_url + link "abrir em nova aba"; embed monta por CALLBACK REF
 *   (corrigida a "tela em branco" por corrida de montagem). UI do agendamento: ajuste anotado p/ depois.
 *
 * FIX WhatsApp (junto do C5): manage-channels v7 — ação `qr` força sessão nova (PUT /instance/restart) +
 *   reaplica webhook (helper applyWebhook) quando a instância trava em "connecting"; se já está "open",
 *   retorna alreadyConnected e NÃO reinicia. Restart na Evolution v2 é PUT (não POST). Frontend não mudou
 *   (QR ao vivo já vem pelo whatsapp-webhook via QRCODE_UPDATED + realtime).
 *
 * C6 — Sincronização (cancelar/remarcar refletem sozinho): ENTREGUE. C6a (Pro) testado na Duli.
 *   Inscrição do webhook criada com a NOSSA signing_key (CALENDLY_WEBHOOK_SIGNING_KEY); Calendly assina
 *   HMAC-SHA256 de t.body (header Calendly-Webhook-Signature t=...,v1=...). calendly-webhook (jwt off)
 *   valida a assinatura e, em invitee.canceled, cancela o appointment + scheduled_messages pendentes. A
 *   inscrição é garantida pela ação ensure_webhook (calendly-api v8), chamada DENTRO do book (gatilho
 *   confiável, server-side) e pelo card. calendly-disconnect v2 apaga a inscrição. Coluna
 *   calendly_connections.webhook_subscription_uri. C6b (Light): calendly-poll (jwt off, CRON_SECRET) +
 *   cron 'conectachat-calendly-poll' 5min reconcilia cancelamentos via GET do invitee; teste do Light
 *   pendente (Duli está Pro). APRENDIZADO: criar a inscrição só no card (abrir página) falhou no 1º teste
 *   (frontend ainda não publicado) → o gatilho no book resolveu.
 *
 * BACKLOG (Renato, 2026-06-25): ao cliente cancelar/remarcar, NOTIFICAR no WhatsApp (confirmar cancelamento
 *   / novos dados da remarcação). Fazer junto dos envios automáticos. Hoje o C6 só atualiza o card + cancela
 *   pendentes, não notifica o cliente do cancelamento.
 *
 * EM ABERTO (anotado): trava de renovação simultânea de token (cenário raro); ajuste de UI do agendamento
 *   nativo (não mexer por ora); C7 nó no fluxo (depende do F4); C8 relatórios. Decisões fixadas:
 *   tokens=Vault; polling Light=5min; tempos padrão conf 24h/lembrete 2h; lembretes nativos = empresa decide.
 */

/* ============================================================
 * FASE B — RELATÓRIOS/DASHBOARDS + Nº DE CHAMADO #NNNN — ✅ ENTREGUE (v1)
 * ============================================================
 * Telas de métricas de atendimento + número de chamado sequencial por empresa
 * (#NNNN, herdado da Fase A). Métricas calculadas NO BANCO (funções report_*),
 * não no navegador — mais rápido, correto e isolado por empresa. Publicado via
 * Lovable. Inspirado no dashboard/relatorios do AtendeZap (KPIs + série por dia +
 * tabelas + CSV), adaptado ao nosso foco em atendimento (não funil de vendas).
 *
 * BANCO (produção, 3 migrações — ver migrations.sql topo "FASE B"):
 *   B1: conversations += closed_at, first_response_at (nulas) + 2 gatilhos que as
 *     preenchem (1º outbound = first_response_at; status→closed = closed_at; reabrir
 *     zera) + backfill do histórico (aproximado).
 *   B2: conversations += ticket_number bigint; tabela org_ticket_counters + gatilho
 *     assign_ticket_number (UPSERT atômico, BEFORE INSERT) + backfill por created_at
 *     por org + índice único (org_id, ticket_number). Numeração por EMPRESA (Duli
 *     ficou 1..27; próxima = 28).
 *   B3: 5 funções SECURITY DEFINER (validam is_member_of, agregam em SQL, filtros
 *     período/canal/depto/atendente): report_overview (KPIs em jsonb),
 *     report_timeseries (por dia), report_by_agent, report_by_channel,
 *     report_by_department. Validado na Duli (90 dias): novas 27, recebidas 162 +
 *     enviadas 168 = 330 (total exato).
 *
 * FRONTEND (types.ts via (supabase as any), padrão do projeto):
 *   - src/components/reports/use-reports.ts: hooks das 5 RPCs (useReportOverview/
 *     Timeseries/ByAgent/ByChannel/ByDepartment) + useReportFilterOptions (listas de
 *     canal/depto/atendente) + formatDuration (segundos → "Xh Ym").
 *   - src/components/reports/reports-screen.tsx: filtros (período hoje/7d/30d/custom +
 *     canal + depto + atendente), 9 cards de KPI, gráfico de área (recharts, verde/
 *     azul da marca), tabela por atendente, tabelas por canal e por departamento,
 *     export CSV (BOM + ';' p/ Excel pt-BR).
 *   - src/routes/_authenticated/dashboard.tsx: rota /dashboard.
 *   - src/components/shared/app-sidebar.tsx: item "Dashboard" (ícone BarChart3), 1º do menu.
 *   - #NNNN no inbox: use-conversations.ts passou a trazer ticket_number; o cabeçalho
 *     da conversa (inbox-screen.tsx) mostra "#0001" (padStart 4) ao lado do canal.
 *
 * DECISÕES EM ABERTO (não bloqueiam; anotadas p/ evoluir):
 *   - Visibilidade: /reports hoje é visível a TODOS os membros (dados isolados por
 *     RLS). AtendeZap restringe a dono/admin — dá p/ restringir menu/rota depois.
 *   - Fuso: RESOLVIDO — períodos e quebra por dia são calculados no fuso da empresa
 *     (organizations.timezone) via helper report_window; as funções recebem o período
 *     ('hoje'/'7d'/'30d'/'custom') e calculam as datas no fuso, não em UTC.
 *   - Tempos médios históricos saíram do backfill (aproximados); dados novos são
 *     precisos (gatilhos em tempo real).
 *
 * VALIDAÇÃO: backend conferido direto no banco (números batem); frontend NÃO roda
 *   local (máquina sem Node/Bun) — validação real no build do Lovable + Duli.
 */

/* ============================================================
 * AJUSTE PÓS-FASE A — CHAT INTERNO (colaborador ↔ colaborador) — ✅ CONCLUÍDO
 * ============================================================
 * Objetivo: colaboradores da MESMA empresa conversam entre si dentro do
 * ConectaChat (não é conversa com cliente do WhatsApp). Tipo Slack/Telegram
 * simplificado. Escopo entregue: 1:1 + GRUPOS; texto + ANEXOS; PRESENÇA
 * (online/offline); PUSH. Rota /team-chat, item "Chat interno" no menu lateral.
 * Publicado via Lovable (commit cc4348f). Construído do nosso jeito (Supabase +
 * nossa UI), sem copiar o AtendeZap (que usava Socket.IO).
 *
 * BANCO (produção, 2 migrações — ver migrations.sql topo "CHAT INTERNO"):
 *   3 tabelas novas, RLS POR PARTICIPANTE (NÃO a política "ALL" is_member_of):
 *   - internal_chats (id, org_id, is_group, title, avatar_path, created_by,
 *     last_message_at, last_message_preview, created_at)
 *   - internal_chat_members (chat_id, user_id, org_id, is_admin, unread_count,
 *     last_read_at, joined_at; PK (chat_id,user_id))
 *   - internal_messages (id, chat_id, org_id, sender_user_id, content,
 *     media_path/name/type, reply_to_id, deleted_at, created_at)
 *   Helper SECURITY DEFINER is_internal_chat_member(chat_id) (evita RLS recursivo).
 *   RPC create_internal_chat(member_ids[], is_group, title): cria chat+membros
 *     atômico (evita gotcha do INSERT...RETURNING); no 1:1 REAPROVEITA conversa
 *     existente entre os 2.
 *   Gatilhos AFTER INSERT em internal_messages: bump_internal_chat_on_message
 *     (last_message_* + unread_count +1 nos outros) e notify_push_on_internal_message
 *     (push, espelha o notify_push_on_inbound_message; url '/team-chat'; segredo
 *     embutido = mesmo de antes, redigido nos docs).
 *   Realtime: as 3 tabelas na publicação supabase_realtime (replica identity full
 *     em messages e members).
 *
 * FRONTEND (5 arquivos; types.ts NÃO regenerado → acesso via (supabase as any),
 * por hábito do projeto — CLAUDE.md §8):
 *   - src/components/team-chat/use-team-chat.ts: tipos do domínio, hooks
 *     (useInternalChats/useInternalMessages/useOrgMembers), realtime
 *     (useTeamChatRealtime: postgres_changes nas 3 tabelas → invalida React Query,
 *     mesmo padrão do inbox), PRESENÇA (useOnlineUsers via Supabase Realtime
 *     Presence em canal presence:org:{orgId}, SEM tabela), e mutações
 *     (createInternalChat=RPC, sendInternalMessage=insert direto sem .select()
 *     p/ evitar RETURNING, markChatRead, uploadInternalAttachment, getAttachmentUrl).
 *   - src/components/team-chat/team-chat-screen.tsx: 2 painéis (lista + conversa),
 *     responsivo (no mobile alterna lista↔conversa com voltar, igual inbox), diálogo
 *     "Novo" com abas Pessoa/Grupo, balões verdes (bg-brand-green) p/ mim, anexos
 *     (imagem inline / chip de download via URL assinada), responder, bolinha de
 *     presença, badge de não-lidos.
 *   - src/routes/_authenticated/team-chat.tsx: rota /team-chat.
 *   - src/components/shared/app-sidebar.tsx: item "Chat interno" (ícone
 *     MessagesSquare) logo após "Caixa de entrada".
 *
 * ANEXOS: REUSAM o bucket 'media' em {org_id}/internal-chat/{chat_id}/... (RLS por
 *   org já existente). NOTA: leitura do storage é por EMPRESA (qualquer colega com o
 *   link do arquivo abre); as MENSAGENS são fechadas por participante. Aceitável p/
 *   ferramenta interna; anexos 100% privados por conversa = evolução futura.
 *
 * VALIDAÇÃO: NÃO foi possível rodar tsc/lint/dev localmente — a máquina do Renato
 *   NÃO tem Node/Bun nem node_modules (build/preview rodam no Lovable). Revisão
 *   manual feita; validação real = build do Lovable + teste na Duli (2 usuários p/
 *   presença e push).
 *
 * v2 (ideias, quando quiser): editar/apagar mensagem, "visto", anexos privados por
 *   conversa, gerenciar participantes de grupo (add/remover/sair), reações.
 */

/* ============================================================
 * AJUSTE PÓS-FASE A — INBOX MOBILE: MENU DA MENSAGEM TOCÁVEL — ✅ CONCLUÍDO
 * ============================================================
 * Problema: no celular, o menu de ações da mensagem (Responder, Copiar,
 * Encaminhar, Fixar, Favoritar, Apagar, Reagir) não aparecia. Causa: a setinha
 * que abre o menu (ChevronDown, no componente MessageActions de
 * src/components/inbox/inbox-screen.tsx) era hover-only — classe opacity-0 +
 * group-hover:opacity-100 — e no toque não existe hover.
 *
 * Correção (edição cirúrgica de 1 linha, commit 18add76): a className do botão
 * da setinha passou a ser:
 *   "shrink-0 rounded-full p-1 text-gray-400 opacity-100 transition-opacity
 *    hover:bg-gray-100 hover:text-gray-600 lg:opacity-0 lg:group-hover:opacity-100
 *    data-[state=open]:opacity-100"
 * Ou seja: no celular (< lg) sempre visível; no desktop (>= lg) continua idêntico
 * (invisível, aparecendo no hover do balão ou quando o popover abre). Nada mais foi
 * alterado.
 *
 * Cross-check inbox desktop × mobile (feito): o resto já tinha equivalente mobile —
 * menu "⋮" no topo (Atender/Assumir/Liberar, Transferir, Marcar não lida, Encerrar,
 * Só favoritas); botão "+" no compositor (emoji/anexar/áudio); navegação em camadas
 * (lista ↔ conversa com botão voltar); painel "Dados do contato" em tela cheia.
 * Este menu da mensagem era o ÚNICO recurso realmente faltando no celular.
 */

/* ============================================================
 * AJUSTES PÓS-FASE A — NOTIFICAÇÕES POR ATENDENTE/DEPARTAMENTO — ✅ CONCLUÍDO
 * ============================================================
 * Objetivo: cada usuário só recebe push das conversas que ATENDE (atribuídas a
 * ele) + das que estão AGUARDANDO no(s) DEPARTAMENTO(s) dele. Para de receber as
 * de outros atendentes e as aguardando de outros departamentos.
 *
 * PROBLEMA: o gatilho de banco notify_push_on_inbound_message mandava só { orgId }
 * para a Edge Function push-send; ao receber só orgId, a push-send faz FAN-OUT
 * para TODOS os org_members. Por isso todo mundo recebia tudo.
 *
 * CORREÇÃO (1 só lugar — MEXEU no banco; ver migrations.sql topo
 * "push_notify_route_by_assignee_and_department"): a função
 * notify_push_on_inbound_message foi reescrita para RESOLVER os destinatários em
 * SQL e mandar a lista pronta em { userIds } (NÃO manda mais orgId):
 *   - Conversa COM assigned_user_id            → userIds = [atendente] (só ele).
 *   - SEM atendente, COM department_id         → userIds = membros do departamento
 *       (public.department_members). Depto SEM membros → fallback: todos os
 *       org_members (não perder a conversa).
 *   - SEM atendente e SEM department_id        → todos os org_members.
 *   - Lista vazia                              → não dispara nada.
 *   userIds segue como to_jsonb(uuid[]) (array de strings); distinct aplicado.
 *   Mensagens inbound + ignora 'system:%' (igual antes). Erros engolidos.
 *
 * NÃO mexeu no frontend (0 créditos Lovable) e NÃO precisou redeploy de Edge
 * Function: a push-send (v2, inalterada) JÁ aceita { userIds } no modo interno
 * (header x-internal-secret). Se userIds vier preenchido, ela NÃO faz fan-out.
 *
 * CANAL (importante): NÃO existe tabela usuário↔canal. O canal liga-se a um
 * departamento padrão (channels.default_department_id) e a conversa nasce com
 * department_id. Logo o filtro PRECISO é por DEPARTAMENTO (dado por conversa, que
 * já carrega o roteamento do canal). "Mesmo canal, departamento diferente não
 * recebe" = filtrar por department_id. Acesso por canal por usuário seria feature
 * maior (tabela + tela) — fica para fase futura, se desejado.
 *
 * DECISÃO: dono/admin TAMBÉM segue a regra do departamento (não recebe "tudo").
 * Para um dia deixar dono ver todas as aguardando, basta unir os donos à lista.
 *
 * VERIFICADO (dry-run na Duli, org 90cf8f30-...): aguardando em "Comercial" →
 * ldrumond (Lara) + rdrumond; aguardando em "Clientes" → só rdrumond (Lara NÃO
 * recebe). Função nova confirmada no ar (pg_get_functiondef contém
 * department_members). Conversa atribuída → só o atendente.
 *
 * SEGREDO: o x-internal-secret continua embutido na função (mesmo valor de antes;
 * ver Bitwarden). Nos documentos vivos fica redigido.
 */

/* ============================================================
 * AJUSTES PÓS-FASE A — RESPOSTAS RÁPIDAS COM MÍDIA + VARIÁVEIS — ✅ CONCLUÍDO
 * ============================================================
 * Round de pequenas melhorias antes da Fase B. As Respostas Rápidas
 * (Configurações > Respostas Rápidas) agora suportam ANEXO/ÁUDIO e VARIÁVEIS,
 * e funcionam de PONTA A PONTA (criar/editar + usar no atendimento).
 * (Há mais ajustes pequenos pendentes — seguirão em chat separado.)
 *
 * BANCO (ver migrations.sql, bloco do TOPO "AJUSTES PÓS-FASE A — Respostas
 * Rápidas (mídia)"): 3 colunas novas em quick_replies — media_path, media_name,
 * media_type (text, nulas). Aditivas (não mexem em dados/RLS/enum/índice).
 * content continua NOT NULL (resposta só de mídia grava content=''). Os arquivos
 * vão pro bucket 'media' em {org_id}/quick-replies/{uuid}.{ext}. O types.ts FOI
 * regenerado pelo Lovable (quick_replies já traz as colunas com tipo).
 *
 * ------------------------------------------------------------
 * PARTE A — TELA DE CRIAR/EDITAR ✅ (frontend Lovable)
 * ------------------------------------------------------------
 *   NOVO componente: src/components/settings/quick-replies-settings.tsx
 *   (export QuickRepliesSettings({ orgId })). Foi EXTRAÍDO para fora do
 *   settings-screen.tsx (que estava ~88KB → caiu p/ ~77KB). O settings-screen.tsx
 *   agora só renderiza <QuickRepliesSettings orgId={orgId}/> na aba "Respostas
 *   Rápidas"; todo o CRUD antigo de quick replies (tipo, estado, query, funções e
 *   modal) foi REMOVIDO de lá. Recursos do componente:
 *   - Lista + busca + cards (total / ativas); criar/editar/excluir/ativar.
 *   - Modal: Atalho (sanitiza /[^a-z0-9_-]/), Título (opcional), Mensagem (textarea
 *     com ref p/ inserir no cursor).
 *   - 8 CHIPS DE VARIÁVEIS que inserem {{token}} na posição do cursor:
 *     Primeiro Nome (primeiro_nome), Nome (nome), Atendente (atendente),
 *     Saudação (saudacao), Data (data), Hora (hora), Setor (setor),
 *     Conexão (conexao).
 *   - ANEXAR arquivo (até 16MB) OU GRAVAR áudio (MediaRecorder → webm/ogg), com
 *     pré-visualização (imagem / player de áudio / ícone de arquivo) e remover.
 *   - Permite resposta SÓ de mídia (sem texto). Upload pro bucket 'media' em
 *     {orgId}/quick-replies/{uuid}.{ext}; createSignedUrl(3600) p/ pré-ver a mídia
 *     já salva (bucket é privado). Acesso via (supabase as any) por hábito do
 *     projeto (embora o types.ts já tenha as colunas).
 *   - Bucket 'media' RLS: INSERT/SELECT permitidos se
 *     is_member_of((storage.foldername(name))[1]::uuid) — o caminho TEM de começar
 *     com {org_id}/. Sem política de UPDATE/DELETE (trocar a mídia deixa o arquivo
 *     antigo órfão — aceitável por ora).
 *   LIÇÃO (Lovable MCP) — IMPORTANTE: o send_message PODE reportar "sucesso" +
 *   commit_sha + créditos e MESMO ASSIM não persistir o arquivo (glitch de sync,
 *   comum em arquivo grande). SINAL CONFIÁVEL: edição REAL volta com `edit_id` na
 *   resposta E o get_diff(message_id) funciona; edição falha NÃO traz edit_id e o
 *   get_diff diz "Message has no associated edit". SEMPRE verificar após cada
 *   send_message (get_diff por message_id, ou read_file no ref main). Se falhou,
 *   REPETIR — repetir resolveu (e o agente do Lovable roda `bunx tsc --noEmit`).
 *
 * ------------------------------------------------------------
 * PARTE B — USAR NO ATENDIMENTO (inbox) ✅ (frontend Lovable)
 * ------------------------------------------------------------
 *   src/components/inbox/inbox-screen.tsx. O menu do "/" passou a carregar também
 *   media_path/name/type (tipo QuickReply e o .select() ampliados). Ao escolher
 *   uma resposta rápida, duas coisas:
 *   (1) VARIÁVEIS → valor real: nova função resolveVariables(text) troca os 8
 *       tokens no momento do envio: primeiro_nome (1ª palavra do nome do contato),
 *       nome (displayName), atendente (memberNames[user.id] || user.email),
 *       saudacao (Bom dia <12h / Boa tarde <18h / Boa noite), data e hora (pt-BR),
 *       setor (selected.department.name), conexao (selected.channel.name).
 *       Token desconhecido fica intacto.
 *   (2) MÍDIA → se a resposta tem media_path: baixa do Storage
 *       (supabase.storage.from("media").download), vira File e abre a MESMA janela
 *       "Enviar arquivo" (estado pendingMedia) com o texto resolvido como LEGENDA;
 *       o atendente confere e envia pelo caminho JÁ EXISTENTE confirmSendMedia →
 *       Edge Function send-media. Sem mídia, o texto resolvido vai pro campo de
 *       digitação (setDraft).
 *   Extra: ícone de clipe (Paperclip) no item do menu quando a resposta tem mídia.
 *   CAVEAT (a observar): o áudio é enviado por send-media. Se não tocar como NOTA
 *   DE VOZ no WhatsApp, o ajuste (pequeno e conhecido) é roteá-lo pelo send-audio
 *   (mesmo caminho do microfone do inbox).
 *
 * ============================================================
 * FASE A — CONSTRUTOR DE FLUXOS DE CHATBOT — ✅ CONCLUÍDA (F1–F6)
 * ============================================================
 * Construtor visual de chatbot (estilo ManyChat/Typebot) rodando TUDO dentro do
 * ConectaChat. Motor conversacional COM ESTADO, em produção. Canvas drag-and-drop
 * (React Flow / @xyflow/react v12). Editor em /flows. Esta seção cobre F1 (dados),
 * F2 (lista + canvas), F3 (biblioteca de nós + painéis), F4 (MOTOR DE EXECUÇÃO),
 * F5a (IA real OpenAI/Claude/Gemini + Marketplace de chaves), F5b (modo "IA assume
 * a conversa" / permanente) e F6 (polimento). FASE A ENCERRADA.
 *
 * ------------------------------------------------------------
 * F1 — Fundação de dados ✅ (MEXEU no banco; ver migrations.sql bloco "FASE A / F1")
 * ------------------------------------------------------------
 *   4 tabelas novas no Supabase, todas com org_id + RLS política única "ALL"
 *   is_member_of(org_id):
 *   - flows: o desenho do fluxo. definition jsonb = {nodes, edges} (React Flow).
 *     Colunas: id, org_id, name, description, is_active (default false), definition
 *     (default '{"nodes":[],"edges":[]}'), created_at, updated_at.
 *   - flow_triggers: gatilhos. type flow_trigger_type (welcome/keyword/default),
 *     keyword, channel_id (FK channels ON DELETE SET NULL = "vale p/ todos"),
 *     flow_id (FK flows ON DELETE CASCADE), is_active, priority (int).
 *   - flow_sessions: o ESTADO (em que nó cada contato parou). current_node_id (text),
 *     status flow_session_status (active/ended), variables jsonb. Índice ÚNICO
 *     parcial = no máx. 1 sessão ativa por conversa (uq conversation_id WHERE active).
 *   - ai_credentials: chave de IA por empresa. provider ai_provider
 *     (openai/gemini/claude), label, api_key (text — NÃO criptografada, só RLS +
 *     service role), is_active. UNIQUE (org_id, provider).
 *   Enums: flow_trigger_type, flow_session_status, ai_provider.
 *   IMPORTANTE: types.ts NÃO foi regenerado (tabelas de flow acessadas com casts
 *   `as any` no frontend, de propósito). Novas features de tabela acessadas só via
 *   Edge Function quando types.ts não pode ser regenerado.
 *
 * ------------------------------------------------------------
 * F2 — Lista de Fluxos + canvas React Flow ✅ (só frontend Lovable, projeto d2c4e2b8)
 * ------------------------------------------------------------
 *   @xyflow/react v12. Roteamento aninhado /flows: flows.tsx (Outlet) +
 *   flows.index.tsx (lista) + flows.$flowId.tsx (editor). LIÇÃO: rota-pai com
 *   filhos PRECISA de <Outlet/>. Item "Fluxos" (ícone Workflow) no grupo Atendimento.
 *   use-flows.ts (CRUD + salvar/carregar definition). flows-screen.tsx (lista em
 *   cards). flow-editor.tsx: canvas, nó "Início" (StartNode verde #8FC549,
 *   não-deletável), TELA CHEIA (fixed inset-0 z-50), header Voltar/Ajustar/Salvar.
 *
 * ------------------------------------------------------------
 * F3 — Biblioteca de nós + painéis de configuração ✅ (frontend)
 * ------------------------------------------------------------
 *   node-catalog.ts = FONTE DA VERDADE: 6 categorias × 19 tipos (label/ícone/cor).
 *   flow-sidebar.tsx: barra "COMPONENTES" flutuante, accordion, drag-and-drop NATIVO
 *   HTML5 (não @dnd-kit). flow-editor.tsx: ReactFlowProvider; FlowNode unificado
 *   data-driven; NodeToolbar duplicar/excluir; edges smoothstep verdes; onNodeClick
 *   abre modal. node-config-dialog.tsx: 1 form por nodeType (config em data.config —
 *   sem tabela nova). Nós de Ação usam SELETORES REAIS e guardam o ID do recurso
 *   (tagId/departmentId/agentId/targetFlowId), não texto. use-flow-resources.ts:
 *   useOrgTags/useOrgDepartments/useOrgAgents/useOtherFlows.
 *
 * ------------------------------------------------------------
 * F4 — MOTOR DE EXECUÇÃO ✅ (DEPLOYADO E TESTADO — embutido no whatsapp-webhook)
 * ------------------------------------------------------------
 *   Motor de chatbot dentro da Edge Function whatsapp-webhook. Após gravar a
 *   mensagem RECEBIDA (inbound, 1 a 1, não-grupo), dispara EM SEGUNDO PLANO via
 *   EdgeRuntime.waitUntil (não atrasa a resposta à Evolution).
 *   - Estado em flow_sessions (current_node_id, variables jsonb, status). Chaves de
 *     controle em variables: __awaiting ('menu'|'question'|'ai'), __awaiting_node,
 *     __question_var, __menu_tries (F6).
 *   - Nós Menu/Pergunta PARAM e esperam a próxima mensagem do contato.
 *   - Trava humana: se a conversa tem assigned_user_id OU status closed, o motor
 *     NÃO age (deixa o humano atender).
 *   - Seleção de gatilho (pickTriggerFlow): keyword → welcome (só 1ª mensagem da
 *     conversa) → default; respeita priority; só dispara fluxo is_active=true.
 *   - Menu: mapeia tecla→caminho via sourceHandle "a"+tecla (menu_text) ou
 *     "a"+posição (buttons/list). Condição: handles true/false. Horário: handles
 *     in/out. Início: nó {id:"start", type:"start"}.
 *   - Erros do motor são SEMPRE engolidos (nunca derrubam o recebimento).
 *   Helpers principais: runFlowEngine, runFromNode, runNode (switch dos 19 tipos),
 *   resumeFromWaiting, persistSession/endSession, sendText/sendMedia, nextNodeId,
 *   pickTriggerFlow, loadFlow.
 *
 * ------------------------------------------------------------
 * F5a — IA REAL + MARKETPLACE DE CHAVES ✅ (DEPLOYADO E TESTADO EM PRODUÇÃO)
 * ------------------------------------------------------------
 *   (1) Edge Function `ai-credentials` (verify_jwt true): gerencia ai_credentials
 *       (list com máscara ••••XXXX / save / remove). PROVIDERS = openai/gemini/claude.
 *   (2) Marketplace de Integrações (frontend, /integracoes) estilo HubSpot: grade de
 *       cards. Card "Inteligência Artificial" ATIVO; Webhook/n8n/Calendly/HubSpot
 *       marcados "Em breve". Arquivos: integration-catalog.ts, ai-credentials-card.tsx,
 *       marketplace-screen.tsx, integration-detail-screen.tsx,
 *       route-integracoes.index.tsx, route-integracoes.$slug.tsx. Item "Integrações"
 *       (ícone Blocks) no sidebar.
 *   (3) Execução real da IA no motor (whatsapp-webhook): o nó 'ai' chama o provedor
 *       usando a chave da empresa (ai_credentials), monta histórico recente, envia a
 *       resposta ao contato e guarda na variável (se configurada). Tudo acessório
 *       (erros engolidos). Helpers: callOpenAI/callClaude/callGemini (assinatura
 *       AiCallArgs), callAiProvider (despacho), getAiKey, loadHistory, runAiNode.
 *   FORMATOS DAS 3 APIs (confirmados jun/2026):
 *     OpenAI : POST api.openai.com/v1/chat/completions | auth Bearer | system = role
 *              system em messages | resposta choices[0].message.content
 *     Claude : POST api.anthropic.com/v1/messages | header x-api-key +
 *              anthropic-version: 2023-06-01 | system = campo separado | max_tokens
 *              OBRIGATÓRIO | resposta content[0].text
 *     Gemini : POST generativelanguage.googleapis.com/v1beta/models/{modelo}:
 *              generateContent | header x-goog-api-key | systemInstruction separado |
 *              generationConfig.maxOutputTokens | resposta
 *              candidates[0].content.parts[0].text
 *   v31 (F5a-fix): loadHistory NORMALIZA o histórico para a IA — funde mensagens
 *     consecutivas do mesmo papel e garante início em 'user'. Sem isso, Claude/Gemini
 *     retornam 400 quando há mensagens consecutivas do mesmo lado (comum em produção).
 *
 * ------------------------------------------------------------
 * F5b — MODO "IA ASSUME A CONVERSA" (PERMANENTE) ✅ (DEPLOYADO)
 * ------------------------------------------------------------
 *   Config nova do nó de IA: behavior ('once' | 'permanent') + exitKeywords (texto;
 *   palavras separadas por vírgula/; /quebra de linha).
 *   MOTOR:
 *   - StepResult e retorno de runFromNode aceitam awaiting:'ai'.
 *   - case 'ai': após runAiNode, lê cfg.behavior. Se 'permanent' → retorna
 *     {kind:'wait', awaiting:'ai', nodeId} (ESTACIONA a sessão no nó de IA).
 *     Se 'once' (ou ausente) → segue o fluxo como antes (goto).
 *   - resumeFromWaiting, bloco `if (awaiting === 'ai')`: parseia exitKeywords;
 *     se a mensagem do contato bate uma palavra de saída → nextNodeId (segue o fluxo
 *     pela SAÍDA do nó; se não houver nó ligado, retorna null e a sessão encerra).
 *     Senão → devolve o PRÓPRIO nó de IA; o runFromNode reexecuta o case 'ai', que
 *     responde de novo e re-estaciona. (NÃO chama runAiNode no resume → evita
 *     resposta dupla.)
 *   - Memória automática: loadHistory lê de `messages` (todas as msgs da conversa).
 *   - Saída por humano: já coberta pela trava humana do F4 (assigned_user_id).
 *   TELA (node-config-dialog.tsx, aba "ai" → "Configuração"): seletor "Comportamento"
 *   (Responder uma vez / Assumir a conversa) + campo "Palavras de saída" quando
 *   'permanent'.
 *
 * ------------------------------------------------------------
 * F6 — POLIMENTO ✅ (CONCLUÍDO E TESTADO — webhook v34 no ar)
 * ------------------------------------------------------------
 *   Bloco final da Fase A. 4 itens entregues:
 *
 *   (Item 1) BOTÃO DE FECHAR CONVERSA no inbox ✅ — já existia/foi confirmado.
 *
 *   (Item 2) GATILHO "FLUXO INICIAL" na tela da Conexão ✅ — seletor que cria/edita
 *     um gatilho welcome com channel_id setado (o "fluxo inicial" do canal).
 *
 *   (Item 3) SAÍDAS MÚLTIPLAS no EDITOR ✅ (flow-editor.tsx — arquivo completo
 *     substituído). O FlowNode agora desenha UM HANDLE POR SAÍDA (empilhados à
 *     DIREITA, com rótulo), com o id que o motor espera:
 *       - menu_text → id "a"+tecla (ex.: a1, a2), rótulo "1 · Vendas"
 *       - buttons/list → id "a"+(posição) (ex.: a1, a2, a3), por POSIÇÃO
 *       - condition → "true" / "false" (Verdadeiro/Falso)
 *       - schedule → "in" / "out" (Dentro/Fora do horário)
 *       - demais tipos → 1 saída única SEM id, embaixo (preserva fluxos antigos).
 *     Função-chave nova: getNodeOutputs(nodeType, config). FlowNode calcula
 *     multi = outputs.length > 1 || !!outputs[0]?.id. WORKFLOW PARA O USUÁRIO:
 *     configurar as opções do nó + SALVAR primeiro; aí os handles aparecem com os
 *     rótulos para ligar. Compatível com fluxos antigos (motor tem fallback de
 *     aresta única; condition/schedule fazem nextNodeId(handle) ?? nextNodeId()).
 *
 *   (Item 4) MENU: RESPOSTA INVÁLIDA + LIMITE DE TENTATIVAS ✅ (webhook v34 +
 *     node-config-dialog.tsx). Sem tabela/migração nova — contador em
 *     flow_sessions.variables.__menu_tries.
 *     MOTOR (resumeFromWaiting, awaiting==='menu'):
 *       - Acertou opção → delete __menu_tries; segue o caminho.
 *       - Inválida → maxTries = parseInt(cfg.maxTries) || 3; tries = (__menu_tries||0)+1.
 *         Se tries >= maxTries → delete __menu_tries; procura ESCAPE EDGE =
 *         def.edges.find(source===nó && !(sourceHandle ?? '').startsWith('a'))
 *         (aresta "solta", NÃO de opção a1/a2…); retorna escapeEdge?.target ?? null
 *         (null encerra a sessão — sem loop). Senão → envia invalidMsg
 *         (cfg.invalidMessage || "Opção inválida. Por favor, escolha uma das opções.")
 *         e devolve o PRÓPRIO nó (runNode reenvia o menu e re-estaciona).
 *     TELA (node-config-dialog.tsx, case "menu_text", caixa com borda após "Adicionar
 *     opção"): campos "Mensagem de opção inválida (opcional)" (config.invalidMessage)
 *     e "Máximo de tentativas" (config.maxTries, número, padrão 3).
 *     NOTA DE UX (a observar): criar a aresta de ESCAPE no editor pode ser pouco
 *     intuitivo, pois cada saída agora tem handle nomeado. Se incomodar, a evolução
 *     natural é adicionar um HANDLE DEDICADO de "escape" no nó de menu (rotulado),
 *     igual fizemos com as opções.
 *
 *   F6 — REABERTURA DE CONVERSA ✅ (webhook v33 → consolidado no v34):
 *     Quando chega mensagem de um contato cuja última conversa no canal está FECHADA,
 *     em vez de criar conversa nova (que nasceria vazia), REABRIMOS a MESMA conversa
 *     (status 'open', assigned_user_id=null, reaplica department_id =
 *     channel.default_department_id). Histórico anterior continua visível.
 *     isFirstMessage=true (welcome dispara de novo). justReopened=true grava um
 *     MARCADOR DE SISTEMA: messages com external_message_id='system:reopen',
 *     content="Atendimento reaberto — <Depto ou 'Sem fila'>". Não há índice UNIQUE em
 *     external_message_id (verificado), então 'system:reopen' pode repetir sem erro.
 *     INBOX (inbox-screen.tsx, renderMessages): bloco ANTES do system:transfer →
 *     if (m.external_message_id === "system:reopen") renderiza FAIXA verde larga
 *     (bg-brand-green/90, texto branco centralizado) com o m.content.
 *     NOTA: número de chamado sequencial (#NNNN) FOI ADIADO para a Fase B (precisa de
 *     migração — coluna/sequência por org).
 *
 * ------------------------------------------------------------
 * ESTADO DO WEBHOOK / CHAVES / FLUXO DE TESTE (produção)
 * ------------------------------------------------------------
 *   - Edge Function whatsapp-webhook: VERSÃO 34 no ar (ACTIVE). verify_jwt false
 *     (Evolution chama com ?secret= na URL). function_id
 *     20906221-86d0-4d2b-85ed-e2938b0360e5. Regra: SEMPRE verificar conteúdo após
 *     deploy (get_edge_function) — confirmar que subiu o código real, sem placeholder.
 *   - Edge Function ai-credentials: verify_jwt true.
 *   - Edge Functions de envio do inbox (reusadas pelas Respostas Rápidas): send-message
 *     (texto), send-media (arquivo/imagem/vídeo/doc + legenda), send-audio (nota de
 *     voz do microfone).
 *   - Org Duli Consulting: id 90cf8f30-8089-4e6e-a597-40ebebe8f512.
 *   - Chaves de IA na org Duli (ai_credentials): openai + claude, ambas ativas.
 *     Chave OpenAI também na org ConectaChat.
 *   - Projeto Lovable: d2c4e2b8-d701-43f2-aae2-61d7beedaf5e, branch main.
 *   - Projeto Supabase: lnkctnmmxltsbpnqqnwf.
 *
 * ------------------------------------------------------------
 * O QUE FALTA NA FASE A:
 * ------------------------------------------------------------
 *   NADA. Fase A 100% concluída. Em andamento: round de pequenos ajustes
 *   pós-Fase A (Respostas Rápidas com mídia já entregue; outros ajustes virão em
 *   chat separado). Depois deles, FASE B (Relatórios/Dashboards).
 *
 * Lições da Fase A (viraram regras):
 *   - <Outlet/> em rota-pai; editor fixed inset-0 z-50; drag-drop nativo HTML5 no
 *     canvas; config dos nós em data.config; nós de Ação guardam ID do recurso.
 *   - Saídas múltiplas: handle por saída com id = o que o motor lê (menu "a"+tecla/
 *     posição; condition true/false; schedule in/out). Configurar+salvar antes de ligar.
 *   - Edge Functions Deno/Supabase: sem imports externos, todos os helpers embutidos
 *     no arquivo do webhook. Validar local (esbuild + tsc) antes de deploy.
 *   - Após CADA deploy de Edge Function: verificação pós-deploy imediata.
 *   - Edição na TELA do nó só vai pro banco ao clicar Salvar (verde). Para ajustes de
 *     teste, atualizar o nó direto via SQL (jsonb_set em definition).
 *   - Reabertura: REABRIR a mesma conversa (não criar nova) preserva o histórico.
 *     Marcadores de sistema = mensagens com external_message_id 'system:*'.
 *   - (Pós-Fase A) Lovable send_message pode reportar sucesso e NÃO persistir:
 *     confiar no `edit_id` da resposta + get_diff(message_id); verificar sempre e
 *     repetir se falhou. Arquivos grandes (settings-screen ~88KB, inbox ~124KB):
 *     extrair features novas em componentes próprios e fazer edições cirúrgicas.
 */
