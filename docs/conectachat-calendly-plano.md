# ConectaChat — Fase C · Integração Calendly (Plano de Execução)

> **Status:** Planejamento aprovado, pronto para implementação na Fase C.
> **Pré-condição:** F4 (motor de execução do fluxo) precisa estar concluído **antes** do bloco de automação/IA (C7). O resto não depende do F4.
> **Decisão de produto:** **Um único card no Marketplace** ("Calendly"), que detecta automaticamente se a conta do cliente é grátis ou paga e libera os recursos de acordo. Sem fricção de upgrade.
> **Idioma de toda comunicação:** Português (Brasil). Renato não programa — Claude (no Code) toma as decisões técnicas, escreve o código pronto e aplica via MCP (Lovable + Supabase), um bloco por vez, com confirmação "feito" entre etapas.

---

## 0. Progresso da implementação (atualizado 2026-06-24)

- **C0 — Validação:** ✅ fechado (embed inline OK no grátis; leitura GET OK no grátis; detecção de plano por 403/200 confirmada por doc e na prática).
- **C1 — Conexão:** ✅ ENTREGUE e testado na Duli (Pro na conta paga, Light na grátis).
  - Banco: `calendly_connections` (1/org) + tokens no **Vault** (funções `calendly_save_connection` / `calendly_read_tokens` / `calendly_update_tokens` / `calendly_set_status` / `calendly_disconnect`, todas só `service_role`).
  - Edge Functions: `calendly-oauth-start` (jwt on), `calendly-oauth-callback` (jwt off; valida state HMAC; detecção de plano create+delete), `calendly-disconnect` (jwt on).
  - Frontend: card no Marketplace (slug `calendly` ativo) — conectar / plano (Light/Pro) / desconectar.
  - Secrets no Supabase: `CALENDLY_CLIENT_ID` / `CALENDLY_CLIENT_SECRET` / `CALENDLY_WEBHOOK_SIGNING_KEY`.
- **C2 — Leitura:** ✅ ENTREGUE e testado. Edge Function `calendly-api` (jwt on): `event_types` + `available_times` (paginação de 7 dias) + **renovação de token com rotação de refresh**. Card lista os tipos de evento. Sem cache (leitura ao vivo).
- **Próximo:** C3 — agendamento + card do agendamento.

---

## 1. Objetivo

Permitir que cada empresa cliente do ConectaChat conecte sua própria conta Calendly e, dentro do inbox, agende reuniões com o cliente final — sem o cliente final sair do WhatsApp. Sobre o agendamento, disparar **mensagens de confirmação e lembrete pelo próprio WhatsApp** (texto padrão editável, tempo configurável antes da reunião) e, mais à frente, permitir que um **fluxo/IA** faça confirmação e remarcação automaticamente.

---

## 2. Como o Calendly funciona (fatos verificados — 2026)

Estes fatos definem a arquitetura. Foram confirmados na documentação oficial atual do Calendly (fontes na seção 16).

| Recurso | Plano grátis | Plano pago (Standard/Professional/Teams/Enterprise) |
|---|---|---|
| Conectar via OAuth | ✅ | ✅ |
| **Ler** tipos de evento, horários livres, detalhes do agendamento | ✅ | ✅ |
| Embed da página de agendamento | ⚠️ a confirmar (ver C0) | ✅ |
| **Criar agendamento via API** (Scheduling API / `POST /invitees`) | ❌ | ✅ |
| **Webhooks** (aviso em tempo real de agendou/cancelou) | ❌ | ✅ |
| Cancelar evento via API | ✅ (leitura/POST funcionam no grátis) | ✅ |
| Remarcar via API | ❌ (não existe endpoint; só o link de remarcação) | ❌ (idem) |

**Tradução para a nossa estratégia:**

- A **leitura funciona no grátis** → conseguimos puxar data/hora do agendamento mesmo no grátis → conseguimos **disparar confirmação e lembrete pelo WhatsApp nos dois planos**. (Esta foi a descoberta que torna o "Light" muito mais capaz do que parecia.)
- O que é **exclusivo do pago**: agendar dentro da nossa própria tela (sem o iframe do Calendly) e sincronização instantânea via webhook.
- **Não existe endpoint de remarcação.** Cancelar tem endpoint; remarcar é sempre via o link `reschedule_url` que o Calendly devolve. Isso vale para os dois planos. O botão "Remarcar" do nosso card abre esse link.

