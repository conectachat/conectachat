import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Paperclip,
  Mic,
  Square,
  X,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Respostas Rápidas — agora com mídia (arquivo/áudio) e variáveis.
// As colunas media_* ainda não estão no types.ts gerado, então acessamos a
// tabela via (supabase as any) — padrão do projeto para colunas novas.

type QuickReply = {
  id: string;
  shortcut: string;
  title: string | null;
  content: string;
  active: boolean;
  media_path: string | null;
  media_name: string | null;
  media_type: string | null;
};

// Variáveis que o sistema consegue preencher hoje (resolvidas no inbox — Parte B).
const VARIAVEIS: { token: string; label: string }[] = [
  { token: "primeiro_nome", label: "Primeiro Nome" },
  { token: "nome", label: "Nome" },
  { token: "atendente", label: "Atendente" },
  { token: "saudacao", label: "Saudação" },
  { token: "data", label: "Data" },
  { token: "hora", label: "Hora" },
  { token: "setor", label: "Setor" },
  { token: "conexao", label: "Conexão" },
];

type MediaType = "image" | "audio" | "video" | "document";

function detectMediaType(file: File): MediaType {
  const mime = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (mime.startsWith("audio/") || ["mp3", "ogg", "oga", "wav", "m4a", "aac", "opus"].includes(ext)) return "audio";
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  return "document";
}

