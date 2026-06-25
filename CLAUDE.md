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
- Próximo grande marco: FASE C — bloco C7 (nó Calendly no fluxo; depende do F4) e C8 (relatórios).

## 10. Roadmap até o lançamento (sequência fixa, lançamento único)
- Fase B — Relatórios/Dashboards (inclui o número de chamado sequencial #NNNN, adiado da Fase A).
- Fase C — Integrações reais (EM ANDAMENTO). Calendly: C0–C6 entregues (conexão, leitura, agendamento,
  mensagens automáticas, Pro nativo, sincronização webhook/polling); falta C7 (nó no fluxo, depende do F4) e
  C8 (relatórios). Depois Google Agenda, HubSpot, etc.
- Fase D — Atendente de IA.
- Fase E — Stripe + enforcement de planos + LANÇAMENTO.
  Planos provisórios: Essencial R$149 / Profissional R$297 / Avançado R$597 (anual ~17% off;
  trial 14 dias sem cartão). Stripe começa na conta da Duli; migrar para a entidade ConectaChat com
  ~10 pagantes ou 3 meses (migração = trocar só as chaves de API + product IDs).

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