---

## 3. O card único adaptativo (modelo de funcionamento)

Um único item "Calendly" no Marketplace. Ao conectar, o sistema **detecta o nível do plano** do cliente e ativa o conjunto de recursos correspondente.

### 3.1 Como detectamos o plano (free vs pago)

Não há um campo de "tier" confiável na API. Usamos **detecção por comportamento**: logo após o OAuth, o backend tenta criar uma assinatura de webhook (`POST /webhook_subscriptions`).
- **Sucesso** → conta paga → modo **Pro** (guardamos o `webhook_subscription_uri` da conexão). A chave de assinatura do webhook **não** é por conexão — é a **Webhook signing key da nossa app OAuth** (uma só, capturada na criação da app; ver 5.8).
- **Falha 403** → conta grátis → modo **Light**.

Guardamos o resultado em `calendly_connections.plan_tier` (`light` | `pro`). Reavaliamos periodicamente (ex.: 1x/dia ou quando o cliente clica "Reverificar plano"), para que um upgrade do Calendly libere o Pro automaticamente, sem reconexão.

### 3.2 Recursos por nível

**Modo Light (Calendly grátis):**
- Conecta a conta (OAuth).
- Painel de agendamento na sidebar usa o **embed** da página do Calendly (o agendamento acontece dentro do iframe).
- Captura o agendamento no instante em que acontece (evento do embed no navegador) + leitura da API para puxar data/hora/convidado.
- Monta o **card do agendamento** com links de cancelar/remarcar.
- **Dispara confirmação e lembrete pelo WhatsApp.**
- Sincronização de cancelamento/remarcação por **polling** (a cada X minutos), não instantânea.

**Modo Pro (Calendly pago) — tudo do Light, mais:**
- **Agendar dentro da nossa própria tela** (Scheduling API, sem iframe) — experiência 100% ConectaChat.
- **Sincronização instantânea** via webhook (cancelou → card atualiza e mensagens agendadas são canceladas na hora).
- **Nó "Calendly" no flow builder** → o cliente final escolhe horário sozinho pelo WhatsApp (self-service), com fluxo simples ou IA.

### 3.3 Dois modos de uso (valem para a UI)

- **Manual (atendente agenda pelo cliente):** quem vê os horários e marca é o **usuário do ConectaChat**, na sidebar. O cliente final só recebe o resultado no WhatsApp (confirmação, card, lembretes). Disponível no Light e no Pro.
- **Automático (cliente agenda sozinho):** o **fluxo/IA** envia os horários como mensagens/botões no WhatsApp e o cliente final responde escolhendo. Sem atendente. **Só no Pro** (depende da Scheduling API + F4).

---

## 4. C0 — Preparação e validação antes de codar (gate)

### 4.1 Tarefas manuais no Calendly — STATUS

**✅ JÁ FEITO por Renato:**
- App OAuth criada no portal de desenvolvedor (kind: **Web**, environment: **Production**).
- **Redirect URI** configurada: `https://lnkctnmmxltsbpnqqnwf.supabase.co/functions/v1/calendly-oauth-callback` (editável depois, se preciso).
- **Scopes:** selecionados na criação (lembrar: scopes **não** são editáveis depois — se faltar algum, recriar a app).
- **Segredos guardados no Bitwarden:** `CLIENT_ID`, `CLIENT_SECRET`, `WEBHOOK_SIGNING_KEY`. ⚠️ `CLIENT_SECRET` e `WEBHOOK_SIGNING_KEY` só aparecem uma vez (na criação) — não dá para revê-los; se perder, recriar a app.
- **Conta Calendly paga disponível:** a da **Duli Consulting** — usar para testar o caminho **Pro** (webhooks + Scheduling API) nos blocos C5/C6.

**⏳ PENDENTE (fazer no início do C0):**
- Criar uma **conta Calendly grátis de teste** (conta de usuário, separada da conta de desenvolvedor), com 1 tipo de evento (ex.: "Reunião 30min") e um calendário conectado, para testar o caminho **Light**.

**🔒 Segredos:** os valores ficam **só no Bitwarden**. No bloco C1, o Claude Code os coloca diretamente nos **Edge Function secrets do Supabase** (Renato cola lá, naquele momento). **Nunca** colar keys no chat, no código ou neste documento.

