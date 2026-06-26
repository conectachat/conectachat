# Fase D — Atendente de IA (módulo "Agentes")

Estado: EM ANDAMENTO, entregue e testado na Duli. Doc vivo — atualizar a cada bloco.

## Visão
A empresa cria **agentes de IA reutilizáveis**. Cada agente tem persona (system prompt),
base de conhecimento (texto), comportamento configurável e handoff para humano. O agente
responde no WhatsApp quando **nenhum fluxo** trata a mensagem. Reaproveita a infraestrutura
de IA já existente (ai_credentials + a IA embutida no whatsapp-webhook, F5a/F5b).

## Banco
- **ai_agents** (RLS "ALL" via is_member_of): name, is_active, persona, knowledge_base,
  provider (enum ai_provider: openai/gemini/claude), model, activation_mode
  (`sempre`/`quando_ninguem_atende`/`fora_do_horario`), business_hours (jsonb, dias×horas),
  handoff_enabled, handoff_department_id (FK departments), handoff_message, handoff_keywords,
  greeting, **humanize_replies** (bool, default true), **reply_delay_seconds** (int, default 3).
- **channels.ai_agent_id** (FK ai_agents) — 1 agente por canal; um agente cobre vários canais.
- **conversations.ai_agent_id** + **conversations.ai_status** (`active`/`handed_off`/null) —
  estado da IA por conversa (zerado ao reabrir conversa).
- **contacts.ai_enabled** (bool, default **true** desde o Passo 2) — interruptor do chatbot POR CONTATO.
  Agora a IA vem LIGADA por padrão; o botão "Chatbot" no inbox vira DESLIGAR pontual (false=off). A
  segurança não é mais "opt-in por contato", e sim a regra "só responde sem humano" (ver Passo 2).

## Edge Function whatsapp-webhook (v39 ACTIVE, verify_jwt false)
- `runAutomation` = motor de fluxo primeiro; se NENHUM fluxo tratou → `runAgentAttendant`.
- `runAgentAttendant`: gates (trava humana, status, ai_status handed_off, agente alocado,
  contact.ai_enabled, agente ativo, ativação/horário) → handoff por palavra-gatilho →
  **anti-ban** (`agentRateLimited`: silêncio se ≥6 outbound auto/10min na conversa ou ≥20/min na
  org) → chama a IA (`buildAgentSystemPrompt` + callAiProvider) → envia (`sendAgentReply`).
- **Humanização** (`sendAgentReply`, se humanize_replies): buffer `reply_delay_seconds` →
  `splitReplyParts` (1–3 bolhas por `|||`) → por bolha: `sendPresence('composing', typingMs)` +
  espera `min(3000,1200+len*35)`ms + `sendText` + jitter 700–1500ms. Sem humanize: envia de uma vez.
- `sendPresence` = `POST {evolutionUrl}/chat/sendPresence/{instance}` `{number,presence,delay}` (apikey).
- Handoff: `[HANDOFF]` no texto da IA OU palavra-gatilho → `doHandoff` (avisa cliente, joga p/ depto,
  marca ai_status='handed_off'; a IA não volta até reabrir).
- Defaults de fallback dos provedores corrigidos: Claude `claude-sonnet-4-6`, Gemini `gemini-2.5-flash`.

## Frontend
- Rota `/agentes` (+ `/agentes/$agentId`), item "Agentes" no menu (src/routes/_authenticated/agentes*).
- `src/components/agents/agents-screen.tsx` (lista) + `agent-editor.tsx` (editor com cards:
  Identidade/modelo, Personalidade, Base de conhecimento, Quando atende, Handoff, **Humanização e
  segurança**, Onde atua). `src/hooks/use-ai-agents.ts` (CRUD + canais + chaves).
- Modelo: `src/components/shared/ai-model-select.tsx` + `src/lib/ai-models.ts` (lista por provedor +
  "Outro"). Mesmo seletor no nó de IA do fluxo. **Atenção:** IDs de modelo aposentam — manter a lista
  atual (catálogo oficial via skill claude-api).
- Inbox: botão "Chatbot" no cabeçalho da conversa (liga/desliga `contacts.ai_enabled`) — desktop e
  menu mobile (src/components/inbox/inbox-screen.tsx + src/hooks/use-conversations.ts).

## Decisões fixadas
- Base de conhecimento = texto colado (Fase 1). RAG por upload = Fase 2 (diferencial de plano).
- Humanização LIGADA por padrão, configurável por agente.
- Anti-ban: ao bater o limite, o agente fica em SILÊNCIO (não passa para humano).
- Provedor/modelo por agente; chaves reaproveitam ai_credentials (card /integracoes/ai).

