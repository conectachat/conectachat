import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";

import {
  useFunnels,
  useFunnelBoard,
  useCreateCard,
  type CrmStage,
  type CrmCard,
} from "@/hooks/use-crm";

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
  const normalized = clean.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

type ContactLite = { id: string; name: string | null; external_id: string };

// ===================================================================
//  TELA
// ===================================================================
export function CrmScreen() {
  const funnelsQuery = useFunnels();
  const funnels = funnelsQuery.data ?? [];

  const [funnelId, setFunnelId] = useState<string | null>(null);

  // Assim que os funis carregam, seleciona o primeiro automaticamente.
  useEffect(() => {
    if (!funnelId && funnels.length > 0) setFunnelId(funnels[0].id);
  }, [funnels, funnelId]);

  const { stages, cards, isLoading } = useFunnelBoard(funnelId);
  const createCard = useCreateCard();

  // Cartões agrupados por etapa.
  const cardsByStage = useMemo(() => {
    const map: Record<string, CrmCard[]> = {};
    for (const c of cards) {
      (map[c.stage_id] ??= []).push(c);
    }
    return map;
  }, [cards]);

  // -------- Janela "adicionar cartão" --------
  const [addStage, setAddStage] = useState<CrmStage | null>(null);
  const [selContact, setSelContact] = useState<ContactLite | null>(null);
  const [valueText, setValueText] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactLite[]>([]);
  const [contactPopOpen, setContactPopOpen] = useState(false);

  // Busca de contatos (com pequeno atraso para não consultar a cada tecla).
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
    const position = (cardsByStage[addStage.id]?.length ?? 0);
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

  // -------------------------------------------------------------------
  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 p-4 md:p-6">
      <PageHeader
        title="CRM"
        subtitle="Acompanhe seus contatos em etapas, como um funil."
        actions={
          funnels.length > 0 ? (
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
          ) : undefined
        }
      />

      {/* Estados de carregamento / vazio */}
      {funnelsQuery.isLoading || isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Carregando o quadro…
        </div>
      ) : !selectedFunnel ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Nenhum funil encontrado.
        </div>
      ) : (
        // Quadro: colunas roláveis na horizontal
        <div className="min-h-0 flex-1 overflow-x-auto">
          <div className="flex h-full gap-4 pb-2">
            {stages.map((stage) => {
              const list = cardsByStage[stage.id] ?? [];
              return (
                <div
                  key={stage.id}
                  className="flex h-full w-72 shrink-0 flex-col rounded-lg border border-border bg-card"
                >
                  {/* Cabeçalho da coluna */}
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color ?? "#94A3B8" }}
                    />
                    <span className="truncate text-sm font-medium text-foreground">{stage.name}</span>
                    <span className="ml-auto rounded-full bg-muted px-2 text-xs text-muted-foreground">
                      {list.length}
                    </span>
                  </div>

                  {/* Cartões */}
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {list.length === 0 ? (
                      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                        Nenhum cartão
                      </p>
                    ) : (
                      list.map((card) => {
                        const label = contactLabel(card);
                        const money = formatMoney(card.value_cents, card.currency);
                        return (
                          <div
                            key={card.id}
                            className="rounded-lg border border-border bg-background p-3 shadow-sm"
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage
                                  src={card.contact?.avatar_url ?? undefined}
                                  alt={label}
                                />
                                <AvatarFallback className="text-xs">
                                  {initials(card.contact?.name, card.contact?.external_id ?? "?")}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{label}</p>
                                {money && (
                                  <p className="text-xs text-emerald-600">{money}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Adicionar cartão */}
                  <div className="border-t border-border p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-muted-foreground"
                      onClick={() => openAdd(stage)}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Adicionar cartão
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Janela: adicionar cartão */}
      <Dialog open={!!addStage} onOpenChange={(o) => !o && closeAdd()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar cartão{addStage ? ` em "${addStage.name}"` : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Escolher contato */}
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Popover open={contactPopOpen} onOpenChange={setContactPopOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {selContact
                      ? selContact.name?.trim() || selContact.external_id
                      : "Buscar contato…"}
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
                            <span className="truncate">
                              {c.name?.trim() || c.external_id}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Valor (opcional) */}
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