### 4.2 Validações práticas (com a conta grátis)

Confirmar, na prática, antes de escrever código de produção:

1. **O embed HTML funciona no plano grátis?** A documentação sugere que alguns planos só permitem "link para a página", não embed. Se o grátis não embutir, o Light cai para "abrir o Calendly em nova aba" (ainda funciona, UX pior). Decide o desenho da sidebar no Light.
2. **A leitura no grátis devolve data/hora do agendamento?** É disso que dependem os lembretes. Testar `GET` de event types, available times e detalhes do invitee com token de conta grátis.
3. **A detecção de plano por webhook 403 funciona como esperado?** Confirmar que `POST /webhook_subscriptions` numa conta grátis retorna 403 (e não outro erro), e que na conta paga da Duli retorna sucesso + `webhook_subscription_uri`.

**Saída do C0:** um curto relatório de "o que funciona no grátis" que congela o escopo final do Light.

### 4.3 ✅ C0 — RESULTADO (fechado em 2026-06-24)

- **Conta grátis de teste:** criada (link público do evento de teste em mãos).
- **Embed inline no grátis:** ✅ confirmado (doc oficial + opção "Inline embed" presente na conta grátis). O Light usa embed na sidebar (visual padrão; personalização de cores é só no pago) — **sem fallback de "nova aba"**.
- **Leitura da API no grátis (C0.3):** ✅ confirmado pela FAQ oficial — GET/POST funcionam em qualquer plano (exceto poucos endpoints Enterprise). Logo, puxar data/hora do agendamento e horários livres funciona no grátis → **lembretes WhatsApp viáveis nos dois planos**.
- **Detecção de plano (C0.4):** ✅ confirmado por doc — webhooks exigem plano pago, então `POST /webhook_subscriptions` dá **403 no grátis** e **sucesso no pago**. **Prova empírica adiada para o 1º login OAuth do C1** (testar conta grátis → Light; conta paga da Duli → Pro). Decisão: não subir função de teste descartável; confirmar no C1.
- **Remarcação:** sem endpoint (só links de cancelar/remarcar no invitee) — botão "Remarcar" abre `reschedule_url`.

**Gate do C0: LIBERADO.** Pode iniciar o C1.

---

## 5. Arquitetura técnica

Stack reutilizado (já em produção): Supabase (Postgres + RLS + Edge Functions + Realtime + pg_net + pg_cron), Evolution API (WhatsApp), Lovable (React). Padrões já existentes a reaproveitar: armazenamento de credenciais estilo `ai_credentials`, sistema de variáveis das Quick Replies, disparo por `pg_net`.

### 5.1 Banco de dados (novas tabelas)

Todas com `org_id` + RLS via `is_member_of(org_id)` (mesma política "ALL" única por tabela já usada no projeto).

**`calendly_connections`** — uma conexão por org.
```
id uuid pk
org_id uuid not null
access_token text not null            -- ver nota de segurança (5.6)
refresh_token text not null           -- ROTACIONA a cada refresh (5.3)
token_expires_at timestamptz not null
calendly_user_uri text not null
organization_uri text not null
scope text
plan_tier text not null default 'light'   -- 'light' | 'pro'
webhook_subscription_uri text          -- nullable (só Pro; a assinatura usa a chave da app, ver 5.8)
status text not null default 'active'  -- 'active' | 'revoked' | 'error'
last_plan_check_at timestamptz
created_at timestamptz default now()
updated_at timestamptz default now()
unique (org_id)
```

**`calendly_event_types`** — cache opcional dos tipos de evento (reduz chamadas à API; pode ser preenchido on-demand).
```
id uuid pk
org_id uuid not null
calendly_event_type_uri text not null
name text not null
duration_minutes int
active boolean default true
scheduling_url text
raw jsonb
updated_at timestamptz default now()
unique (org_id, calendly_event_type_uri)
```

**`appointments`** — o agendamento em si, ligado à conversa.
```
id uuid pk
org_id uuid not null
conversation_id uuid                  -- liga ao inbox
contact_id uuid
calendly_event_uri text
calendly_invitee_uri text
event_type_name text
start_time timestamptz not null
end_time timestamptz
status text not null default 'active' -- 'active' | 'canceled' | 'rescheduled'
join_url text                         -- link da reunião (location)
cancel_url text
reschedule_url text
invitee_name text
invitee_email text
invitee_timezone text
created_by uuid                       -- usuário do ConectaChat que marcou (null se automático)
source text                           -- 'manual' | 'embed' | 'flow'
raw jsonb
created_at timestamptz default now()
updated_at timestamptz default now()
```

