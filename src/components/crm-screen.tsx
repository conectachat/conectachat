import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";

import { useFunnels, useFunnelBoard, useCreateCard, useMoveCard, type CrmStage, type CrmCard } from "@/hooks/use-crm";
import { CrmFunnelsManager } from "@/components/crm-funnels-manager";

// -------------------------------------------------------------------
//  Ajudantes
// -------------------------------------------------------------------
function initials(name: string | null | undefined, fallback: string) {
  const source = (name?.trim() || fallback || "?").trim();
  const parts = source.split(/\s+/);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

function contactLabel(card: CrmCard): string {
  return card.title?.trim() || card.contact?.name?.trim() || card.contact?.external_id || "Sem nome";
}

function formatMoney(cents: number | null, currency: string | null): string | null {
  if (cents == null) return null;
  try {
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    });
  } catch {
    return (cents / 100).toFixed(2);
  }
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

type ContactLite = { id: string; name: string | null; external_id: string };

// -------------------------------------------------------------------
//  Visual do cartão (usado na coluna e na "sombra" enquanto arrasta)
// -------------------------------------------------------------------
function CardView({ card, dragging }: { card: CrmCard; dragging?: boolean }) {
  const label = contactLabel(card);
  const money = formatMoney(card.value_cents, card.currency);
  return (
    <div
      className={`rounded-lg border border-border bg-background p-3 shadow-sm ${
        dragging ? "shadow-md ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={card.contact?.avatar_url ?? undefined} alt={label} />
          <AvatarFallback className="text-xs">
            {initials(card.contact?.name, card.contact?.external_id ?? "?")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          {money && <p className="text-xs text-emerald-600">{money}</p>}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
//  Cartão arrastável
// -------------------------------------------------------------------
function SortableCard({ card }: { card: CrmCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <CardView card={card} />
    </div>
  );
}

// -------------------------------------------------------------------
//  Coluna (etapa) — área onde se solta o cartão
// -------------------------------------------------------------------
function Column({ stage, cards, onAdd }: { stage: CrmStage; cards: CrmCard[]; onAdd: (stage: CrmStage) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-lg border border-border bg-card">
      {/* Cabeçalho da coluna */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color ?? "#94A3B8" }} />
        <span className="truncate text-sm font-medium text-foreground">{stage.name}</span>
        <span className="ml-auto rounded-full bg-muted px-2 text-xs text-muted-foreground">{cards.length}</span>
      </div>

      {/* Cartões (área de soltar) */}
      <div ref={setNodeRef} className={`min-h-0 flex-1 space-y-2 overflow-y-auto p-2 ${isOver ? "bg-muted/50" : ""}`}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nenhum cartão</p>
          ) : (
            cards.map((card) => <SortableCard key={card.id} card={card} />)
          )}
        </SortableContext>
      </div>

      {/* Adicionar cartão */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => onAdd(stage)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Adicionar cartão
        </Button>
      </div>
    </div>
  );
}

// ===================================================================
//  TELA
// ===================================================================
export function CrmScreen() {
  const funnelsQuery = useFunnels();
  const funnels = funnelsQuery.data ?? [];

  const [funnelId, setFunnelId] = useState<string | null>(null);
  useEffect(() => {
    if (funnels.length === 0) return;
    const exists = !!funnelId && funnels.some((f) => f.id === funnelId);
    if (!exists) setFunnelId(funnels[0].id);
  }, [funnels, funnelId]);

  const { stages, cards, isLoading } = useFunnelBoard(funnelId);
  const createCard = useCreateCard();
  const moveCard = useMoveCard();

  // Estado local do quadro (espelha o banco; muda na hora ao arrastar).
  const [columns, setColumns] = useState<Record<string, CrmCard[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const sourceRef = useRef<string | null>(null);
  const draggingRef = useRef(false);

  const cardById = useMemo(() => {
    const m: Record<string, CrmCard> = {};
    for (const c of cards) m[c.id] = c;
    return m;
  }, [cards]);

  const stagesById = useMemo(() => {
    const m: Record<string, CrmStage> = {};
    for (const s of stages) m[s.id] = s;
    return m;
  }, [stages]);

  // Reconstrói as colunas a partir do banco (exceto durante um arraste).
  useEffect(() => {
    if (draggingRef.current) return;
    const next: Record<string, CrmCard[]> = {};
    for (const s of stages) next[s.id] = [];
    for (const c of cards) {
      (next[c.stage_id] ??= []).push(c);
    }
    setColumns(next);
  }, [stages, cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  function findContainer(id: string): string | null {
    if (columns[id]) return id; // é a chave de uma coluna (etapa)
    for (const stageId of Object.keys(columns)) {
      if (columns[stageId].some((c) => c.id === id)) return stageId;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    draggingRef.current = true;
    setActiveId(id);
    sourceRef.current = findContainer(id);
  }

  // Move o cartão entre colunas enquanto arrasta (feedback imediato).
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setColumns((prev) => {
      const activeItems = prev[activeContainer] ?? [];
      const overItems = prev[overContainer] ?? [];
      const activeIndex = activeItems.findIndex((c) => c.id === active.id);
      if (activeIndex < 0) return prev;
      const moved = activeItems[activeIndex];

      let overIndex = overItems.findIndex((c) => c.id === over.id);
      if (overIndex < 0) overIndex = overItems.length; // soltou na coluna vazia/fim

      const newActive = [...activeItems];
      newActive.splice(activeIndex, 1);
      const newOver = [...overItems];
      newOver.splice(overIndex, 0, moved);
      return { ...prev, [activeContainer]: newActive, [overContainer]: newOver };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    draggingRef.current = false;
    const movedId = String(active.id);
    const src = sourceRef.current;
    sourceRef.current = null;
    setActiveId(null);
    if (!over) return;

    const destContainer = findContainer(movedId);
    if (!destContainer) return;

    // Ordena dentro da coluna de destino.
    const list = columns[destContainer] ?? [];
    const oldIndex = list.findIndex((c) => c.id === movedId);
    let newIndex = destContainer === String(over.id) ? list.length - 1 : list.findIndex((c) => c.id === over.id);
    if (newIndex < 0) newIndex = list.length - 1;

    let dest = list;
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      dest = arrayMove(list, oldIndex, newIndex);
    }
    const newColumns = { ...columns, [destContainer]: dest };
    setColumns(newColumns);

    // Se nada mudou de fato, não grava nada.
    const sameSpot = src === destContainer && oldIndex === newIndex;
    if (sameSpot) return;

    const destStage = stagesById[destContainer];
    const sourceChanged = !!src && src !== destContainer;
    moveCard.mutate({
      movedId,
      prevStatus: cardById[movedId]?.status ?? "open",
      dest: {
        stageId: destContainer,
        kind: destStage?.kind ?? "open",
        cardIds: newColumns[destContainer].map((c) => c.id),
      },
      source: sourceChanged ? { stageId: src!, cardIds: (newColumns[src!] ?? []).map((c) => c.id) } : null,
    });
  }

  // ---- Janela "adicionar cartão" ----
  const [addStage, setAddStage] = useState<CrmStage | null>(null);
  const [selContact, setSelContact] = useState<ContactLite | null>(null);
  const [valueText, setValueText] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactLite[]>([]);
  const [contactPopOpen, setContactPopOpen] = useState(false);

  useEffect(() => {
    if (!addStage) return;
    let active = true;
    const t = setTimeout(async () => {
      let q = supabase
        .from("contacts")
        .select("id, name, external_id")
        .eq("is_group", false)
        .order("name", { ascending: true })
        .limit(20);
      const term = contactSearch.trim();
      if (term) q = q.or(`name.ilike.%${term}%,external_id.ilike.%${term}%`);
      const { data } = await q;
      if (active) setContactResults((data ?? []) as ContactLite[]);
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [contactSearch, addStage]);

  function openAdd(stage: CrmStage) {
    setAddStage(stage);
    setSelContact(null);
    setValueText("");
    setContactSearch("");
    setContactResults([]);
  }
  function closeAdd() {
    setAddStage(null);
  }

  async function handleCreate() {
    if (!funnelId || !addStage || !selContact) return;
    const position = columns[addStage.id]?.length ?? 0;
    try {
      await createCard.mutateAsync({
        funnelId,
        stageId: addStage.id,
        contactId: selContact.id,
        title: selContact.name?.trim() || null,
        valueCents: parseToCents(valueText),
        position,
      });
      toast.success("Cartão adicionado.");
      closeAdd();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        toast.error("Esse contato já tem um cartão aberto neste funil.");
      } else {
        toast.error("Não foi possível adicionar o cartão.");
      }
    }
  }

  const selectedFunnel = funnels.find((f) => f.id === funnelId) ?? null;
  const activeCard = activeId ? cardById[activeId] : null;

  // -------------------------------------------------------------------
  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 p-4 md:p-6">
      <PageHeader
        title="CRM"
        subtitle="Arraste os cartões entre as etapas do funil."
        actions={
          <div className="flex items-center gap-2">
            {funnels.length > 0 && (
              <Select value={funnelId ?? undefined} onValueChange={setFunnelId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Escolher funil" />
                </SelectTrigger>
                <SelectContent>
                  {funnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <CrmFunnelsManager funnels={funnels} />
          </div>
        }
      />

      {funnelsQuery.isLoading || isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Carregando o quadro…
        </div>
      ) : !selectedFunnel ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Nenhum funil encontrado.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full gap-4 pb-2">
              {stages.map((stage) => (
                <Column key={stage.id} stage={stage} cards={columns[stage.id] ?? []} onAdd={openAdd} />
              ))}
            </div>

            <DragOverlay>
              {activeCard ? (
                <div className="w-64">
                  <CardView card={activeCard} dragging />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Janela: adicionar cartão */}
      <Dialog open={!!addStage} onOpenChange={(o) => !o && closeAdd()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar cartão{addStage ? ` em "${addStage.name}"` : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Popover open={contactPopOpen} onOpenChange={setContactPopOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {selContact ? selContact.name?.trim() || selContact.external_id : "Buscar contato…"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Digite o nome ou número…"
                      value={contactSearch}
                      onValueChange={setContactSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                      <CommandGroup>
                        {contactResults.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setSelContact(c);
                              setContactPopOpen(false);
                            }}
                          >
                            <span className="truncate">{c.name?.trim() || c.external_id}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="crm-value">Valor (opcional)</Label>
              <Input
                id="crm-value"
                inputMode="decimal"
                placeholder="Ex.: 1.500,00"
                value={valueText}
                onChange={(e) => setValueText(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeAdd}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!selContact || createCard.isPending}>
              {createCard.isPending ? "Adicionando…" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
