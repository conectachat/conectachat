FASE A — CONSTRUTOR DE FLUXOS DE CHATBOT — ✅ CONCLUÍDA (F1–F6)

Construtor visual de chatbot (estilo ManyChat/Typebot) rodando TUDO dentro do ConectaChat.
Canvas drag-and-drop (React Flow / @xyflow/react v12). Motor COM ESTADO em produção (webhook v34).
n8n rebaixado a destino opcional do nó HTTP Request.

F1 — Fundação de dados ✅ (MEXEU no banco — ver migrations.sql "FASE A / F1")
  4 tabelas (org_id + RLS "ALL" is_member_of): flows, flow_triggers, flow_sessions,
  ai_credentials. Enums: flow_trigger_type, flow_session_status, ai_provider.
  types.ts NÃO regenerado (frontend usa casts `as any`).

F2 — Lista de Fluxos + canvas React Flow ✅ (só frontend)
  Rota /flows aninhada (flows.tsx Outlet + index + $flowId). Nó "Início" verde
  não-deletável. Editor tela cheia (fixed inset-0 z-50).

F3 — Biblioteca de nós + painéis de config ✅ (frontend)
  node-catalog.ts (6 categorias × 19 nós). flow-sidebar (drag-drop HTML5).
  node-config-dialog (1 form por nodeType; config em data.config). Nós de Ação com
  seletores reais (guardam ID). use-flow-resources.ts.

F4 — MOTOR DE EXECUÇÃO ✅ (DEPLOYADO E TESTADO — embutido no whatsapp-webhook)
  Inicia/retoma flow_session, executa nó-a-nó, lida com Menu/Pergunta que esperam
  resposta. Disparo em segundo plano (EdgeRuntime.waitUntil). Trava humana
  (assigned_user_id / closed). Gatilhos keyword→welcome(só conversa nova)→default.
  Erros engolidos.

F5a — IA REAL + MARKETPLACE DE CHAVES ✅ (DEPLOYADO E TESTADO EM PRODUÇÃO)
  Edge Function ai-credentials (chaves mascaradas). Marketplace /integracoes (card IA
  ativo; resto "Em breve"). Execução real da IA no motor: OpenAI/Claude/Gemini via
  ai_credentials da empresa, com histórico (loadHistory normaliza para evitar 400).

F5b — MODO "IA ASSUME A CONVERSA" (PERMANENTE) ✅ (DEPLOYADO)
  Config do nó: behavior (once/permanent) + exitKeywords. No modo permanente a sessão
  ESTACIONA no nó de IA e responde cada mensagem até: (a) o cliente digitar palavra de
  saída → segue pela saída do nó; ou (b) um humano assumir (trava do F4). Memória
  automática (loadHistory lê `messages`).

F6 — POLIMENTO ✅ (CONCLUÍDO E TESTADO — webhook v34 no ar)
  Item 1: botão FECHAR conversa no inbox (confirmado).
  Item 2: gatilho "Fluxo Inicial" na tela da Conexão (welcome com channel_id).
  Item 3: SAÍDAS MÚLTIPLAS no editor — 1 handle por saída (empilhados à direita, com
          rótulo), id = o que o motor espera (menu "a"+tecla/posição; condition
          true/false; schedule in/out). flow-editor.tsx substituído por completo.
  Item 4: MENU resposta inválida + limite de tentativas (webhook v34). Avisa "opção
          inválida" e repete; após maxTries (padrão 3) segue por aresta de ESCAPE
          (saída solta, sem handle de opção) ou encerra. Campos no nó: invalidMessage,
          maxTries.
  Extra F6: REABERTURA de conversa (webhook v33→v34). Conversa fechada que recebe nova
            mensagem é REABERTA (mesma conversa, histórico contínuo) + faixa verde
            "Atendimento reaberto — <Depto>" no inbox (marcador 'system:reopen').
  ADIADO p/ Fase B: número de chamado sequencial #NNNN (precisa migração).

