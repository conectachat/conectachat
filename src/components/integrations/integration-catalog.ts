import { Bot, Webhook, CalendarClock, Workflow, Users, type LucideIcon } from "lucide-react";

// =====================================================================
//  Catálogo do Marketplace de Integrações (Fase A / Bloco F5a)
//  Fonte da verdade dos cards. Cada integração tem um "slug" (usado na
//  URL /integracoes/{slug}), nome, descrição curta, categoria, ícone e
//  status. Só "ai" está ATIVA agora; as demais ficam "Em breve".
//  Quando uma integração nova for construída, basta virar status:"active".
// =====================================================================

export type IntegrationStatus = "active" | "soon";

export type IntegrationItem = {
  slug: string;
  name: string;
  blurb: string; // descrição curta (aparece no card)
  category: string; // rótulo de categoria (aparece como etiqueta)
  icon: LucideIcon;
  // Cor de fundo do "selo" do ícone (classes Tailwind). Usa as cores da marca.
  iconBg: string;
  iconColor: string;
  status: IntegrationStatus;
};

export const INTEGRATIONS: IntegrationItem[] = [
  {
    slug: "ai",
    name: "Inteligência Artificial",
    blurb: "Conecte OpenAI, Google Gemini ou Anthropic Claude para usar os nós de IA nos seus fluxos de chatbot.",
    category: "IA",
    icon: Bot,
    iconBg: "bg-brand-blue/10",
    iconColor: "text-brand-blue",
    status: "active",
  },
  {
    slug: "webhook",
    name: "Webhook / HTTP",
    blurb: "Envie e receba dados de qualquer sistema externo via requisições HTTP a partir dos seus fluxos.",
    category: "Automação",
    icon: Webhook,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    status: "soon",
  },
  {
    slug: "n8n",
    name: "n8n",
    blurb: "Dispare automações avançadas no n8n a partir dos fluxos do ConectaChat.",
    category: "Automação",
    icon: Workflow,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    status: "soon",
  },
  {
    slug: "calendly",
    name: "Calendly / Agenda",
    blurb: "Ofereça horários e marque reuniões direto na conversa, sincronizando com sua agenda.",
    category: "Agendamento",
    icon: CalendarClock,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    status: "soon",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    blurb: "Sincronize contatos e negócios com o HubSpot CRM.",
    category: "CRM",
    icon: Users,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    status: "soon",
  },
];

export function findIntegration(slug: string): IntegrationItem | undefined {
  return INTEGRATIONS.find((i) => i.slug === slug);
}
