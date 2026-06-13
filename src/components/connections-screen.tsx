import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plug,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  MessageCircle,
  Send,
  Instagram,
  Facebook,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ===================================================================
//  TIPOS
// ===================================================================
type Credentials = { number?: string; qr?: string } | null;

type ChannelRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  external_instance_id: string | null;
  receive_groups: boolean;
  credentials: Credentials;
  created_at: string;
};

type QrTarget = { channelId: string; qr: string | null; pairingCode: string | null };

// ===================================================================
//  CATÁLOGO DE CANAIS
// ===================================================================
const CHANNEL_CATALOG = [
  { type: "whatsapp_baileys", label: "WhatsApp", sub: "Conecta lendo o QR Code (não-oficial)", icon: MessageCircle, color: "#25D366", available: true },
  { type: "whatsapp_cloud", label: "WhatsApp Oficial", sub: "API oficial da Meta", icon: ShieldCheck, color: "#0055A6", available: false },
  { type: "telegram", label: "Telegram", sub: "Bot do Telegram", icon: Send, color: "#229ED9", available: false },
  { type: "instagram", label: "Instagram", sub: "Mensagens diretas", icon: Instagram, color: "#E1306C", available: false },
  { type: "messenger", label: "Messenger", sub: "Facebook Messenger", icon: Facebook, color: "#0084FF", available: false },
];

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  connected: { label: "Conectado", dot: "bg-green-500", badge: "bg-green-100 text-green-700" },
  connecting: { label: "Conectando…", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" },
  disconnected: { label: "Desconectado", dot: "bg-gray-400", badge: "bg-gray-100 text-gray-600" },
  error: { label: "Erro", dot: "bg-red-500", badge: "bg-red-100 text-red-700" },
};

function catalogFor(type: string) {
  return CHANNEL_CATALOG.find((c) => c.type === type);
}

// Garante que o QR vire uma imagem exibível.
function qrSrc(qr: string | null): string | null {
  if (!qr) return null;
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}

// Lê uma mensagem de erro amigável do retorno da função.
function fnError(data: any, error: any): string | undefined {
  return data?.error ?? error?.message;
}

