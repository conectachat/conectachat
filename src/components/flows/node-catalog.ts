import {
  MessageSquare,
  Image,
  HelpCircle,
  CheckCircle2,
  List,
  LayoutGrid,
  ListChecks,
  GitBranch,
  Clock,
  Timer,
  Variable,
  Globe,
  Bot,
  Tag,
  TagsIcon,
  Users,
  Headphones,
  Shuffle,
  Flag,
  type LucideIcon,
} from "lucide-react";

// Cada tipo de nó que pode ser arrastado para o canvas.
export type NodeTypeKey =
  | "message"
  | "media"
  | "question"
  | "validation"
  | "menu_text"
  | "buttons"
  | "list"
  | "condition"
  | "schedule"
  | "delay"
  | "variable"
  | "http"
  | "ai"
  | "tag_add"
  | "tag_remove"
  | "queue"
  | "attendant"
  | "switch_flow"
  | "end";

export type CatalogItem = {
  type: NodeTypeKey;
  label: string;
  icon: LucideIcon;
};

export type CatalogCategory = {
  key: string;
  label: string;
  color: string; // cor base da categoria (usada no nó e no ícone)
  items: CatalogItem[];
};

export const NODE_CATALOG: CatalogCategory[] = [
  {
    key: "messages",
    label: "Mensagens",
    color: "#0055A6",
    items: [
      { type: "message", label: "Mensagem", icon: MessageSquare },
      { type: "media", label: "Mídia", icon: Image },
      { type: "question", label: "Pergunta", icon: HelpCircle },
      { type: "validation", label: "Validação", icon: CheckCircle2 },
    ],
  },
  {
    key: "menus",
    label: "Menus",
    color: "#7C3AED",
    items: [
      { type: "menu_text", label: "Menu Texto", icon: List },
      { type: "buttons", label: "Botões", icon: LayoutGrid },
      { type: "list", label: "Lista", icon: ListChecks },
    ],
  },
  {
    key: "logic",
    label: "Lógica",
    color: "#EA580C",
    items: [
      { type: "condition", label: "Condição", icon: GitBranch },
      { type: "schedule", label: "Horário", icon: Clock },
      { type: "delay", label: "Delay", icon: Timer },
      { type: "variable", label: "Variável", icon: Variable },
    ],
  },
  {
    key: "integrations",
    label: "Integrações",
    color: "#0891B2",
    items: [
      { type: "http", label: "HTTP Request", icon: Globe },
      { type: "ai", label: "IA (ChatGPT/Gemini/Claude)", icon: Bot },
    ],
  },
  {
    key: "actions",
    label: "Ações",
    color: "#8FC549",
    items: [
      { type: "tag_add", label: "Adicionar Tag", icon: Tag },
      { type: "tag_remove", label: "Remover Tag", icon: TagsIcon },
      { type: "queue", label: "Fila / Departamento", icon: Users },
      { type: "attendant", label: "Atendente", icon: Headphones },
      { type: "switch_flow", label: "Trocar Fluxo", icon: Shuffle },
    ],
  },
  {
    key: "finish",
    label: "Finalização",
    color: "#DC2626",
    items: [{ type: "end", label: "Encerrar conversa", icon: Flag }],
  },
];

// Mapa auxiliar: dado um type, retorna o item + a cor da categoria.
export function findCatalogItem(type: string):
  | { item: CatalogItem; color: string; categoryLabel: string }
  | null {
  for (const cat of NODE_CATALOG) {
    const item = cat.items.find((i) => i.type === type);
    if (item) return { item, color: cat.color, categoryLabel: cat.label };
  }
  return null;
}
