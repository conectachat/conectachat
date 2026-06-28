# CLAUDE.md — ConectaChat

> Contexto permanente do projeto. Leia este arquivo inteiro antes de agir.
> Ele substitui a "memória" das conversas: tudo que você precisa saber está aqui.

## 0. Idioma e estilo de trabalho (regras de ouro — não violar)
- Responda SEMPRE em português do Brasil, sem jargão; ao usar um termo técnico, explique em 1 linha.
- O Renato (fundador) NÃO programa. Tome as decisões técnicas por ele e explique em linguagem simples.
- UM passo de cada vez. Espere ele confirmar "feito" antes de avançar.
- Antes de QUALQUER mudança em produção (banco, Edge Function, deploy), avise o que será feito e o risco.
- Seja honesto sobre riscos, custos e limitações (inclusive termos de uso — ex.: WhatsApp via QR é
  não-oficial, com risco de banimento do número).
- Nunca invente informação. Se precisar de dado atual (preço, versão, API), pesquise antes.
- Leia os arquivos AO VIVO antes de editar — nunca confie só na memória ou em cópias antigas.

## 1. O produto
ConectaChat = SaaS de atendimento omnichannel, WhatsApp-first, multiempresa (multi-tenant): caixa de
entrada única, múltiplos usuários, departamentos, transferência de conversas, planos e cobrança.
É um webapp instalável (PWA) e, no futuro, um app mobile. Produção: app.conectachat.online.
Cores da marca: verde #8FC549, azul #0055A6.

## 2. Seu papel (Claude Code)
Você é o engenheiro de software responsável do Renato. Escreve o código pronto, toma as decisões
técnicas, mostra o diff para revisão e explica o porquê de forma acessível.

## 3. Stack
- Frontend: React 19 + TanStack Router (file-based) + TanStack Start + Vite 7 + Tailwind v4 +
  shadcn/ui (Radix). Gerenciador de pacotes: Bun. Canvas de fluxos: @xyflow/react v12.
- Backend: Supabase (Postgres + Auth + RLS + Edge Functions em Deno + Realtime + pg_net).
  Isolamento por empresa via RLS (todo dado tem org_id; política única "ALL" via is_member_of(org_id)).
- Canais: Evolution API v2.3.7 (WhatsApp QR + Cloud + Instagram + Messenger), no VPS
  (evolution.conectachat.online). E-mail: Resend. Cobrança: Stripe (entra na Fase E). n8n (VPS, opcional).
- Hospedagem do frontend: Lovable (sincroniza com o GitHub) → vira PWA.

## 4. Comandos do projeto (rodar na raiz da pasta)
- Instalar dependências: `bun install`
- Rodar local (servidor de desenvolvimento): `bun run dev`
- Build de produção: `bun run build`
- Conferir tipos TypeScript: `bunx tsc --noEmit`  ← rode SEMPRE depois de editar arquivos .ts/.tsx
- Lint: `bun run lint`   |   Formatar: `bun run format`
- NUNCA edite `src/routeTree.gen.ts` (gerado automaticamente pelo TanStack Router).

## 5. Fluxo de trabalho (IMPORTANTE — mudou ao adotar o Claude Code)
Este repositório está conectado ao Lovable, que sincroniza com o GitHub nos dois sentidos. Agora o
código é editado LOCALMENTE pelo Claude Code. Para NÃO dar conflito:
- O Claude Code passa a ser o "dono" das edições de CÓDIGO (frontend). O Lovable vira hospedagem/preview
  que sincroniza a partir do GitHub. EVITE editar o mesmo código pelo chat do Lovable e pelo Claude Code.
- Antes de começar a trabalhar: `git pull` (puxa o que o Lovable possa ter mudado).
- Depois de revisar/aceitar as mudanças: `git commit` + `git push`. O Lovable sincroniza do GitHub e publica.
- BANCO e Edge Functions NÃO ficam neste repositório — são alterados via Supabase (MCP): migrations +
  deploy, igual antes.
- Teste sempre na empresa Duli Consulting primeiro (dados reais), nunca só no preview.

## 6. Identificadores-chave (são identificadores, NÃO segredos)
- Projeto Lovable: d2c4e2b8-d701-43f2-aae2-61d7beedaf5e (branch: main)
- Projeto Supabase: lnkctnmmxltsbpnqqnwf
- Org Duli Consulting (cliente de teste): 90cf8f30-8089-4e6e-a597-40ebebe8f512
- Org ConectaChat: a6728cee-38b1-427f-922b-097bddd1c466
- Edge Function whatsapp-webhook: function_id 20906221-86d0-4d2b-85ed-e2938b0360e5 (verify_jwt FALSE)
- super_admin: rdrumond@conectachat.online | cliente Duli: rdrumond@duliconsulting.com