AJUSTES PÓS-FASE A (round de pequenas melhorias, antes da Fase B)
  Há mais ajustes pequenos pendentes — seguirão em CHAT SEPARADO. Concluído até aqui:

  R1 — RESPOSTAS RÁPIDAS COM MÍDIA + VARIÁVEIS ✅ (MEXEU no banco — ver migrations.sql,
       bloco do topo "AJUSTES PÓS-FASE A — Respostas Rápidas (mídia)")
    Banco: 3 colunas novas em quick_replies (media_path/name/type, text, nulas;
    aditivas; types.ts regenerado pelo Lovable). Arquivos no bucket 'media' em
    {org_id}/quick-replies/{uuid}.{ext}.
    Parte A (criar/editar): novo componente quick-replies-settings.tsx, EXTRAÍDO do
    settings-screen.tsx (~88KB → ~77KB). Anexar arquivo OU gravar áudio (até 16MB),
    8 variáveis em chips ({{primeiro_nome}}/{{nome}}/{{atendente}}/{{saudacao}}/
    {{data}}/{{hora}}/{{setor}}/{{conexao}}), permite resposta só de mídia. O
    settings-screen.tsx agora só monta <QuickRepliesSettings/> na aba.
    Parte B (usar no atendimento): inbox-screen.tsx resolve as 8 variáveis no envio e,
    se a resposta tem mídia, baixa do Storage e abre a janela "Enviar arquivo" (legenda
    = texto) reusando o send-media já existente. Clipe (Paperclip) no item do menu
    quando tem mídia.
    CAVEAT (a observar): áudio vai por send-media; se não tocar como nota de voz no
    WhatsApp, rotear via send-audio (mesmo caminho do microfone do inbox).

  R2 — NOTIFICAÇÕES PUSH POR ATENDENTE/DEPARTAMENTO ✅ (MEXEU no banco — ver
       migrations.sql, bloco do topo "push_notify_route_by_assignee_and_department")
    Cada usuário só recebe push das conversas que ATENDE (atribuídas a ele) + das
    que estão AGUARDANDO no(s) departamento(s) dele. Para de receber conversas de
    outros atendentes e aguardando de outros departamentos.
    Mexeu SÓ no gatilho de banco notify_push_on_inbound_message: agora ele resolve
    os destinatários em SQL (atendido → só o atendente; aguardando com depto →
    membros do department_members; depto vazio ou sem depto → todos da empresa) e
    manda { userIds } pronto para a push-send. 0 créditos Lovable, SEM redeploy de
    Edge Function (push-send já aceitava userIds). Canal entra via department_id da
    conversa (NÃO há tabela usuário↔canal; o canal define o depto de entrada).
    Dono/admin TAMBÉM filtrado por departamento. Verificado na Duli (dry-run):
    aguardando em "Comercial" → Lara + Renato; em "Clientes" → só Renato.

  R3 — INBOX MOBILE: MENU DA MENSAGEM TOCÁVEL ✅ (só frontend, NÃO mexeu no banco)
    No celular o menu de ações da mensagem (Responder/Copiar/Encaminhar/Fixar/
    Favoritar/Apagar/Reagir) não aparecia porque a setinha era hover-only. Agora ela
    fica sempre visível no mobile e segue só no hover no desktop. Edição de 1 linha
    em src/components/inbox/inbox-screen.tsx (commit 18add76). Cross-check confirmou
    que era o único recurso faltando no mobile — o resto já tinha equivalente.

  R4 — CHAT INTERNO (colaborador ↔ colaborador) ✅ (MEXEU no banco — ver
       migrations.sql, bloco do topo "CHAT INTERNO"; publicado via Lovable cc4348f)
    Colaboradores da mesma empresa conversam entre si dentro do ConectaChat (tipo
    Slack simplificado), separado das conversas com clientes. Entregue: 1:1 +
    GRUPOS; texto + ANEXOS; PRESENÇA (online); PUSH. Rota /team-chat + item "Chat
    interno" no menu. Construído do nosso jeito (Supabase + nossa UI), sem copiar o
    AtendeZap (Socket.IO).
    Banco: 3 tabelas novas (internal_chats, internal_chat_members, internal_messages)
    com RLS POR PARTICIPANTE (helper is_internal_chat_member), RPC create_internal_chat
    (cria chat+membros atômico; 1:1 reaproveita conversa existente) e 2 gatilhos
    (last_message_*/unread + push que espelha o do inbox). Realtime nas 3 tabelas.
    Presença via Supabase Realtime Presence (sem tabela). Anexos no bucket 'media'
    ({org_id}/internal-chat/...; leitura por empresa, mensagens fechadas por
    participante). Frontend: src/components/team-chat/* (use-team-chat.ts +
    team-chat-screen.tsx), rota e item de menu; types.ts via (supabase as any).
    NOTA: validação local impossível (máquina sem Node/Bun; build no Lovable) —
    testado na Duli após publicar. v2 possível: editar/apagar msg, "visto",
    anexos privados por conversa, gerenciar grupo, reações.

DEPOIS DA FASE A (roadmap geral até o lançamento — lançamento único, sem soft-launch):
  Fase B — Dashboard (Relatórios) ✅ ENTREGUE v1 (ver estado-atual.md / migrations.sql topo "FASE B").
           Módulo "Dashboard" = 1º item do menu (rota /dashboard). Métricas no banco (funções
           report_*), tela com KPIs + gráfico recharts + tabelas por atendente/canal/depto +
           filtros + CSV, e número de chamado #NNNN por empresa (no inbox). Períodos e quebra por
           dia calculados no FUSO DA EMPRESA (organizations.timezone). Em aberto p/ evoluir:
           restringir /dashboard a dono/admin.
  Fase C — Integrações reais. CALENDLY: C0–C6 ✅ ENTREGUES e testados (conexão OAuth + Vault com
           detecção Light/Pro; leitura; agendamento — Light via embed, Pro NATIVO via Scheduling API —
           com card/cancelar/remarcar; mensagens automáticas agendado/remarcado/cancelado/confirmação/
           lembrete reusando scheduled_messages + run-scheduled; sincronização Pro via webhook HMAC e
           Light via polling pg_cron). FALTA: C7 (nó Calendly no fluxo — depende do F4) e C8 (relatórios).
           Detalhe: docs/conectachat-calendly-plano.md. Depois: Google Agenda, HubSpot.
  Fase D — Atendente de IA (módulo "Agentes") — EM ANDAMENTO (quase fechada). Entregue: tabela
           ai_agents, módulo /agentes (persona + base de conhecimento + provedor/modelo + ativação +
           handoff + alocação por canal), execução no whatsapp-webhook (runAgentAttendant), humanização
           (digitando…+1–3 bolhas+buffer) e anti-banimento. ENTREGUE TAMBÉM: nó de IA do fluxo escolher
           um Agente (webhook v39); inbox aba "Agentes" + IA SEMPRE LIGADA por padrão (contacts.ai_enabled
           default true; só responde sem humano); barra de filtros do inbox (Abertos/Fechadas/ordenar/
           Filas/Fechar todas + Todas); falha de IA visível (selo de aviso, webhook v40); /agentes restrito
           a dono/admin; botão "Acionar fluxo manualmente" no inbox (webhook v41 + Edge trigger-flow).
           PASSOS RESTANTES: níveis hierárquicos no inbox (dono/admin tudo, atendente só as dele + filas
           dele); calibrar o tempo do "digitando…" (hoje não-proporcional). Detalhe:
           docs/conectachat-agentes-ia-plano.md. Roadmap IA: RAG por upload (Fase 2), function calling
           (agendar/transferir), métricas.
  MVP PRÉ-LANÇAMENTO — recursos de operação (decidido 2026-06-26 a partir do estudo das
    referências AtendChat e Remix AtendeZap; entram ANTES do lançamento, ordem de execução a definir):
    1. 🟡 CAMPANHAS / DISPARO EM MASSA — BACKEND COMPLETO + FRONTEND CORE entregues. Tabelas
       campaigns/campaign_recipients/contact_lists/contact_list_members; Edge Functions manage-campaign
       (jwt) + run-campaign (cron, anti-ban: rate/min+jitter, daily_cap, janela 08–20, backstop org,
       pula bloqueados); opt-out no webhook v44; tela /campanhas (admin) com modal (alvo etiqueta/todos,
       ritmo configurável + ALERTA DE RISCO POR CANAL, agendar). LISTAS DEDICADAS entregues (use-contact-lists
       + alvo 'list' no modal + importar para uma lista). FALTA: mídia na campanha (backend já suporta) +
       teste live com poucos contatos.
    2. ✅ IMPORTAR CONTATOS (CSV/XLSX) — JÁ EXISTIA (contacts-screen.tsx: validação BR, dedup, upsert).
       ENTREGUE: etiqueta opcional na importação (marca todos os contatos do arquivo via contact_tags).
       Falta só "jogar numa LISTA dedicada" (depende das tabelas de Campanhas).
    3. ✅ HORÁRIO DE ATENDIMENTO / FORA DE EXPEDIENTE — ENTREGUE (por DEPARTAMENTO). Banco:
       departments.business_hours(jsonb)/out_of_office_enabled/out_of_office_message. Webhook v43
       (runOutOfOffice): sem fluxo + sem IA no canal + sem humano + fora do horário do depto → envia a
       mensagem 1×/6h por conversa (marcador 'system:offhours'). UI no modal de Departamento
       (Configurações). Reusa isWithinBusinessHours.

  Fase E — Stripe + enforcement de planos + LANÇAMENTO.
    Planos provisórios: Essencial R$149 / Profissional R$297 / Avançado R$597
    (anual ~17% off; trial 14 dias sem cartão). Stripe na conta da Duli
    temporariamente; migrar para a entidade ConectaChat com ~10 pagantes ou 3 meses
    (migração = trocar chaves de API + product IDs).
    CONSIDERAR p/ o público BR: além do Stripe, as referências usam gateways nacionais
    (Kiwify/Cakto/Perfectpay) via webhook de cobrança — avaliar na hora de fechar a Fase E.

  BACKLOG PÓS-LANÇAMENTO (diferenciais identificados nas referências; priorizar depois do lançamento):
    - Avaliação / NPS ao encerrar o atendimento (nota 0–10) + métrica no dashboard.
    - Distribuição automática de conversas (round-robin por fila) + "carteira" (cliente fixo de um atendente).
    - Campos personalizados de contato (ex.: CPF, plano).
    - Transcrição de áudio recebido (vira texto; ótimo para a IA ler).
    - Aniversários (mensagem automática no aniversário do contato; já temos contacts.birth_date).
    - Notas internas na conversa (comentário entre atendentes, não vai ao cliente).
    - API pública + Webhooks de eventos (terceiros enviam mensagens / recebem eventos).
    - LGPD (mensagem de consentimento + apagar dados a pedido).
    - Onboarding por IA (a IA lê um "briefing leigo" e já monta o agente).
    - NÃO priorizar: integrações Typebot/Dialogflow/n8n (já temos fluxo próprio + IA).

Lições Fase A: <Outlet/> em rota-pai; editor fixed inset-0 z-50; drag-drop nativo HTML5;
  config em data.config; nós de Ação guardam ID; saídas múltiplas = handle por saída
  com id = o que o motor lê; Edge Functions Deno sem imports externos (helpers
  embutidos); validar local antes de deploy; verificação pós-deploy sempre; edição na
  tela do nó só persiste ao clicar Salvar; reabrir conversa (não criar nova) preserva
  histórico; marcadores de sistema = mensagens external_message_id 'system:*'.

Lições do round pós-Fase A: Lovable send_message pode reportar SUCESSO (commit + créditos)
  e NÃO persistir — confiar no `edit_id` da resposta + get_diff(message_id); verificar
  sempre e repetir se falhou. Arquivos grandes (settings-screen ~88KB, inbox ~124KB):
  extrair features novas em componentes próprios e fazer edições cirúrgicas (achar/
  substituir blocos exatos), nunca colar o arquivo inteiro.