**`calendly_message_settings`** — defaults por org para confirmação e lembrete.
```
id uuid pk
org_id uuid not null
confirmation_enabled boolean default true
confirmation_offset_minutes int default 1440   -- 24h antes
confirmation_template text
reminder_enabled boolean default true
reminder_offset_minutes int default 120        -- 2h antes
reminder_template text
updated_at timestamptz default now()
unique (org_id)
```

**`scheduled_messages`** — fila de mensagens a enviar (confirmação/lembrete; reaproveitável para campanhas no futuro).
```
id uuid pk
org_id uuid not null
appointment_id uuid references appointments(id)
conversation_id uuid
type text not null                    -- 'confirmation' | 'reminder'
send_at timestamptz not null
body text not null                    -- já com variáveis resolvidas OU resolvidas no envio
status text not null default 'pending'-- 'pending' | 'sent' | 'canceled' | 'failed'
attempts int default 0
sent_at timestamptz
error text
created_at timestamptz default now()
index (status, send_at)
```

### 5.2 Fluxo OAuth (conexão da conta)

Duas Edge Functions:

- **`calendly-oauth-start`** — gera a URL de autorização do Calendly com um `state` assinado (anti-CSRF, contém o `org_id`) e redireciona o usuário para o Calendly.
- **`calendly-oauth-callback`** — recebe o `code`, troca por `access_token` + `refresh_token`, busca `GET /users/me` (pega `user_uri` e `organization_uri`), **detecta o plano** (tenta criar webhook), grava em `calendly_connections`. `verify_jwt` conforme o desenho do redirect (provavelmente `false`, validando o `state` manualmente).

URLs do Calendly (confirmar no portal ao criar o app):
- Authorize: `https://auth.calendly.com/oauth/authorize`
- Token: `https://auth.calendly.com/oauth/token`
- API base: `https://api.calendly.com`

### 5.3 Rotação de refresh token (cuidado crítico)

O Calendly usa OAuth 2.1 com **rotação de refresh token**: cada refresh devolve um `refresh_token` novo e **invalida o antigo**. Regras de implementação:
- Toda vez que renovar, **gravar o novo `refresh_token` e `access_token`** imediatamente (mesma transação).
- **Serializar** o refresh por org (lock) para evitar duas renovações simultâneas — uma invalidaria a outra e derrubaria a conexão.
- Se um refresh falhar com token inválido, marcar `status='error'` e pedir reconexão na UI.

### 5.4 Camada de API (proxy)

**`calendly-api`** — Edge Function autenticada (chamada pelo frontend com o JWT do usuário). Centraliza:
- refresh automático do token antes de cada chamada (se expirado);
- leitura: tipos de evento, **horários disponíveis** (lembrar do **limite de 7 dias por requisição** — paginar em janelas de 7 dias para mostrar um mês);
- **agendamento (Pro):** `POST /invitees` com `event_type`, `start_time` (UTC, com `Z`), dados do convidado e o **objeto `location`** (obrigatório quando o tipo de evento tem local; tratar `location.kind`, incluindo casos `ask_invitee`);
- cancelamento via endpoint de cancel.
- `verify_jwt = true`.

### 5.5 Captura do agendamento

- **Pro (nativo):** a própria resposta do `POST /invitees` já traz tudo → grava `appointments` na hora.
- **Light (embed):** o widget do Calendly emite um evento no navegador quando o agendamento conclui (`event_scheduled`) com a URI do evento → o frontend chama `calendly-api` para puxar os detalhes (data/hora/convidado) → grava `appointments`.
- **Webhook (Pro):** `invitee.created` também grava/atualiza `appointments` (rede de segurança caso a captura no navegador falhe).

### 5.6 Sincronização (cancelar / remarcar)