## 7. Princípios de arquitetura (não violar)
- Dois planos de acesso separados: (A) Plataforma = equipe ConectaChat (super_admin + finance/sales/
  support/ops); (B) Tenant = cada empresa cliente (owner/admin/agent + permissões por usuário).
  Um cliente NUNCA vê dados de outro.
- Multi-tenant via RLS: todo dado tem org_id; política única "ALL" via is_member_of(org_id).
- Camada de canais desacoplada (começou com WhatsApp QR via Evolution; dá pra adicionar/migrar canais).
- Uma empresa pode conectar vários canais; o limite vem do plano (max_channels).

## 8. Banco (Supabase) — como mexer
- DDL (criar/alterar tabela, coluna, enum): via migrations (nome em snake_case). Nunca via Lovable.
- Edge Functions (Deno): helpers embutidos no arquivo (sem dependências externas problemáticas); validar
  local antes; SEMPRE conferir a versão ACTIVE depois do deploy (não confiar só na resposta de "sucesso").
- Colunas novas: se o types.ts não for regenerado, acessar via `(supabase as any)` ou por Edge Function.
- O whatsapp-webhook é deployado com verify_jwt FALSE (a Evolution chama com `?secret=` na URL).

## 9. Estado atual
- FASE A — Construtor visual de chatbot (motor conversacional COM ESTADO no whatsapp-webhook) —
  CONCLUÍDA (F1 a F6).
