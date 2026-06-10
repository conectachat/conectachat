import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Pencil, Trash2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type Tag = { id: string; name: string; color: string };

export const TAG_PALETTE = [
  "#8FC549",
  "#0055A6",
  "#E53935",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#6B7280",
];

// black or white text based on hex luminance
export function readableText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#111827" : "#ffffff";
}

export function TagChip({
  tag,
  onRemove,
  size = "sm",
}: {
  tag: Tag;
  onRemove?: () => void;
  size?: "xs" | "sm";
}) {
  const fg = readableText(tag.color);
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${pad}`}
      style={{ backgroundColor: tag.color, color: fg }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 rounded-full opacity-80 hover:opacity-100"
          style={{ color: fg }}
          aria-label="Remover"
        >
          <X size={size === "xs" ? 10 : 12} />
        </button>
      )}
    </span>
  );
}

// Hook: list tags for an org
export function useOrgTags(orgId: string | null) {
  return useQuery({
    queryKey: ["org-tags", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, color")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
  });
}

// ----- Manager dialog -----
export function TagsManagerDialog({
  open,
  onOpenChange,
  orgId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string | null;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const { data: tags = [], refetch } = useOrgTags(orgId);

  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_PALETTE[0]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eColor, setEColor] = useState(TAG_PALETTE[0]);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["org-tags"] });
    qc.invalidateQueries({ queryKey: ["contacts-list"] });
    qc.invalidateQueries({ queryKey: ["contact-tags"] });
    refetch();
    onChanged?.();
  }

  async function createTag() {
    setErr(null);
    const n = name.trim();
    if (!n) return;
    if (!orgId) {
      setErr("Sem empresa vinculada.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("tags")
      .insert({ org_id: orgId, name: n, color })
      .select("id, name, color")
      .single();
    setBusy(false);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        setErr("Já existe uma tag com esse nome.");
      } else {
        setErr("Não foi possível criar a tag.");
      }
      return;
    }
    setName("");
    setColor(TAG_PALETTE[0]);
    invalidateAll();
  }

  function startEdit(t: Tag) {
    setEditingId(t.id);
    setEName(t.name);
    setEColor(t.color);
  }

  async function saveEdit() {
    if (!editingId) return;
    const n = eName.trim();
    if (!n) return;
    const { error } = await supabase
      .from("tags")
      .update({ name: n, color: eColor })
      .eq("id", editingId);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        alert("Já existe uma tag com esse nome.");
      } else {
        alert("Não foi possível salvar a tag.");
      }
      return;
    }
    setEditingId(null);
    invalidateAll();
  }

  async function removeTag(t: Tag) {
    if (!confirm(`Excluir a tag "${t.name}"? Ela será removida de todos os contatos.`)) return;
    const { error } = await supabase.from("tags").delete().eq("id", t.id);
    if (error) {
      alert("Não foi possível excluir a tag.");
      return;
    }
    invalidateAll();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Create */}
          <div className="rounded border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Nova tag
            </p>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da tag"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <button
                onClick={createTag}
                disabled={busy || !name.trim()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Criar
              </button>
            </div>
            <ColorPicker value={color} onChange={setColor} />
            {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
          </div>

          {/* List */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Tags da empresa
            </p>
            {tags.length === 0 && (
              <p className="rounded border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500">
                Nenhuma tag criada ainda.
              </p>
            )}
            <ul className="space-y-1.5">
              {tags.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1.5"
                >
                  {editingId === t.id ? (
                    <div className="flex-1 space-y-2">
                      <input
                        value={eName}
                        onChange={(e) => setEName(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      />
                      <ColorPicker value={eColor} onChange={setEColor} />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={saveEdit}
                          className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          <Check size={12} className="inline" /> Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <TagChip tag={t} />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(t)}
                          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => removeTag(t)}
                          className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Fechar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {TAG_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full border-2 ${
            value.toLowerCase() === c.toLowerCase()
              ? "border-gray-900"
              : "border-white shadow"
          }`}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-gray-300"
        aria-label="Cor personalizada"
      />
    </div>
  );
}