function MediaIcon({ type, className }: { type: string | null; className?: string }) {
  if (type === "image") return <ImageIcon className={className} />;
  if (type === "audio") return <Music className={className} />;
  if (type === "video") return <Video className={className} />;
  return <FileText className={className} />;
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export function QuickRepliesSettings({ orgId }: { orgId: string | null }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  // colunas de mídia ainda não estão no types.ts → acesso via any
  const sb = supabase as any;

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mídia já salva (ao editar) + URL assinada p/ pré-visualizar + flag de remoção
  const [existingMedia, setExistingMedia] = useState<{ path: string; name: string; type: string } | null>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [mediaCleared, setMediaCleared] = useState(false);

  // Mídia nova ainda não enviada (anexada ou gravada)
  const [pending, setPending] = useState<{ file: File; name: string; type: MediaType; url: string } | null>(null);

  // Gravação de áudio
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lista
  const listQuery = useQuery({
    queryKey: ["settings-quick-replies", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<QuickReply[]> => {
      const { data, error } = await sb
        .from("quick_replies")
        .select("id, shortcut, title, content, active, media_path, media_name, media_type")
        .order("shortcut");
      if (error) throw error;
      return (data ?? []) as QuickReply[];
    },
  });
  const list: QuickReply[] = listQuery.data ?? [];
  const activeCount = list.filter((q) => q.active).length;
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (q) =>
        q.shortcut.toLowerCase().includes(s) ||
        (q.title ?? "").toLowerCase().includes(s) ||
        q.content.toLowerCase().includes(s),
    );
  }, [list, search]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["settings-quick-replies"] });
    qc.invalidateQueries({ queryKey: ["quick-replies"] });
    qc.invalidateQueries({ queryKey: ["org-quick-replies"] });
  }

  // Revoga a URL temporária da mídia pendente quando ela troca / desmonta.
  useEffect(() => {
    return () => {
      if (pending?.url) URL.revokeObjectURL(pending.url);
    };
  }, [pending]);

  // Limpeza geral ao desmontar (timer + gravação)
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // Gera URL assinada para pré-visualizar a mídia já salva (bucket é privado).
  useEffect(() => {
    let active = true;
    if (modalOpen && existingMedia?.path && !mediaCleared) {
      sb.storage
        .from("media")
        .createSignedUrl(existingMedia.path, 3600)
        .then(({ data }: any) => {
          if (active) setExistingUrl(data?.signedUrl ?? null);
        });
    } else {
      setExistingUrl(null);
    }
    return () => {
      active = false;
    };
  }, [modalOpen, existingMedia, mediaCleared, sb]);

  function resetMedia() {
    if (pending?.url) URL.revokeObjectURL(pending.url);
    setPending(null);
    setExistingMedia(null);
    setExistingUrl(null);
    setMediaCleared(false);
  }

  function openNew() {
    setEditing(null);
    setShortcut("");
    setTitle("");
    setContent("");
    setError(null);
    resetMedia();
    setModalOpen(true);
  }

  function openEdit(q: QuickReply) {
    setEditing(q);
    setShortcut(q.shortcut);
    setTitle(q.title ?? "");
    setContent(q.content ?? "");
    setError(null);
    if (pending?.url) URL.revokeObjectURL(pending.url);
    setPending(null);
    setMediaCleared(false);
    setExistingMedia(
      q.media_path
        ? { path: q.media_path, name: q.media_name ?? "arquivo", type: q.media_type ?? "document" }
        : null,
    );
    setExistingUrl(null);
    setModalOpen(true);
  }

  // Insere {{token}} na posição do cursor do textarea.
  function insertVar(token: string) {
    const ins = `{{${token}}}`;
    const ta = textareaRef.current;
    if (!ta) {
      setContent((c) => c + ins);
      return;
    }
    const start = ta.selectionStart ?? content.length;
    const end = ta.selectionEnd ?? content.length;
    const next = content.slice(0, start) + ins + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + ins.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!f) return;
    if (f.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 16 MB).");
      return;
    }
    if (pending?.url) URL.revokeObjectURL(pending.url);
    setPending({ file: f, name: f.name, type: detectMediaType(f), url: URL.createObjectURL(f) });
  }

  function removeMedia() {
    if (pending) {
      if (pending.url) URL.revokeObjectURL(pending.url);
      setPending(null);
      return;
    }
    setMediaCleared(true);
    setExistingMedia(null);
    setExistingUrl(null);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type });
        if (pending?.url) URL.revokeObjectURL(pending.url);
        setPending({ file, name: file.name, type: "audio", url: URL.createObjectURL(blob) });
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    setRecording(false);
  }

  async function uploadMedia(file: File): Promise<{ path: string; name: string; type: string }> {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${orgId}/quick-replies/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("media").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    return { path, name: file.name, type: detectMediaType(file) };
  }

  async function save() {
    setError(null);
    const atalho = shortcut
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    const conteudo = content.trim();
    const hasMedia = !!pending || (!!existingMedia && !mediaCleared);
    if (!atalho) {
      setError("Informe um atalho (ex.: saudacao).");
      return;
    }
    if (!conteudo && !hasMedia) {
      setError("Escreva uma mensagem ou anexe uma mídia.");
      return;
    }
    if (!orgId) {
      setError("Sem empresa vinculada.");
      return;
    }
    setBusy(true);
    try {
      let media: { path: string | null; name: string | null; type: string | null } = {
        path: null,
        name: null,
        type: null,
      };
      if (pending) {
        const up = await uploadMedia(pending.file);
        media = { path: up.path, name: up.name, type: up.type };
      } else if (existingMedia && !mediaCleared) {
        media = { path: existingMedia.path, name: existingMedia.name, type: existingMedia.type };
      }

      const payload = {
        shortcut: atalho,
        title: title.trim() || null,
        content: conteudo,
        media_path: media.path,
        media_name: media.name,
        media_type: media.type,
      };

      if (editing) {
        const { error } = await sb.from("quick_replies").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("quick_replies").insert({ org_id: orgId, active: true, ...payload });
        if (error) throw error;
      }
      setModalOpen(false);
      setEditing(null);
      resetMedia();
      invalidate();
    } catch (err: any) {
      if (err?.code === "23505") setError("Já existe uma resposta com esse atalho.");
      else {
        setError("Não foi possível salvar a resposta.");
        console.error("Erro ao salvar resposta rápida:", err);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(q: QuickReply) {
    const ok = await confirm({
      title: "Excluir resposta rápida?",
      description: `A resposta "/${q.shortcut}" será excluída.`,
      confirmText: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const { error } = await sb.from("quick_replies").delete().eq("id", q.id);
    if (error) {
      console.error("Erro ao excluir resposta rápida:", error);
      toast.error("Não foi possível excluir a resposta.");
      return;
    }
    invalidate();
  }

  async function toggle(q: QuickReply) {
    const { error } = await sb.from("quick_replies").update({ active: !q.active }).eq("id", q.id);
    if (error) {
      console.error("Erro ao alterar status da resposta:", error);
      return;
    }
    invalidate();
  }

  // Estado de pré-visualização (mídia nova tem prioridade sobre a existente)
  const showPending = !!pending;
  const showExisting = !pending && !!existingMedia && !mediaCleared;
  const previewType: string | null = pending?.type ?? existingMedia?.type ?? null;
  const previewUrl: string | null = pending?.url ?? existingUrl ?? null;
  const previewName: string = pending?.name ?? existingMedia?.name ?? "";

  return (
    <div className="space-y-4">
      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-semibold text-foreground">{list.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">Respostas rápidas</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-semibold text-foreground">{activeCount}</p>
          <p className="mt-1 text-sm text-muted-foreground">Ativas</p>
        </div>
      </div>

      {/* Busca + Nova */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar respostas rápidas…"
            className="pl-9"
          />
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nova Resposta
        </Button>
      </div>

      {/* Lista */}
      <div className="rounded-lg border border-border bg-card">
        {filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {search.trim() ? "Nenhuma resposta encontrada." : "Nenhuma resposta rápida criada ainda."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{q.title?.trim() || q.shortcut}</span>
                    <span className="text-xs text-muted-foreground">/{q.shortcut}</span>
                    {q.media_type && (
                      <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-text">
                        <MediaIcon type={q.media_type} className="h-3 w-3" />
                        {q.media_type === "image"
                          ? "Imagem"
                          : q.media_type === "audio"
                            ? "Áudio"
                            : q.media_type === "video"
                              ? "Vídeo"
                              : "Arquivo"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {q.content?.trim() || (q.media_name ?? "—")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggle(q)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      q.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {q.active ? "Ativa" : "Inativa"}
                  </button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(q)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => remove(q)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal criar / editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar resposta rápida" : "Nova resposta rápida"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Atalho */}
            <div className="space-y-2">
              <Label htmlFor="qr-shortcut">Atalho</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="qr-shortcut"
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value)}
                  placeholder="saudacao"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Sem espaços. No campo de mensagem você usa digitando /
                {shortcut
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]/g, "") || "atalho"}
              </p>
            </div>

            {/* Título */}
            <div className="space-y-2">
              <Label htmlFor="qr-title">Título (opcional)</Label>
              <Input
                id="qr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Saudação inicial"
              />
            </div>

            {/* Mensagem */}
            <div className="space-y-2">
              <Label htmlFor="qr-content">Mensagem</Label>
              <textarea
                id="qr-content"
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Texto que será inserido na conversa…"
                className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Variáveis disponíveis */}
            <div className="space-y-2">
              <Label>Variáveis disponíveis</Label>
              <div className="flex flex-wrap gap-1.5">
                {VARIAVEIS.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertVar(v.token)}
                    className="rounded-full border border-brand-soft-strong bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-text transition hover:opacity-80"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Clique para inserir no texto. Elas viram o valor real (ex.: nome do contato) na hora do envio.
              </p>
            </div>

            {/* Anexar mídia */}
            <div className="space-y-2">
              <Label>Anexar mídia (opcional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={onPickFile}
                accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
              />

              {showPending || showExisting ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {previewType === "image" && previewUrl ? (
                        <img src={previewUrl} alt={previewName} className="max-h-40 rounded-md" />
                      ) : previewType === "audio" && previewUrl ? (
                        <audio controls src={previewUrl} className="w-full" />
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <MediaIcon type={previewType} className="h-5 w-5 text-muted-foreground" />
                          <span className="truncate">{previewName || "Arquivo anexado"}</span>
                        </div>
                      )}
                      {previewType !== "image" && previewName && previewType !== "audio" && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">{previewName}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={removeMedia}
                      title="Remover mídia"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : recording ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                    Gravando… {fmtSecs(recSecs)}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={stopRecording}>
                    <Square className="mr-1 h-4 w-4" /> Parar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="mr-1 h-4 w-4" /> Anexar arquivo
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={startRecording}>
                    <Mic className="mr-1 h-4 w-4" /> Gravar áudio
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Imagem, áudio, vídeo ou documento (até 16 MB).</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={save} disabled={busy || recording}>
                {busy ? "Salvando…" : editing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