- **Pro — `calendly-webhook`** (Edge Function, `verify_jwt = false`, pois o Calendly chama com sua própria assinatura). **Verifica a assinatura** com a **Webhook signing key da app** (Edge secret único; ver 5.8), via header `Calendly-Webhook-Signature`, antes de confiar no payload. Em `invitee.canceled`: marca `appointments.status='canceled'` e **cancela as `scheduled_messages` pendentes** daquele agendamento.
- **Light — `calendly-poll`** (Edge Function disparada por `pg_cron` a cada X min): para conexões `light`, consulta a List Events (janela `min_start_time`/`max_start_time`) e reconcilia cancelamentos/remarcações. Mesma ação: atualiza `appointments` e cancela `scheduled_messages` órfãs.

### 5.7 Agendador de mensagens (confirmação e lembrete)

- Ao criar um `appointment`, gerar as `scheduled_messages` correspondentes: `send_at = start_time - offset` (confirmação e lembrete, conforme `calendly_message_settings`, só se habilitado e se `send_at` ainda estiver no futuro).
- **`pg_cron`** roda a cada minuto → seleciona `scheduled_messages` com `status='pending'` e `send_at <= now()` → chama a Edge Function **`send-scheduled-messages`** (ou direto via `pg_net`) que **resolve as variáveis**, envia pela **Evolution API** e marca `sent`/`failed`.
- Em cancelamento/remarcação, as mensagens pendentes viram `canceled` (5.6).

### 5.8 Segurança / segredos

- **Segredos da app OAuth** (`CLIENT_ID`, `CLIENT_SECRET`, `WEBHOOK_SIGNING_KEY`) → guardados no **Bitwarden** e, no C1, colocados nos **Edge Function secrets do Supabase**. Nunca no código, no chat nem nos documentos vivos (redigir com `<<… ver Bitwarden>>`).
- **`WEBHOOK_SIGNING_KEY` é da nossa app OAuth, não por cliente** — é uma **chave única**, mostrada só na criação da app, usada para verificar a assinatura de **todos** os webhooks que chegam. Por isso fica como **um único Edge secret**, não numa coluna por conexão. (Confirmar no C6 se assinaturas criadas via token OAuth usam essa chave da app — comportamento esperado.)
- **Tokens de cliente** em `calendly_connections` (`access_token`/`refresh_token`): protegidos por RLS (padrão `ai_credentials`). **Recomendação de hardening:** considerar **Supabase Vault** para os tokens OAuth, já que são mais sensíveis que uma API key. Decidir no C1.

---

## 6. Frontend (Lovable)

### 6.1 Marketplace — card "Calendly"
- Botão **Conectar** → chama `calendly-oauth-start`.
- Estado conectado: badge do nível detectado (**Light** / **Pro**), e-mail/conta Calendly, botão **Reverificar plano** e **Desconectar**.
- Mensagem clara: no Light, "Conecte um Calendly pago para liberar agendamento nativo, sincronização instantânea e automação no fluxo".

### 6.2 Sidebar do inbox — painel "Agendar" + card
- **Pro:** UI nativa — selecionar tipo de evento → escolher horário (calendário) → confirmar. Tudo dentro do ConectaChat.
- **Light:** embed da página do Calendly (ou link em nova aba, conforme C0).
- Após agendar: **card do agendamento** com data/hora (no fuso do contato), link da reunião, e botões **Cancelar** (via API) e **Remarcar** (abre `reschedule_url`). Atualiza sozinho quando há cancelamento (Realtime).

### 6.3 Configuração das mensagens
- Tela (em Configurações do tenant) com: ligar/desligar **confirmação** e **lembrete**, definir **quanto tempo antes** de cada uma, e **editar o texto padrão**.
- Reaproveitar o **sistema de variáveis das Quick Replies** + variáveis novas do Calendly (ver seção 7).

### 6.4 Nó "Calendly" no flow builder (Pro, depende de F4)
- Novo tipo de nó no `node-catalog.ts` (categoria Integrações).
- Config: qual tipo de evento, como apresentar horários (botões/lista), e o que fazer no "confirmar" (marcar via Scheduling API) e no "remarcar".
- Pluga no motor do `whatsapp-webhook` (F4): apresenta horários, espera resposta do contato (estado em `flow_sessions`), agenda e segue o fluxo. Caminho de IA entra na Fase D.

---

## 7. Variáveis suportadas nas mensagens

Reaproveitar as existentes (Primeiro Nome, Nome, Atendente, Saudação, Data, Hora, Setor, Conexão) e **adicionar as do Calendly**:
- `{DataReuniao}` — data da reunião (fuso do contato)
- `{HoraReuniao}` — horário da reunião (fuso do contato)
- `{TipoEvento}` — nome do tipo de evento
- `{LinkReuniao}` — link de acesso (Zoom/Meet/etc.)
- `{LinkRemarcar}` — `reschedule_url`
- `{LinkCancelar}` — `cancel_url`