// ===================================================================
//  TELA PRINCIPAL
// ===================================================================
export function ConnectionsScreen() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id;
  const queryClient = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChannelRow | null>(null);
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ["channels", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ChannelRow[]> => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, type, status, external_instance_id, receive_groups, credentials, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChannelRow[];
    },
  });

  // Tempo real: a lista reage sozinha quando o status/QR muda no banco.
  useEffect(() => {
    if (!orgId) return;
    const sub = supabase
      .channel(`connections-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channels", filter: `org_id=eq.${orgId}` },
        () => queryClient.invalidateQueries({ queryKey: ["channels", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [orgId, queryClient]);

  const channels = channelsQuery.data ?? [];
  const isLoading = channelsQuery.isLoading;
  const refetch = () => channelsQuery.refetch();

  async function callFn(body: Record<string, unknown>) {
    return supabase.functions.invoke("manage-channels", { body });
  }

  async function handleRefresh(ch: ChannelRow) {
    setBusyId(ch.id);
    const { data, error } = await callFn({ action: "status", channelId: ch.id });
    setBusyId(null);
    if (error || data?.error) {
      toast.error("Não foi possível atualizar o status", { description: fnError(data, error) });
      return;
    }
    refetch();
  }

  async function handleDisconnect(ch: ChannelRow) {
    setBusyId(ch.id);
    const { data, error } = await callFn({ action: "disconnect", channelId: ch.id });
    setBusyId(null);
    if (error || data?.error) {
      toast.error("Não foi possível desligar", { description: fnError(data, error) });
      return;
    }
    toast.success("Conexão desligada");
    refetch();
  }

  async function handleReconnect(ch: ChannelRow) {
    setBusyId(ch.id);
    const { data, error } = await callFn({ action: "qr", channelId: ch.id });
    setBusyId(null);
    if (error || data?.error) {
      toast.error("Não foi possível gerar o QR", { description: fnError(data, error) });
      return;
    }
    setQrTarget({ channelId: ch.id, qr: data?.qr ?? null, pairingCode: data?.pairingCode ?? null });
  }

  async function handleDelete(ch: ChannelRow) {
    setBusyId(ch.id);
    const { data, error } = await callFn({ action: "delete", channelId: ch.id });
    setBusyId(null);
    setConfirmDelete(null);
    if (error || data?.error) {
      toast.error("Não foi possível excluir", { description: fnError(data, error) });
      return;
    }
    toast.success("Conexão excluída");
    refetch();
  }

  function chooseChannel(type: string) {
    const c = catalogFor(type);
    if (!c?.available) {
      toast.info("Em breve", { description: `${c?.label ?? "Esse canal"} ainda não está disponível. Por enquanto, só WhatsApp (QR Code).` });
      return;
    }
    setPickerOpen(false);
    setCreateOpen(true);
  }

  // Canal "ao vivo" correspondente ao QR aberto (para renovar o QR e fechar ao conectar).
  const qrLiveChannel = qrTarget ? channels.find((c) => c.id === qrTarget.channelId) ?? null : null;

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Conexões</h2>
          <p className="text-sm text-muted-foreground">Gerencie suas conexões de WhatsApp.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="ml-1 hidden sm:inline">Atualizar</span>
          </Button>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="ml-1">Nova conexão</span>
          </Button>
        </div>
      </div>

      {/* Corpo */}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : channels.length === 0 ? (
          <EmptyState onChoose={chooseChannel} />
        ) : (
          <ChannelList
            channels={channels}
            busyId={busyId}
            onRefresh={handleRefresh}
            onReconnect={handleReconnect}
            onDisconnect={handleDisconnect}
            onEdit={setEditing}
            onDelete={setConfirmDelete}
          />
        )}
      </div>

      {/* Escolher canal */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova conexão</DialogTitle>
          </DialogHeader>
          <p className="mb-1 text-sm text-muted-foreground">Escolha o canal que deseja conectar.</p>
          <ChannelGrid onChoose={chooseChannel} />
        </DialogContent>
      </Dialog>

      {/* Criar conexão WhatsApp */}
      <NewConnectionForm
        open={createOpen}
        orgId={orgId}
        onClose={() => setCreateOpen(false)}
        onCreated={(t) => {
          setCreateOpen(false);
          refetch();
          setQrTarget(t);
        }}
      />

      {/* QR Code (criar/reconectar) — renova e fecha sozinho */}
      <QrDialog
        target={qrTarget}
        liveChannel={qrLiveChannel}
        onClose={() => { setQrTarget(null); refetch(); }}
        onConnected={() => { setQrTarget(null); toast.success("WhatsApp conectado!"); refetch(); }}
      />

      {/* Renomear */}
      <EditNameDialog
        channel={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refetch(); }}
      />

      {/* Confirmar exclusão */}
      <ConfirmDeleteDialog
        channel={confirmDelete}
        busy={busyId === confirmDelete?.id}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
      />
    </div>
  );
}

// ===================================================================
//  LISTA (largura total)
// ===================================================================
function ChannelList({
  channels,
  busyId,
  onRefresh,
  onReconnect,
  onDisconnect,
  onEdit,
  onDelete,
}: {
  channels: ChannelRow[];
  busyId: string | null;
  onRefresh: (ch: ChannelRow) => void;
  onReconnect: (ch: ChannelRow) => void;
  onDisconnect: (ch: ChannelRow) => void;
  onEdit: (ch: ChannelRow) => void;
  onDelete: (ch: ChannelRow) => void;
}) {
  return (
    <div className="space-y-3">
      {channels.map((ch) => {
        const cat = catalogFor(ch.type);
        const Icon = cat?.icon ?? MessageCircle;
        const st = STATUS_META[ch.status] ?? STATUS_META.disconnected;
        const color = cat?.color ?? "#0055A6";
        const number = (ch.credentials as Credentials)?.number;
        const connected = ch.status === "connected";
        const busy = busyId === ch.id;

        return (
          <div key={ch.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: `${color}1A`, color }}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{ch.name}</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {cat?.label ?? ch.type}
                </Badge>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {number ? `+${number}` : "O número aparece após conectar"}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Atualizar status" onClick={() => onRefresh(ch)} disabled={busy}>
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              </Button>
              {connected ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Desligar" onClick={() => onDisconnect(ch)} disabled={busy}>
                  <PowerOff className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Ligar / reconectar" onClick={() => onReconnect(ch)} disabled={busy}>
                  <Power className="h-4 w-4 text-green-600" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Renomear" onClick={() => onEdit(ch)} disabled={busy}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Excluir" onClick={() => onDelete(ch)} disabled={busy}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===================================================================
//  ESTADO VAZIO + GRADE DE CANAIS
// ===================================================================
function EmptyState({ onChoose }: { onChoose: (type: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#8FC54920" }}>
          <Plug className="h-5 w-5" style={{ color: "#0055A6" }} />
        </div>
        <h3 className="text-base font-semibold text-foreground">Nenhum canal conectado ainda</h3>
        <p className="mt-1 text-sm text-muted-foreground">Escolha um canal abaixo para começar a atender.</p>
      </div>
      <ChannelGrid onChoose={onChoose} />
    </div>
  );
}

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
              c.available ? "border-border hover:border-foreground/30 hover:bg-muted/50" : "border-dashed border-border opacity-70"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${c.color}1A`, color: c.color }}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{c.label}</span>
                {!c.available && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Em breve</Badge>}
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
//  MODAL: NOVA CONEXÃO (nome + grupos)
// ===================================================================
function NewConnectionForm({
  open,
  orgId,
  onClose,
  onCreated,
}: {
  open: boolean;
  orgId: string | undefined;
  onClose: () => void;
  onCreated: (t: QrTarget) => void;
}) {
  const [name, setName] = useState("");
  const [receiveGroups, setReceiveGroups] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setReceiveGroups(false);
    }
  }, [open]);

  async function criar() {
    const trimmed = name.trim();
    if (!orgId || !trimmed) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("manage-channels", {
      body: { action: "create", orgId, name: trimmed, receiveGroups },
    });
    setCreating(false);
    if (error || data?.error) {
      toast.error("Não foi possível criar a conexão", { description: fnError(data, error) });
      return;
    }
    onCreated({ channelId: data.channelId, qr: data.qr ?? null, pairingCode: data.pairingCode ?? null });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conexão de WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="conn-name">Nome da conexão</Label>
            <Input
              id="conn-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: WhatsApp Vendas"
              maxLength={60}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={receiveGroups} onChange={(e) => setReceiveGroups(e.target.checked)} className="h-4 w-4" />
            Receber mensagens de grupos
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>Cancelar</Button>
          <Button onClick={criar} disabled={creating || !name.trim()}>
            {creating ? "Criando…" : "Criar e mostrar QR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================================================================
//  MODAL: QR CODE — renova sozinho (via tempo real) e fecha ao conectar
// ===================================================================
function QrDialog({
  target,
  liveChannel,
  onClose,
  onConnected,
}: {
  target: QrTarget | null;
  liveChannel: ChannelRow | null;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [localQr, setLocalQr] = useState<string | null>(null);
  const [localPairing, setLocalPairing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const channelId = target?.channelId ?? null;

  const onConnectedRef = useRef(onConnected);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    setLocalQr(target?.qr ?? null);
    setLocalPairing(target?.pairingCode ?? null);
  }, [target]);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    onConnectedRef.current();
  }

  // 1) Ao vivo: se o canal já consta conectado, fecha.
  useEffect(() => {
    if (liveChannel?.status === "connected") finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveChannel?.status]);

  // 2) Rede de segurança: pergunta o status a cada 3s.
  useEffect(() => {
    if (!channelId) return;
    let active = true;
    const id = setInterval(async () => {
      const { data } = await supabase.functions.invoke("manage-channels", {
        body: { action: "status", channelId },
      });
      if (!active) return;
      if (data?.status === "connected") {
        clearInterval(id);
        finish();
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function gerarNovo() {
    if (!channelId) return;
    setRefreshing(true);
    const { data, error } = await supabase.functions.invoke("manage-channels", {
      body: { action: "qr", channelId },
    });
    setRefreshing(false);
    if (error || data?.error) {
      toast.error("Não foi possível gerar um novo QR", { description: fnError(data, error) });
      return;
    }
    setLocalQr(data?.qr ?? null);
    setLocalPairing(data?.pairingCode ?? null);
  }

  // QR mais recente: o que o webhook guardou (ao vivo) tem prioridade.
  const liveQr = (liveChannel?.credentials as Credentials)?.qr ?? null;
  const src = qrSrc(liveQr ?? localQr);

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-center text-sm text-muted-foreground">
            No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → aponte para o QR abaixo.
          </p>
          {src ? (
            <img src={src} alt="QR Code" className="h-56 w-56 rounded-lg border border-border" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {localPairing && (
            <p className="text-xs text-muted-foreground">
              Ou use o código: <span className="font-mono font-medium text-foreground">{localPairing}</span>
            </p>
          )}
          <Button variant="outline" size="sm" onClick={gerarNovo} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="ml-1">Gerar novo QR</span>
          </Button>
          <p className="text-center text-xs text-muted-foreground">Esta janela fecha sozinha quando conectar.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================================================================
//  MODAL: RENOMEAR
// ===================================================================
function EditNameDialog({
  channel,
  onClose,
  onSaved,
}: {
  channel: ChannelRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(channel?.name ?? ""); }, [channel]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!channel || !trimmed) return;
    setSaving(true);
    const { error } = await supabase.from("channels").update({ name: trimmed }).eq("id", channel.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
      return;
    }
    toast.success("Nome atualizado");
    onSaved();
  }

  return (
    <Dialog open={!!channel} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear conexão</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label htmlFor="channel-name">Nome da conexão</Label>
          <Input
            id="channel-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: WhatsApp Vendas"
            maxLength={60}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          />
          <p className="text-xs text-muted-foreground">Esse nome é só interno, para sua equipe identificar o canal.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || name.trim() === channel?.name}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================================================================
//  MODAL: CONFIRMAR EXCLUSÃO
// ===================================================================
function ConfirmDeleteDialog({
  channel,
  busy,
  onClose,
  onConfirm,
}: {
  channel: ChannelRow | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!channel} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir conexão</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir <span className="font-medium text-foreground">{channel?.name}</span>? Isso remove a conexão e{" "}
          <span className="font-medium text-foreground">apaga também todas as conversas e mensagens</span> deste canal. Esta ação não pode ser desfeita.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Excluindo…" : "Excluir definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
