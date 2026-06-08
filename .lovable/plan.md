## ConectaChat — Esqueleto inicial

Vou montar a estrutura base do app, sem backend. Nenhuma tabela, nenhum Lovable Cloud, nenhuma chamada Supabase — só UI e rotas, prontos para você plugar seu projeto Supabase depois.

### Estilo visual
Minimalista e profissional: paleta neutra com um único accent sóbrio, tipografia limpa, bastante espaço em branco, bordas suaves. Tokens definidos em `src/styles.css` (sem cores hardcoded nos componentes).

### Rotas

```
src/routes/
  __root.tsx          (já existe — manter)
  index.tsx           → redireciona para /login (placeholder removido)
  login.tsx           → tela de login (pública)
  _authenticated/
    route.tsx         → layout protegido (placeholder; gate real entra quando Supabase conectar)
    inbox.tsx         → tela vazia "Caixa de entrada" (estado vazio)
```

Observação: como ainda não há auth real, o `_authenticated/route.tsx` será um layout simples renderizando sidebar + header + `<Outlet />` sem gate de sessão. Quando você conectar o Supabase, esse arquivo passa a ser o layout gerenciado pela integração (`ssr: false` + redirect para `/login`).

### Tela de login (`/login`)
- Card centralizado, logo/nome "ConectaChat" no topo
- Campos: Email, Senha
- Botão "Entrar" (por enquanto apenas navega para `/inbox` — sem validação real)
- Link "Esqueci minha senha" (placeholder, sem ação)
- Sem signup nem OAuth nesta fase

### Área autenticada
Layout com:
- **Sidebar** (shadcn sidebar, `collapsible="icon"`):
  - Logo "ConectaChat"
  - Item "Caixa de entrada" (ativo, ícone Inbox)
  - Espaço reservado para futuras seções (Contatos, Configurações) — não criadas agora
  - Rodapé com avatar/placeholder de usuário e botão "Sair" (volta para `/login`)
- **Header**: `SidebarTrigger` + título da página atual
- **Conteúdo**: tela `/inbox` vazia com estado "Nenhuma conversa ainda" centralizado

### Componentes novos
- `src/components/app-sidebar.tsx` — sidebar do app
- shadcn já tem todos os primitivos necessários (sidebar, button, input, card, label)

### Design tokens
Ajustar `src/styles.css` para um tema profissional minimalista (cinzas neutros + um primary sóbrio). Manter suporte light/dark já existente.

### O que NÃO será feito agora
- Nenhuma integração Supabase / Lovable Cloud
- Nenhuma tabela, RLS, edge function
- Nenhuma lógica real de autenticação (botão "Entrar" só navega)
- Nenhuma funcionalidade de chat/mensagens
- Sem OAuth, sem reset de senha real

### Próximo passo (depois deste esqueleto)
Você conecta seu projeto Supabase existente; eu então:
1. Substituo o login mockado por `supabase.auth.signInWithPassword`
2. Converto `_authenticated/route.tsx` para o layout gerenciado com gate real
3. Crio as tabelas de conversas/mensagens conforme você definir