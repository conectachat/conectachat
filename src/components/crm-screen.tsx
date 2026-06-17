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

  const sensors =