**Textos padrão sugeridos (editáveis):**
- Confirmação: `Olá {PrimeiroNome}! Confirmando sua {TipoEvento} no dia {DataReuniao} às {HoraReuniao}. Caso precise remarcar: {LinkRemarcar}`
- Lembrete: `Oi {PrimeiroNome}, passando para lembrar da sua {TipoEvento} hoje às {HoraReuniao}. Link de acesso: {LinkReuniao}`

---

## 8. Ordem de implementação (blocos)

Cada bloco é uma sessão de chat no Code, com "feito" entre etapas. Valor do Light chega em ~C4; Pro em C6; automação em C7.

- **C0 — Validação** (conta de teste grátis; criar app OAuth). *Gate.*
- **C1 — Conexão:** tabelas `calendly_connections`; Edge Functions `calendly-oauth-start` e `calendly-oauth-callback`; rotação de refresh; detecção de plano; card no Marketplace.
- **C2 — Leitura:** `calendly-api` (proxy) com tipos de evento e horários (paginação de 7 dias); cache opcional `calendly_event_types`.
- **C3 — Agendamento + card:** tabela `appointments`; sidebar com **embed (Light)** + captura do agendamento; componente do card; cancelar/remarcar.
- **C4 — Mensagens agendadas:** `scheduled_messages` + `calendly_message_settings`; geração no momento do agendamento; `pg_cron` + `send-scheduled-messages` (Evolution) com resolução de variáveis; tela de configuração.
- **C5 — Pro nativo:** agendamento via Scheduling API na sidebar (sem iframe); tratamento do objeto `location`.
- **C6 — Sincronização:** `calendly-webhook` (Pro, com verificação de assinatura) + `calendly-poll` (Light, via `pg_cron`); cancelar mensagens pendentes.
- **C7 — Fluxo/IA (Pro):** nó "Calendly" no flow builder; self-service do cliente. **Depende de F4 concluído.**
- **C8 — Relatórios (opcional, casa com Fase B):** nº de reuniões, comparecimento, cancelamentos.

---

## 9. Riscos e limitações (honestos)

- **Embed no grátis** pode não existir → fallback para link em nova aba (resolvido no C0).
- **Sem endpoint de remarcação** → "Remarcar" sempre abre o link do Calendly; não dá pra remarcar 100% dentro da nossa tela.
- **Sincronização do Light é por polling** → atraso de alguns minutos e custo que cresce com o nº de conexões. Aceitável no MVP; otimizar depois (intervalo adaptativo).
- **Scheduling API exige slot válido no momento do agendamento** → tratar corrida (alguém pegou o horário): re-checar disponibilidade e propor alternativas (erros 404/409).
- **Rate limits não são públicos** → usar backoff exponencial.
- **Lembretes duplicados:** o Calendly também manda lembretes próprios (e-mail/SMS). Deixar claro na UI; permitir ao cliente desligar os do Calendly se quiser só os nossos pelo WhatsApp.
- **Token/refresh:** rotação mal feita derruba a conexão (ver 5.3). É o ponto mais sensível do C1.
- **Distribuição da app OAuth:** confirmar no portal se há exigência de revisão do Calendly para uso público/marketplace. Para usar nossa própria app OAuth em nome dos clientes, uma app de desenvolvedor basta — confirmar limites no C0.

---

## 10. Definition of Done (por bloco, resumido)

- **C1:** cliente conecta, vê o nível certo (Light/Pro), reconecta e desconecta; tokens renovam sem cair.
- **C3:** atendente agenda pela sidebar (Light), o card aparece com links funcionando.
- **C4:** confirmação e lembrete chegam no WhatsApp no horário certo, com variáveis resolvidas; cancelamento some com as pendentes.
- **C6:** cancelar no Calendly reflete no card (instantâneo no Pro, por polling no Light).
- **C7:** cliente final marca sozinho pelo WhatsApp via fluxo.

---

## 11. Decisões em aberto (preciso de você)

