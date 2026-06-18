import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Trash2, Loader2, Trophy, XCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  useUpdateCard,
  useSetCardStatus,
  useDeleteCard,
  useOrgUsers,
  useCardNotes,
  useAddCardNote,
  useDeleteCardNote,
  type CrmCard,
  type CrmStage,
} from "@/hooks/use-crm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// -------------------------------------------------------------------
//  Ajudantes
// -------------------------------------------------------------------
function initials(name: string | null | undefined, fallback: string) {
  const source = (name?.trim() || fallback || "?").trim();
  const parts = source.split(/\s+/);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "1.234,56" ou "1234.56" -> centavos (ou null se vazio)
function parseToCents(text: string): number | null {
  const clean = text.trim();
  if (!clean) return null;
  const normalized = clean
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(normalized);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const selectCls =
  "mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-60";

// ===================================================================
//  DETALHE DO CARTÃO
// ===================================================================
export function CrmCardDetail({
  card,
  stages,
  funnelId,
  onClose,
  onOpenConversation,
}: {
  card: CrmCard | null;
  stages: CrmStage[];
  funnelId: string;
  onClose: () => void;
  onOpenConversation: (card: CrmCard) => void;
}) {
  const qc = useQueryClient();
  const updateCard = useUpdateCard();
  const setStatus = useSetCardStatus();
  const deleteCard = useDeleteCard();

  const usersQuery = useOrgUsers();
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const cardId = card?.id ?? null;
  const notesQuery = useCardNotes(cardId);
  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const addNote = useAddCardNote();
  const delNote = useDeleteCardNote();

  const [valueText, setValueText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyStage, setBusyStage] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);

  // Quem sou eu (para mostrar a lixeira só nas minhas anotações).
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setMyUid(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  // Reset ao trocar de cartão.
  useEffect(() => {
    setValueText(card?.value_cents != null ? centsToInput(card.value_cents) : "");
    setNoteText("");
    setLostOpen(false);
    setLostReason("");
    setConfirmDelete(false);
  }, [card?.id]);

  const openStages = useMemo(() => stages.filter((s) => s.kind === "open"), [stages]);
  const currentStage = card ? stages.find((s) => s.id === card.stage_id) ?? null : null;

  const busy = busyStage || updateCard.isPending || setStatus.isPending || deleteCard.isPending;

  // Mover entre etapas "open" (mantém o negócio aberto).
  async function moveToOpenStage(stageId: string) {
    if (!card || stageId === card.stage_id) return;
    setBusyStage(true);
    const { data: top } = await supabase
      .from("crm_cards")
      .select("position")
      .eq("stage_id", stageId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    const position = (top?.position ?? 0) - 1;
    const { error } = await supabase.from("crm_cards").update({ stage_id: stageId, position }).eq("id", card.id);
    setBusyStage(false);
    if (error) {
      toast.error("Não foi possível mudar a etapa.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["crm-cards"] });
    qc.invalidateQueries({ queryKey: ["crm-conv-cards"] });
  }

  async function saveValue() {
    if (!card) return;
    try {
      await updateCard.mutateAsync({ cardId: card.id, patch: { value_cents: parseToCents(valueText) } });
      toast.success("Valor salvo.");
    } catch {
      toast.error("Não foi possível salvar o valor.");
    }
  }

  function changeAssignee(userId: string) {
    if (!card) return;
    updateCard.mutate(
      { cardId: card.id, patch: { assigned_user_id: userId || null } },
      {
        onSuccess: () => toast.success("Responsável atualizado."),
        onError: () => toast.error("Não foi possível atualizar o responsável."),
      },
    );
  }

  function markWon() {
    if (!card) return;
    setStatus.mutate(
      { cardId: card.id, funnelId, target: "won" },
      { onSuccess: () => toast.success("Marcado como Ganho."), onError: () => toast.error("Não foi possível marcar.") },
    );
  }

  function confirmLost() {
    if (!card) return;
    setStatus.mutate(
      { cardId: card.id, funnelId, target: "lost", lostReason: lostReason.trim() || null },
      {
        onSuccess: () => {
          toast.success("Marcado como Perdido.");
          setLostOpen(false);
          setLostReason("");
        },
        onError: () => toast.error("Não foi possível marcar."),
      },
    );
  }

  function reopen() {
    if (!card) return;
    setStatus.mutate(
      { cardId: card.id, funnelId, target: "open" },
      { onSuccess: () => toast.success("Negócio reaberto."), onError: () => toast.error("Não foi possível reabrir.") },
    );
  }

  function doDelete() {
    if (!card) return;
    deleteCard.mutate(
      { cardId: card.id },
      {
        onSuccess: () => {
          toast.success("Cartão excluído.");
          onClose();
        },
        onError: () => toast.error("Não foi possível excluir."),
      },
    );
  }

  function submitNote() {
    if (!card) return;
    const body = noteText.trim();
    if (!body) return;
    addNote.mutate(
      { cardId: card.id, body },
      {
        onSuccess: () => setNoteText(""),
        onError: () => toast.error("Não foi possível salvar a anotação."),
      },
    );
  }

  const label = card?.title?.trim() || card?.contact?.name?.trim() || card?.contact?.external_id || "Sem nome";
  const status = card?.status ?? "open";

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {card && (
          <>
            <DialogHeader className="border-b border-border px-4 py-3">
              <DialogTitle className="flex items-center gap-2 text-left">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={card.contact?.avatar_url ?? undefined} alt={label} />
                  <AvatarFallback className="text-xs">
                    {initials(card.contact?.name, card.contact?.external_id ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {status === "won" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    Ganho
                  </span>
                )}
                {status === "lost" && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                    Perdido
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 px-4 py-4">
              {/* Atalho: abrir a conversa ligada */}
              {card.conversation_id && (
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onOpenConversation(card)}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Abrir conversa na Caixa de entrada
                </Button>
              )}

              {/* Valor */}
              <div>
                <label className="text-xs font-medium text-gray-500">Valor</label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={valueText}
                    disabled={busy}
                    onChange={(e) => setValueText(e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
                  />
                  <Button size="sm" variant="secondary" onClick={saveValue} disabled={busy}>
                    Salvar
                  </Button>
                </div>
              </div>

              {/* Responsável */}
              <div>
                <label className="text-xs font-medium text-gray-500">Responsável</label>
                <select
                  className={selectCls}
                  value={card.assigned_user_id ?? ""}
                  disabled={busy || usersQuery.isLoading}
                  onChange={(e) => changeAssignee(e.target.value)}
                >
                  <option value="">Sem responsável</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Etapa (mover entre etapas abertas) / status do negócio */}
              <div>
                <label className="text-xs font-medium text-gray-500">Etapa</label>
                {status === "open" ? (
                  <select
                    className={selectCls}
                    value={card.stage_id}
                    disabled={busy}
                    onChange={(e) => moveToOpenStage(e.target.value)}
                  >
                    {openStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1 text-sm text-foreground">
                    {currentStage?.name ?? "—"}{" "}
                    <span className="text-muted-foreground">(negócio fechado — use Reabrir para mover)</span>
                  </p>
                )}
              </div>

              {/* Fechamento: Ganho / Perdido / Reabrir */}
              <div className="rounded-lg border border-border p-3">
                {status === "open" ? (
                  <>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={markWon}
                        disabled={busy}
                      >
                        <Trophy className="mr-1 h-4 w-4" />
                        Ganho
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => setLostOpen((v) => !v)}
                        disabled={busy}
                      >
                        <XCircle className="mr-1 h-4 w-4" />
                        Perdido
                      </Button>
                    </div>
                    {lostOpen && (
                      <div className="mt-2 space-y-2">
                        <textarea
                          rows={2}
                          placeholder="Motivo da perda (opcional)"
                          value={lostReason}
                          onChange={(e) => setLostReason(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                        />
                        <Button
                          size="sm"
                          className="w-full bg-red-600 text-white hover:bg-red-700"
                          onClick={confirmLost}
                          disabled={busy}
                        >
                          Confirmar perda
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    {status === "lost" && card.lost_reason && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Motivo:</span> {card.lost_reason}
                      </p>
                    )}
                    <Button size="sm" variant="outline" className="w-full" onClick={reopen} disabled={busy}>
                      <RotateCcw className="mr-1 h-4 w-4" />
                      Reabrir negócio
                    </Button>
                  </div>
                )}
              </div>

              {/* Anotações (histórico) */}
              <div>
                <label className="text-xs font-medium text-gray-500">Anotações</label>
                <div className="mt-1 space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Escreva uma anotação…"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  />
                  <Button size="sm" onClick={submitNote} disabled={addNote.isPending || !noteText.trim()}>
                    {addNote.isPending ? "Salvando…" : "Adicionar anotação"}
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {notesQuery.isLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </p>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma anotação ainda.</p>
                  ) : (
                    notes.map((n) => (
                      <div key={n.id} className="rounded-lg border border-border bg-muted/30 p-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium text-foreground">
                            {n.author?.full_name?.trim() || n.author?.email || "Usuário"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{fmtDateTime(n.created_at)}</span>
                          {myUid && n.author_user_id === myUid && (
                            <button
                              type="button"
                              title="Apagar anotação"
                              aria-label="Apagar anotação"
                              className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                              onClick={() => delNote.mutate({ noteId: n.id, cardId: card.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{n.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Excluir cartão */}
              <div className="border-t border-border pt-3">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-muted-foreground">Excluir este cartão? Não dá pra desfazer.</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                      Cancelar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={doDelete} disabled={busy}>
                      Excluir
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Excluir cartão
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