// ----- Section used inside a contact panel -----
export function ContactTagsSection({
  contactId,
  orgId,
  onChange,
}: {
  contactId: string;
  orgId: string | null;
  onChange?: () => void;
}) {
  const qc = useQueryClient();
  const { data: orgTags = [] } = useOrgTags(orgId);

  const ctQuery = useQuery({
    queryKey: ["contact-tags", contactId],
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from("contact_tags")
        .select("tag_id, tags(id, name, color)")
        .eq("contact_id", contactId);
      if (error) throw error;
      return (data ?? [])
        .map((r: { tags: Tag | null }) => r.tags)
        .filter((t): t is Tag => !!t);
    },
  });

  const current = ctQuery.data ?? [];
  const currentIds = useMemo(() => new Set(current.map((t) => t.id)), [current]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["contact-tags", contactId] }),
      qc.invalidateQueries({ queryKey: ["contacts-list"] }),
    ]);
    await ctQuery.refetch();
    onChange?.();
  }

  async function attach(tagId: string) {
    const { error } = await supabase
      .from("contact_tags")
      .insert({ contact_id: contactId, tag_id: tagId });
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("Erro ao colar tag:", error);
      alert("Não foi possível adicionar a tag.");
      return;
    }
    await refresh();
  }

  async function detach(tagId: string) {
    const { error: errDel } = await supabase
      .from("contact_tags")
      .delete()
      .eq("contact_id", contactId)
      .eq("tag_id", tagId);
    if (errDel) {
      console.error("Erro ao remover tag:", errDel);
      alert("Não foi possível remover a tag.");
      return;
    }
    await refresh();
  }

  async function createAndAttach() {
    const n = newName.trim();
    if (!n || !orgId) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("tags")
      .insert({ org_id: orgId, name: n, color: newColor })
      .select("id")
      .single();
    if (error) {
      console.error("Erro ao criar tag:", error);
      setCreating(false);
      if ((error as { code?: string }).code === "23505") {
        alert("Já existe uma tag com esse nome.");
      } else {
        alert("Não foi possível criar a tag.");
      }
      return;
    }
    const { error: linkErr } = await supabase
      .from("contact_tags")
      .insert({ contact_id: contactId, tag_id: data.id });
    if (linkErr && (linkErr as { code?: string }).code !== "23505") {
      console.error("Erro ao colar tag recém-criada:", linkErr);
    }
    setCreating(false);
    setNewName("");
    setNewColor(TAG_PALETTE[0]);
    await qc.invalidateQueries({ queryKey: ["org-tags"] });
    await refresh();
  }

  const available = orgTags
    .filter((t) => !currentIds.has(t.id))
    .filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Tags
        </h4>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
              title="Adicionar tag"
            >
              <Plus size={12} /> Tag
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar tag…"
              className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
            />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {available.length === 0 && (
                <p className="px-1 py-2 text-center text-[11px] text-gray-500">
                  Nenhuma tag disponível.
                </p>
              )}
              {available.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    attach(t.id);
                  }}
                  className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left hover:bg-gray-100"
                >
                  <TagChip tag={t} />
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-gray-200 pt-2">
              <p className="mb-1 text-[11px] font-medium text-gray-500">Criar nova</p>
              <div className="flex items-center gap-1">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome"
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                />
                <button
                  onClick={createAndAttach}
                  disabled={creating || !newName.trim()}
                  className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Criar
                </button>
              </div>
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {current.length === 0 && (
          <p className="text-xs text-gray-400">Sem tags.</p>
        )}
        {current.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={() => detach(t.id)} />
        ))}
      </div>
    </div>
  );
}

// Simple selector for filtering: returns selected tag id or null
export function TagFilterSelect({
  orgId,
  value,
  onChange,
}: {
  orgId: string | null;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { data: tags = [] } = useOrgTags(orgId);
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:border-primary focus:outline-none"
    >
      <option value="">Todas as tags</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