✅ **RESOLVIDO no kickoff da Fase C (2026-06-24):**
1. **Segurança dos tokens:** **Supabase Vault** (tokens OAuth criptografados; não o padrão `ai_credentials` em texto). Implementar no C1.
2. **Intervalo do polling do Light:** **5 minutos.**
3. **Defaults de tempo:** **confirmação 24h antes + lembrete 2h antes** (editáveis por empresa).
4. **Lembretes do Calendly:** **a empresa decide na tela de config** — adicionar explicação + opção (não forçar desligar nem deixar os dois por padrão).

_(Histórico das perguntas originais abaixo.)_
1. **Segurança dos tokens:** padrão `ai_credentials` (RLS) ou subir para **Supabase Vault** no C1? (Recomendo Vault para OAuth.)
2. **Intervalo do polling do Light:** sugiro 5 min como ponto de partida. Ok?
3. **Defaults de tempo:** confirmação 24h antes, lembrete 2h antes — bons como padrão?
4. **Lembretes do Calendly:** instruímos o cliente a desligar os nativos (para não duplicar) ou deixamos os dois?

---

## 12. Fontes (documentação oficial Calendly, 2026)

- Getting Started — https://developer.calendly.com/getting-started
- API Overview (planos pagos p/ webhooks e Scheduling API) — https://calendly.com/help/calendly-api-overview
- FAQ (GET/POST em qualquer plano, inclusive grátis; sem endpoint de remarcação) — https://developer.calendly.com/frequently-asked-questions
- Scheduling API / Schedule Events with AI Agents — https://developer.calendly.com/schedule-events-with-ai-agents
- Create Event Invitee (Scheduling API) — https://developer.calendly.com/api-docs/p3ghrxrwbl8kqe-create-event-invitee
- Webhook Subscriptions — https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions
- Webhooks overview (planos) — https://calendly.com/help/webhooks-overview
- Build custom apps (embed + Scheduling API) — https://calendly.com/blog/api-dev-portal

---

## 13. Prompt de kickoff (colar no Claude Code para iniciar a Fase C)

```
Vamos iniciar a Fase C do ConectaChat: integração Calendly (card único adaptativo no Marketplace).

Contexto e plano completo: ver o documento "conectachat-faseC-calendly-plano.md" (anexado ao projeto). Ele traz fatos verificados da API, arquitetura, schema, Edge Functions, frontend, ordem dos blocos (C0–C8), riscos e DoD.

Regras do projeto (mantidas):
- Eu não programo; você decide e entrega código pronto, aplicando via MCP (Lovable + Supabase). Um bloco por vez, com minha confirmação "feito" entre etapas.
- Sempre ler os arquivos vivos via MCP antes de escrever código; nunca confiar em cópias da base de conhecimento.
- Avisar antes de toda ação de produção (mudanças no Supabase e todo send_message no Lovable, com estimativa de custo em créditos).
- DDL via apply_migration; Edge Functions via deploy_edge_function (verificar versão ATIVA com get_edge_function depois). Validar Edge Functions com esbuild/tsc antes do deploy.
- Testar primeiro no Duli, nunca no preview do Lovable.
- F4 (motor de execução do fluxo) ainda NÃO está concluído → o bloco C7 (nó Calendly no fluxo/IA) fica por último e depende do F4.

Começar pelo BLOCO C0 (preparação e validação). O que JÁ está pronto (não refazer):
- App OAuth criada (Web, Production); Redirect URI = https://lnkctnmmxltsbpnqqnwf.supabase.co/functions/v1/calendly-oauth-callback; scopes selecionados.
- CLIENT_ID, CLIENT_SECRET e WEBHOOK_SIGNING_KEY já guardados no Bitwarden (não pedir para colar no chat — no C1, instruir a colá-los nos Edge Function secrets do Supabase).
- Conta Calendly PAGA da Duli disponível para os testes do Pro (C5/C6).

C0 ainda pendente — me guiar, passo a passo e em linguagem simples, para:
1. criar uma conta Calendly GRÁTIS de teste (1 tipo de evento + calendário conectado);
2. validar se o embed funciona no grátis;
3. validar se a leitura (GET event types / available times / invitee) devolve data/hora no grátis;
4. confirmar a detecção de plano (403 no grátis; sucesso na conta paga da Duli).
Não escrever código de produção até o C0 fechar.

Antes de começar, me faça as perguntas em aberto da seção 11 do documento (segurança dos tokens, intervalo de polling, defaults de tempo, lembretes do Calendly).
```