## Passos restantes (para uma conversa nova) — em ordem sugerida
1. ✅ **ENTREGUE (webhook v39) — Nó de IA do fluxo escolher um agente** (Bloco 4 original): o nó "ai"
   ganhou o seletor "Usar um agente" (guarda `cfg.aiAgentId` no JSON do nó — SEM mudança de banco).
   Quando escolhido, o frontend esconde provedor/modelo/prompt do sistema e mostra a nota do agente;
   o `runAiNode` ramifica: se `cfg.aiAgentId`, carrega o agente de `ai_agents` e monta o system prompt
   via `buildAgentSystemPrompt({ ...agent, humanize_replies:false, handoff_enabled:false })` — bolha
   ÚNICA, sem `|||`/[HANDOFF] (decisão do Renato); chave continua de `ai_credentials`;
   temperature/maxTokens/history/behavior/responseVariable seguem do nó. Roda mesmo com agente
   `is_active=false` (a presença no fluxo é a ativação; e o `runAiNode` só executa dentro do fluxo).
   Defesa: limpa `|||` residual antes do `sendText`. Fluxos antigos sem `aiAgentId` → caem no `else`,
   comportamento idêntico ao anterior. Toca: `src/components/flows/node-config-dialog.tsx` (import
   `useAiAgents`) e `runAiNode` no `whatsapp-webhook` (v38→v39, verify_jwt FALSE).
2. **Botão "Acionar fluxo manualmente" no inbox** (Feature 2, planejada e NÃO feita): o atendente
   escolhe um fluxo e dispara na conversa atual. Precisa de uma Edge Function `trigger-flow` (jwt on)
   que valida o membro e inicia o fluxo reusando o motor do webhook (caminho interno protegido por
   segredo). Referência: atendchat `src` (TriggerFlowService / TicketController.triggerFlow).
3. **Calibração do tempo de "digitando…"** (refinamento anotado pelo Renato): hoje o tempo do
   indicador não está proporcional ao tamanho da mensagem. Ajustar a fórmula em `sendAgentReply`
   (`typingMs = min(3000, 1200 + len*35)`) e/ou o uso de `sendPresence` para casar melhor.
4. **Tornar falhas de IA visíveis** (robustez): quando o provedor devolve vazio, gravar um aviso
   interno na conversa (não enviado ao cliente) tipo "⚠️ IA não respondeu — verifique modelo/chave".
5. **Restringir /agentes a dono/admin** (igual decisão em aberto do Dashboard).

## Roadmap IA (fora do MVP)
- RAG por upload de documentos (pgvector) — base de conhecimento via arquivos (Fase 2, diferencial de plano).
- Function calling (agendar no Calendly, transferir) — "responder + executar ações".
- Métricas do agente (respostas, handoffs, tempo); limites anti-ban configuráveis por agente/plano.
- Humanização também no nó de IA do fluxo (hoje só no agente do canal).

## Histórico de blocos
- B1: migration ai_agents + channels.ai_agent_id + conversations.ai_agent_id/ai_status.
- B2: módulo Agentes (frontend) + seletor de modelo por dropdown.
- B3: execução no whatsapp-webhook (runAgentAttendant) + roteamento + handoff (v36/v37).
- Segurança: contacts.ai_enabled (padrão false) + botão "Chatbot" no inbox (v37).
- Fix: IDs de modelo aposentados → atualizados (Claude/Gemini/OpenAI).
- S1/S2/S3: humanização (digitando…+partes+buffer) + anti-banimento (v38) + UI no editor.
- Passo 1 (v39): nó "ai" do fluxo pode usar um Agente (seletor `cfg.aiAgentId` + ramificação no
  `runAiNode` reusando `buildAgentSystemPrompt`, bolha única). Sem mudança de banco.
- Passo 2: (a) IA SEMPRE LIGADA — migration `contacts_ai_enabled_default_true` (default true + ligou os
  63 contatos existentes); a regra "só sem humano" já estava no `runAgentAttendant` (NÃO mexeu no
  webhook). (b) INBOX — 4ª aba "Agentes" roteando por `ai_status`: Agentes = sem atendente E
  `ai_status='active'`; Aguardando = sem atendente E `ai_status≠'active'`; Minhas = atribuída a mim;
  Todas. Toca `src/components/inbox/inbox-screen.tsx` + `src/hooks/use-conversations.ts` (passou a
  trazer `ai_status`). PRÓXIMOS: Passo 3 (barra de filtros: Fechar todas/Abertos/Fechadas/Crescente/
  Filas) e Passo 4 (níveis hierárquicos: dono/admin tudo, atendente só as dele + filas dele).