- Ajustes pós-Fase A já entregues:
  - Respostas Rápidas com mídia + variáveis (criar/editar em Configurações e usar no atendimento).
    Mexeu no banco: 3 colunas em quick_replies (media_path, media_name, media_type).
  - Notificações push roteadas: cada usuário só recebe push das conversas que ATENDE (atribuídas a ele)
    + das que estão AGUARDANDO no(s) departamento(s) dele. Feito no gatilho de banco
    notify_push_on_inbound_message, que resolve os destinatários e manda userIds prontos para a Edge
    Function push-send. (Conversa atribuída → só o atendente; aguardando com depto → membros do depto;
    depto vazio/sem depto → todos da empresa.)
  - Inbox mobile: o menu da mensagem (Responder/Copiar/Encaminhar/Fixar/Favoritar/Apagar/Reagir) agora
    aparece e é tocável no celular (antes a setinha era hover-only, invisível ao toque).
  - Chat Interno (colaborador ↔ colaborador): mensagens entre membros da MESMA empresa dentro do app
    (tipo Slack simplificado, separado das conversas com clientes). Entregue: 1:1 + grupos, texto +
    anexos, presença (online) e push. Rota /team-chat + item "Chat interno" no menu. Mexeu no banco:
    3 tabelas (internal_chats, internal_chat_members, internal_messages) com RLS POR PARTICIPANTE
    (helper is_internal_chat_member), RPC create_internal_chat (cria chat+membros atômico; 1:1 reaproveita
    a conversa existente) e 2 gatilhos em internal_messages (last_message_*/unread + push espelhando o do
    inbox); realtime nas 3 tabelas. Presença via Supabase Realtime Presence (sem tabela). Anexos no
    bucket 'media' em {org_id}/internal-chat/. Frontend em src/components/team-chat/*; types.ts via
    (supabase as any). ATENÇÃO: esta máquina NÃO tem Node/Bun/node_modules — build/validação rodam no
    Lovable, não localmente (não tente bun/tsc/lint local sem instalar o toolchain).
- FASE B — Dashboard (Relatórios) — ENTREGUE (v1). Módulo "Dashboard" é o PRIMEIRO item do menu (acima
  da Caixa de entrada), rota /dashboard. Métricas calculadas NO BANCO (5 funções report_*: overview,
  timeseries, by_agent, by_channel, by_department; todas validam is_member_of). As funções recebem o
  PERÍODO ('hoje'/'7d'/'30d'/'custom') + filtros canal/depto/atendente e calculam a janela e a quebra
  por dia no FUSO DA EMPRESA (organizations.timezone, via helper report_window) — não mais UTC. Base de
  métricas: conversations ganhou closed_at e first_response_at (gatilhos + backfill). Número de chamado
  #NNNN por empresa: conversations.ticket_number + tabela org_ticket_counters + gatilho atômico; exibido
  no cabeçalho da conversa no inbox. Frontend: src/components/reports/* (tela com KPIs, gráfico recharts,
  tabelas + export CSV). Em aberto p/ evoluir: restringir /dashboard a dono/admin.
- FASE C (Integrações reais) — EM ANDAMENTO. Calendly: C0–C6 ENTREGUES e testados na Duli (ver
  docs/conectachat-calendly-plano.md, seção 0). Card único adaptativo em /integracoes/calendly que detecta
  plano Light (grátis) ou Pro (pago). Banco: calendly_connections (tokens OAuth no Supabase VAULT; funções
  calendly_* só service_role; coluna webhook_subscription_uri), appointments (RLS+realtime; índice único
  NÃO-parcial em calendly_invitee_uri), calendly_message_settings, +colunas appointment_id/kind em
  scheduled_messages. Edge Functions: calendly-oauth-start (jwt on), calendly-oauth-callback (jwt off; valida
  state HMAC + detecção de plano create+delete), calendly-disconnect v2 (jwt on; apaga a inscrição de webhook),
  calendly-api v9 (jwt on: event_types[+locations/custom_questions]/available_times/capture_booking/book/
  cancel/ensure_webhook + renovação de token c/ rotação + geração de notificações), calendly-webhook v2
  (jwt off; valida assinatura HMAC), calendly-poll v2 (jwt off; cron 5min, protegida por CRON_SECRET). Secrets:
  CALENDLY_CLIENT_ID/CLIENT_SECRET/WEBHOOK_SIGNING_KEY. Frontend: card + config de mensagens em
  /integracoes/calendly; painel "Agendar" no inbox (Light=embed; Pro=agendamento NATIVO via Scheduling API —
  seletor de horário + formulário com e-mail e perguntas obrigatórias, sem iframe; card + cancelar + remarcar).
  C5: ação `book` (POST https://api.calendly.com/invitees; escopo scheduled_events:write JÁ presente na app
  OAuth; trata `location` e custom_questions; reusa o helper de captura → appointments source='manual' +
  mensagens) + cancel robusto (evento de outra conta Calendly → remove só localmente, localOnly). Remarcar =
  embed do reschedule_url (não há API) com fallback "abrir em nova aba"; embed monta por callback ref (sem
  corrida/tela em branco). C6 (sincronização de cancelar/remarcar): Pro via webhook (calendly-webhook valida
  assinatura HMAC com CALENDLY_WEBHOOK_SIGNING_KEY; a inscrição é criada com a NOSSA signing_key pela ação
  ensure_webhook, chamada no `book` E pelo card — confiável, não depende de abrir a página); Light via polling
  pg_cron 5min (calendly-poll, job 'conectachat-calendly-poll'). C4 REUSA scheduled_messages + run-scheduled
  (NÃO criar fila nova). NOTIFICAÇÕES AUTOMÁTICAS (entregue 2026-06-25): 5 tipos por org em
  calendly_message_settings — imediatas 'agendado'/'remarcado'/'cancelado' (enfileiradas em captureAppointment
  e na ação cancel; e quando o cliente cancela no Calendly via calendly-webhook/calendly-poll, pulando
  remarcação pelo flag invitee.rescheduled) + por tempo 'confirmação'/'lembrete' (C4). Config no card do
  Calendly (calendly-messages-settings.tsx, 5 blocos). LIMITAÇÃO: remarcação feita pelo cliente DIRETO no
  Calendly não dispara 'remarcado' (novo invitee externo não ligado à conversa); pelo app (embed) dispara.
  PRÓXIMO: C7 (nó no fluxo — depende do F4), C8 (relatórios). EM ABERTO: ajuste de UI do agendamento (Renato
  anotou; não mexer por ora).
- Fix WhatsApp (entregue junto do C5): manage-channels v7 — ação `qr` força sessão nova (PUT
  /instance/restart) + reaplica webhook quando a instância trava em "connecting" (antes só GET
  /instance/connect); se já está "open", não reinicia (não derruba número conectado). Resolve a falha de
  reconexão pelo app. Restart na Evolution v2 é PUT (não POST). [[whatsapp-qr-reconnect-fix]]
- FASE D — ATENDENTE DE IA (módulo "Agentes") — EM ANDAMENTO (entregue e testado na Duli).
  Empresa cria agentes reutilizáveis: persona + base de conhecimento (TEXTO colado, Fase 1) +
  provedor/modelo (dropdown, src/lib/ai-models.ts — IDs atuais: Claude haiku-4-5/sonnet-4-6/opus-4-8;
  Gemini 2.5; OpenAI 4o/4.1) + ativação (sempre/quando_ninguem_atende/fora_do_horario com horário
  comercial) + handoff (departamento + palavras-gatilho + marcador [HANDOFF]) + alocação por canal.
  Banco: tabela ai_agents (RLS is_member_of), channels.ai_agent_id (1 agente/canal), conversations.
  ai_agent_id/ai_status, contacts.ai_enabled (interruptor por contato, PADRÃO true desde o Passo 2 —
  botão "Chatbot" no inbox agora é DESLIGAR pontual; a segurança vem da regra "só sem humano", abaixo).
  Execução no
  whatsapp-webhook (runAgentAttendant): roda quando NENHUM fluxo trata a mensagem; reusa
  callAiProvider/getAiKey/loadHistory. Frontend: rota /agentes + menu "Agentes" + lista + editor
  (src/components/agents/*, src/hooks/use-ai-agents.ts). PASSO 1 ENTREGUE (webhook v39): o nó "ai" do
  construtor de fluxos pode USAR UM AGENTE — seletor "Usar um agente" em node-config-dialog.tsx (hook
  useAiAgents); quando escolhido, esconde provedor/modelo/prompt e o runAiNode carrega o agente
  (cfg.aiAgentId → ai_agents), monta o prompt via buildAgentSystemPrompt com humanize/handoff FORÇADOS
  OFF (bolha única, sem |||/[HANDOFF]; chave continua de ai_credentials; temperature/maxTokens/history/
  behavior seguem do nó). Roda mesmo com agente is_active=false (a presença no fluxo é a ativação).
  Fluxos antigos sem aiAgentId: comportamento idêntico ao anterior. PASSO 2 ENTREGUE (sem mudar webhook):
  (a) IA SEMPRE LIGADA — migration contacts_ai_enabled_default_true (ai_enabled DEFAULT true + ligou os
  63 contatos existentes); a regra "só responde sem humano" já estava no runAgentAttendant (para se
  conversa atribuída OU ai_status='handed_off'); botão "Chatbot" vira desligar pontual (false=off).
  (b) INBOX — 4ª aba "Agentes" (inbox-screen.tsx + use-conversations.ts traz ai_status): roteamento por
  ai_status — Agentes = sem atendente E ai_status='active' (IA atuando); Aguardando = sem atendente E
  ai_status≠'active' (handoff/sem-IA, espera humano); Minhas = atribuída a mim; Todas. PASSO 3 ENTREGUE
  (frontend puro, sem banco/webhook): barra de filtros entre a busca e as abas — Abertos/Fechadas
  (status; "closed" parametriza useConversations(status) e cai na aba Todas, limite 200), Crescente
  (toggle de ordenação asc/desc client-side por last_message_at), Filas (dropdown por department_id via
  useOrgDepartments) e "Fechar todas" (encerra em massa SÓ as conversas abertas atribuídas ao próprio
  usuário, com confirmação + contagem; não toca nas de outros). Falta Passo 4 (níveis hierárquicos:
  dono/admin tudo, atendente só as dele + filas dele). HUMANIZAÇÃO + ANTI-BAN (webhook v38,
  por agente via ai_agents.humanize_replies/reply_delay_seconds): mostra "digitando…"
  (POST /chat/sendPresence), buffer inicial, resposta em 1–3 bolhas (separadas por |||, typing
  min(3000,1200+len*35)ms, jitter 700–1500ms); anti-banimento SEMPRE ativo (6 msgs/10min por
  contato, 20/min por empresa → agente fica em SILÊNCIO no pico). LIÇÃO: IDs de modelo dos provedores
  mudam/aposentam — conferir no catálogo oficial (skill claude-api). ROADMAP IA: RAG por upload
  (Fase 2), function calling (agendar/transferir), nó de fluxo escolher agente, métricas, limites
  anti-ban por plano. FALHA DE IA VISÍVEL ENTREGUE (webhook v40): colunas conversations.ai_last_error
  (+_at); helpers setAiError/clearAiError no webhook gravam o motivo quando a IA falha (sem chave,
  resposta vazia, exceção) — em runAgentAttendant E runAiNode — e limpam no sucesso. NÃO marca em
  silêncio anti-ban/gates normais. Inbox: selo "⚠️ IA" no card + banner vermelho dispensável no topo da
  conversa (dismissAiError limpa ai_last_error). use-conversations traz ai_last_error(+_at).
  ACIONAR FLUXO MANUALMENTE ENTREGUE (webhook v41 + nova Edge Function trigger-flow): botão "Acionar
  fluxo" no cabeçalho da conversa (+ menu mobile) abre modal com os fluxos ATIVOS (useFlows) e dispara
  na conversa atual. Arquitetura: trigger-flow (verify_jwt TRUE) valida o usuário pelo JWT + vínculo
  (org_members) e que o fluxo é da mesma org, e chama o whatsapp-webhook com ?secret=WEBHOOK_SECRET +
  body {action:'trigger_flow',conversation_id,flow_id}; o webhook monta EngineInput da conversa
  (buildEngineInputForConversation), encerra sessão ativa e inicia o fluxo (triggerFlowManually reusa
  loadFlow/runFromNode/persistSession). Segredo nunca vai ao navegador; motor num lugar só.
  PASSOS RESTANTES: (1) ✅ nó de fluxo escolher agente (v39); (2) ✅ acionar fluxo manualmente (v41 +
  trigger-flow); (3) CALIBRAR o tempo do "digitando…" (não proporcional ao tamanho); (4) ✅ falha de IA
  visível (v40); (5) ✅ /agentes restrito a dono/admin; (6) níveis hierárquicos no inbox (Passo 4:
  dono/admin tudo, atendente só as dele + filas dele). Plano detalhado:
  docs/conectachat-agentes-ia-plano.md.
- Próximo grande marco: FASE C — bloco C7 (nó Calendly no fluxo; depende do F4) e C8 (relatórios).

## 10. Roadmap até o lançamento (sequência fixa, lançamento único)
- Fase B — Relatórios/Dashboards (inclui o número de chamado sequencial #NNNN, adiado da Fase A).
- Fase C — Integrações reais (EM ANDAMENTO). Calendly: C0–C6 entregues (conexão, leitura, agendamento,
  mensagens automáticas, Pro nativo, sincronização webhook/polling); falta C7 (nó no fluxo, depende do F4) e
  C8 (relatórios). Depois Google Agenda, HubSpot, etc.
- Fase D — Atendente de IA (quase fechada; falta níveis hierárquicos no inbox + calibrar "digitando…").
- MVP PRÉ-LANÇAMENTO — recursos de operação decididos 2026-06-26 (estudo das referências AtendChat +
  Remix AtendeZap). Plano completo + refs de código em ~/.claude/plans (vamos-continuar-a-fase-pure-island.md).
  (1) CAMPANHAS/disparo em massa — BACKEND COMPLETO + FRONTEND CORE ENTREGUES. Banco: campaigns,
  campaign_recipients, contact_lists, contact_list_members (RLS is_member_of; migration campaigns_e_listas).
  Edge Functions: manage-campaign (jwt on: create+enfileira/pause/resume/cancel, valida org_members) +
  run-campaign (jwt off, cron pg_cron 'conectachat-run-campaign' * * * * * com x-cron-secret; envio paceado
  ANTI-BAN: rate_per_min+jitter, daily_cap 24h, janela 08–20 fuso da empresa, backstop org ~20/min, pula
  contacts.blocked, reserva 'sending', completa sozinho). Opt-out no webhook v44 (handleOptOut: "sair/parar/
  cancelar" curtas → contacts.blocked=true + confirmação 1×). Frontend: menu "Campanhas" (adminOnly) + rota
  /campanhas (guard) + campaigns-screen.tsx (lista+progresso+pausar/retomar/cancelar) + modal nova campanha
  (canal, alvo etiqueta/todos, mensagem+variáveis {primeiro_nome}/{nome}, ritmo Conservador/Normal/custom +
  ALERTA DE RISCO POR CANAL via channelRiskInfo, horário comercial/humanizar, agendar). Hook use-campaigns.ts.
  LISTAS DEDICADAS ENTREGUES: use-contact-lists.ts (useContactLists + createContactList + addContactsToList);
  alvo 'list' no modal de campanha; importação de contatos pode criar/usar uma lista (contacts-screen modal).
  FALTAM (follow-ups): MÍDIA na campanha (run-campaign já suporta; falta UI de upload); TESTE LIVE pendente
  com poucos contatos (envia WhatsApp real — testar com etiqueta de 1 número antes de público real).
  (2) ✅ IMPORTAR CONTATOS — JÁ EXISTIA (contacts-screen.tsx handleFileChosen, CSV/XLSX, validação BR,
  dedup, upsert). ENTREGUE o ajuste de ETIQUETA na importação: seletor de tag opcional no modal
  (useOrgTags) → após o upsert, marca TODOS os contatos do arquivo via contact_tags (upsert
  ignoreDuplicates) para já mirar campanhas. Falta só "jogar numa LISTA dedicada" (depende das tabelas
  contact_lists, que vêm com Campanhas).
  (3) ✅ HORÁRIO DE ATENDIMENTO / fora de expediente — ENTREGUE (por DEPARTAMENTO, decisão do Renato).
  Banco: departments.business_hours(jsonb)/out_of_office_enabled/out_of_office_message (migration
  department_business_hours). Webhook v43 (runOutOfOffice): quando nenhum fluxo trata, NÃO há agente de IA
  no canal e sem humano → resolve o depto (conversation.department_id|channel.default_department_id), se
  fora do business_hours do depto e toggle ligado → envia out_of_office_message 1×/6h por conversa
  (sendOutOfOffice, marcador external_message_id 'system:offhours'; reusa isWithinBusinessHours). UI: editor
  no modal de Departamento (settings-screen.tsx — toggle+mensagem+grade DAYS/Switch/time).
  Backlog pós-lançamento (em docs/roadmap.md): NPS, distribuição
  automática+carteira, campos personalizados, transcrição de áudio, aniversários, notas internas, API
  pública+webhooks, LGPD, onboarding por IA. NÃO priorizar Typebot/Dialogflow/n8n (temos fluxo+IA).
- Fase E — Stripe + enforcement de planos + LANÇAMENTO.
  Planos provisórios: Essencial R$149 / Profissional R$297 / Avançado R$597 (anual ~17% off;
  trial 14 dias sem cartão). Stripe começa na conta da Duli; migrar para a entidade ConectaChat com
  ~10 pagantes ou 3 meses (migração = trocar só as chaves de API + product IDs). Considerar p/ o público
  BR: gateways nacionais (Kiwify/Cakto/Perfectpay) via webhook, além do Stripe (visto nas referências).

## 11. Gotchas críticos (já nos morderam)
- Nunca editar src/routeTree.gen.ts (gerado automaticamente).
- Rota-pai com filhos precisa de `<Outlet/>`.
- INSERT...RETURNING pode falhar no RLS quando a policy de SELECT usa função SECURITY DEFINER STABLE que
  re-consulta a mesma tabela (a linha recém-inserida fica invisível). Separar o insert da leitura.
- Multi-statement SQL costuma retornar só o último resultado — enviar uma query por vez.
- Arquivos grandes (src/components/inbox/inbox-screen.tsx ~127KB; settings-screen.tsx ~77KB): editar
  cirurgicamente; extrair features novas em componentes próprios em vez de inchar o arquivo.

## 12. Segurança (inegociável)
- Segredos (chaves VAPID, chaves de API de IA, x-internal-secret do push, etc.) ficam SÓ no Supabase
  (Edge Function secrets) e no Bitwarden — NUNCA no código nem neste arquivo.
- Em produção, manter os dados de clientes isolados do OpenClaw (assistente pessoal no mesmo VPS).

## 13. Como o Renato pede tarefas
- Ele descreve o objetivo em linguagem natural. Você propõe o plano, mostra o diff e ele aceita/recusa
  cada mudança (modo "Pedir permissão"/Ask). Para algo grande, primeiro o PLANO, depois a execução.

## 14. Documentos vivos detalhados (pasta docs/)
Para o estado técnico COMPLETO, o roadmap detalhado e o histórico de banco (DDL), consulte:
- docs/conectachat-estado-atual.md — estado técnico detalhado (tudo que já foi feito, com os porquês).
- docs/conectachat-roadmap.md       — roadmap detalhado até o lançamento.
- docs/conectachat-migrations.sql   — histórico de todas as mudanças de banco (DDL). Segredos redigidos.
Este CLAUDE.md é o RESUMO sempre-ligado; os docs/ são o detalhe consultado sob demanda.
Ao concluir cada bloco de trabalho: atualize o(s) documento(s) relevante(s) em docs/ E o resumo da
seção 9 ("Estado atual") aqui no CLAUDE.md; depois faça commit + push. (Não há mais "reanexar" docs.)
