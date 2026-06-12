import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plug,
  Plus,
  MessageCircle,
  Send,
  Instagram,
  Facebook,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ===================================================================
//  TIPOS
// ===================================================================
type ChannelRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  external_instance_id: string | null;
  receive_groups: boolean;
  created_at: string;
};

// ===================================================================
//  CATÁLOGO DE CANAIS (o que aparece em "escolher canal")
//  available=false -> botão "Em breve" (entra nas próximas fases).
// ===================================================================
const CHANNEL_CATALOG = [
  {
    type: "whatsapp_baileys",
    label: "WhatsApp",
    sub: "Conecta lendo o QR Code (não-oficial)",
    icon: MessageCircle,
    color: "#25D366",
    available: true,
  },
  {
    type: "whatsapp_cloud",
    label: "WhatsApp Oficial",
    sub: "API oficial da Meta",
    icon: ShieldCheck,
    color: "#0055A6",
    available: false,
  },
  {
    type: "telegram",
    label: "Telegram",
    sub: "Bot do Telegram",
    icon: Send,
    color: "#229ED9",
    available: false,
  },
  {
    type: "instagram",
    label: "Instagram",
    sub: "Mensagens diretas",
    icon: Instagram,
    color: "#E1306C",
    available: false,
  },
  {
    type: "messenger",
    label: "Messenger",
    sub: "Facebook Messenger",
    icon: Facebook,
    color: "#0084FF",
    available: false,
  },
];

// Status do canal -> rótulo + cores
const STATUS_META: Record
  string,
  { label: string; dot: string; badge: string }
> = {
  connected: {
    label: "Conectado",
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-700",
  },
  connecting: {
    label: "Conectando…",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700",
  },
  disconnected: {
    label: "Desconectado",
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-600",
  },
  error: {
    label: "Erro",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-700",
  },
};

function catalogFor(type: string) {
  return CHANNEL_CATALOG.find((c) => c.type === type);
}

// ===================================================================
//  TELA PRINCIPAL
// ===================================================================
export function ConnectionsScreen() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id;
  const [pickerOpen, setPickerOpen] = useState(false);

  const channelsQuery = useQuery({
    queryKey: ["channels", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ChannelRow[]> => {
      const { data, error } = await supabase
        .from("channels")
        .select(
          "id, name, type, status, external_instance_id, receive_groups, created_at",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChannelRow[];
    },
  });

  const channels = channelsQuery.data ?? [];
  const isLoading = channelsQuery.isLoading;

  // No G.1 os botões ainda não criam de verdade (isso é o G.2).
  function handleChooseChannel(type: string) {
    const c = catalogFor(type);
    if (!c?.available) {
      toast.info("Em breve", {
        description: `${c?.label ?? "Esse canal"} ainda não está disponível. Por enquanto, só WhatsApp (QR Code).`,
      });
      return;
    }
    setPickerOpen(false);
    toast.info("Quase lá!", {
      description:
        "A criação da conexão WhatsApp por QR Code chega no próximo passo (G.2).",
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Conexões</h2>
          <p className="text-sm text-muted-foreground">
            Conecte seus canais de atendimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => channelsQuery.refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="ml-1 hidden sm:inline">Atualizar</span>
          </Button>
          {channels.length > 0 && (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="ml-1">Nova conexão</span>
            </Button>
          )}
        </div>
      </div>

      {/* Corpo */}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : channels.length === 0 ? (
          <EmptyState onChoose={handleChooseChannel} />
        ) : (
          <ChannelList channels={channels} />
        )}
      </div>

      {/* Modal "Nova conexão" (escolher canal) */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova conexão</DialogTitle>
          </DialogHeader>
          <p className="mb-1 text-sm text-muted-foreground">
            Escolha o canal que deseja conectar.
          </p>
          <ChannelGrid onChoose={handleChooseChannel} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================================================================
//  ESTADO VAZIO (nenhum canal): convite + grade de canais
// ===================================================================
function EmptyState({ onChoose }: { onChoose: (type: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "#8FC54920" }}
        >
          <Plug className="h-5 w-5" style={{ color: "#0055A6" }} />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          Nenhum canal conectado ainda
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha um canal abaixo para começar a atender.
        </p>
      </div>
      <ChannelGrid onChoose={onChoose} />
    </div>
  );
}

// ===================================================================
//  GRADE DE CANAIS (usada no estado vazio e no modal)
// ===================================================================
function ChannelGrid({ onChoose }: { onChoose: (type: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {CHANNEL_CATALOG.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.type}
            type="button"
            onClick={() => onChoose(c.type)}
            className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
              c.available
                ? "border-border hover:border-foreground/30 hover:bg-muted/50"
                : "border-dashed border-border opacity-70"
            }`}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: `${c.color}1A`, color: c.color }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {c.label}
                </span>
                {!c.available && (
                  <Badge
                    variant="secondary"
                    className="h-4 px-1.5 text-[10px]"
                  >
                    Em breve
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">{c.sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ===================================================================
//  ESTADO COM LISTA: cartões dos canais já criados
// ===================================================================
function ChannelList({ channels }: { channels: ChannelRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {channels.map((ch) => {
        const cat = catalogFor(ch.type);
        const Icon = cat?.icon ?? MessageCircle;
        const st = STATUS_META[ch.status] ?? STATUS_META.disconnected;
        const color = cat?.color ?? "#0055A6";
        return (
          <div
            key={ch.id}
            className="flex items-center gap-3 rounded-lg border border-border p-4"
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: `${color}1A`, color }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {ch.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {cat?.label ?? ch.type}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${st.dot}`} />
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.badge}`}
              >
                {st.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
