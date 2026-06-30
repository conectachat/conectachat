import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Pencil, Trash2, X, Image as ImageIcon, Tags } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  useCatalogCategories,
  useCatalogItems,
  useSignedMediaUrl,
  formatPrice,
  type CatalogItem,
} from "@/hooks/use-catalog";

const sb = supabase as any;

function CatalogImage({ path, className }: { path: string | null; className?: string }) {
  const { data: url } = useSignedMediaUrl(path);
  if (!path) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className ?? ""}`}>
        <ImageIcon size={22} />
      </div>
    );
  }
  if (!url) return <div className={`animate-pulse bg-gray-100 ${className ?? ""}`} />;
  return <img src={url} alt="" className={`object-cover ${className ?? ""}`} />;
}

export function CatalogScreen() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();
  const confirm = useConfirm();

  const categoriesQuery = useCatalogCategories();
  const itemsQuery = useCatalogItems();
  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  const [catFilter, setCatFilter] = useState<string>("all"); // 'all' | 'none' | categoryId
  const visibleItems = useMemo(() => {
    if (catFilter === "all") return items;
    if (catFilter === "none") return items.filter((i) => !i.category_id);
    return items.filter((i) => i.category_id === catFilter);
  }, [items, catFilter]);

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Sem categoria";

  // ---------- modal de item ----------
  const [iOpen, setIOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [iName, setIName] = useState("");
  const [iType, setIType] = useState<"product" | "service">("product");
  const [iCategory, setICategory] = useState<string>("");
  const [iPrice, setIPrice] = useState<string>("");
  const [iDesc, setIDesc] = useState("");
  const [iLink, setILink] = useState("");
  const [iActive, setIActive] = useState(true);
  const [iImagePath, setIImagePath] = useState<string | null>(null);
  const [iUploading, setIUploading] = useState(false);
  const [iBusy, setIBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function openNewItem() {
    setEditing(null);
    setIName("");
    setIType("product");
    setICategory("");
    setIPrice("");
    setIDesc("");
    setILink("");
    setIActive(true);
    setIImagePath(null);
    setIOpen(true);
  }
  function openEditItem(it: CatalogItem) {
    setEditing(it);
    setIName(it.name);
    setIType(it.type);
    setICategory(it.category_id ?? "");
    setIPrice(it.price != null ? String(it.price) : "");
    setIDesc(it.description ?? "");
    setILink(it.payment_link ?? "");
    setIActive(it.is_active);
    setIImagePath(it.image_path);
    setIOpen(true);
  }

  async function uploadImage(file: File) {
    if (!orgId) return;
    setIUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${orgId}/catalog/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("media").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) throw error;
      setIImagePath(path);
    } catch (_e) {
      toast.error("Não foi possível enviar a imagem.");
    } finally {
      setIUploading(false);
    }
  }

  async function saveItem() {
    if (!orgId) return;
    if (!iName.trim()) return toast.error("Dê um nome ao item.");
    if (iUploading) return toast.error("Aguarde o envio da imagem.");
    const priceNum = iPrice.trim() ? parseFloat(iPrice.replace(",", ".")) : null;
    if (iPrice.trim() && (priceNum == null || isNaN(priceNum))) return toast.error("Preço inválido.");
    setIBusy(true);
    try {
      const payload = {
        org_id: orgId,
        name: iName.trim(),
        type: iType,
        category_id: iCategory || null,
        price: priceNum,
        description: iDesc.trim() || null,
        image_path: iImagePath,
        payment_link: iLink.trim() || null,
        is_active: iActive,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await sb.from("catalog_items").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("catalog_items").insert(payload);
        if (error) throw error;
      }
      setIOpen(false);
      qc.invalidateQueries({ queryKey: ["catalog-items"] });
    } catch (_e) {
      toast.error("Não foi possível salvar o item.");
    } finally {
      setIBusy(false);
    }
  }

  async function deleteItem(it: CatalogItem) {
    const ok = await confirm({
      title: "Excluir item?",
      description: `O item "${it.name}" será removido do catálogo.`,
      confirmText: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const { error } = await sb.from("catalog_items").delete().eq("id", it.id);
    if (error) {
      toast.error("Não foi possível excluir.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["catalog-items"] });
  }

  async function toggleActive(it: CatalogItem) {
    await sb.from("catalog_items").update({ is_active: !it.is_active }).eq("id", it.id);
    qc.invalidateQueries({ queryKey: ["catalog-items"] });
  }

  // ---------- modal de categorias ----------
  const [cOpen, setCOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  async function addCategory() {
    if (!orgId || !newCat.trim()) return;
    const { error } = await sb.from("catalog_categories").insert({ org_id: orgId, name: newCat.trim() });
    if (error) {
      toast.error("Não foi possível criar a categoria.");
      return;
    }
    setNewCat("");
    qc.invalidateQueries({ queryKey: ["catalog-categories"] });
  }
  async function deleteCategory(id: string) {
    const { error } = await sb.from("catalog_categories").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível excluir a categoria.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["catalog-categories"] });
    qc.invalidateQueries({ queryKey: ["catalog-items"] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-background">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="shrink-0 md:hidden" />
              <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold">
                  <Package size={20} /> Catálogo
                </h1>
                <p className="text-sm text-muted-foreground">Produtos e serviços para enviar aos clientes.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCOpen(true)} className="gap-1">
                <Tags size={16} /> Categorias
              </Button>
              <Button onClick={openNewItem} className="gap-1">
                <Plus size={16} /> Novo item
              </Button>
            </div>
          </div>

          {/* filtro por categoria */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[
              ["all", "Todos"],
              ["none", "Sem categoria"],
              ...categories.map((c) => [c.id, c.name] as [string, string]),
            ].map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setCatFilter(k)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  catFilter === k
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {itemsQuery.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhum item ainda. Clique em “Novo item” para começar.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleItems.map((it) => (
                <div key={it.id} className="overflow-hidden rounded-lg border bg-white dark:bg-background">
                  <CatalogImage path={it.image_path} className="h-32 w-full" />
                  <div className="space-y-1 p-2.5">
                    <div className="flex items-start justify-between gap-1">
                      <span className="truncate text-sm font-medium">{it.name}</span>
                      {!it.is_active && (
                        <span className="shrink-0 rounded bg-gray-100 px-1 text-[10px] text-gray-500">Inativo</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-brand-green">{formatPrice(it.price, it.currency)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {it.type === "service" ? "Serviço" : "Produto"} · {catName(it.category_id)}
                    </p>
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        onClick={() => openEditItem(it)}
                        className="flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        onClick={() => toggleActive(it)}
                        className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                      >
                        {it.is_active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        onClick={() => deleteItem(it)}
                        className="ml-auto rounded border border-red-200 px-1.5 py-0.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal: novo/editar item */}
      <Dialog open={iOpen} onOpenChange={(o) => !iBusy && setIOpen(o)}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CatalogImage path={iImagePath} className="h-20 w-20 shrink-0 rounded-md border" />
              <div className="space-y-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                    e.currentTarget.value = "";
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={iUploading}>
                  {iUploading ? "Enviando…" : iImagePath ? "Trocar foto" : "Adicionar foto"}
                </Button>
                {iImagePath && (
                  <button
                    onClick={() => setIImagePath(null)}
                    className="block text-[11px] text-gray-500 hover:text-gray-700"
                  >
                    Remover foto
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="i-name">Nome</Label>
              <Input id="i-name" value={iName} onChange={(e) => setIName(e.target.value)} placeholder="Ex.: Camiseta básica" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select
                  value={iType}
                  onChange={(e) => setIType(e.target.value as "product" | "service")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
                >
                  <option value="product">Produto</option>
                  <option value="service">Serviço</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <select
                  value={iCategory}
                  onChange={(e) => setICategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="i-price">Preço (R$)</Label>
              <Input
                id="i-price"
                value={iPrice}
                onChange={(e) => setIPrice(e.target.value)}
                placeholder="Ex.: 49.90 (deixe vazio = Sob consulta)"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="i-desc">Descrição</Label>
              <Textarea id="i-desc" rows={3} value={iDesc} onChange={(e) => setIDesc(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="i-link">Link de pagamento (opcional)</Label>
              <Input
                id="i-link"
                value={iLink}
                onChange={(e) => setILink(e.target.value)}
                placeholder="Cole aqui o link (PIX, Mercado Pago…). As integrações vêm depois."
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="i-active">Ativo (aparece para enviar)</Label>
              <Switch id="i-active" checked={iActive} onCheckedChange={setIActive} />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setIOpen(false)} disabled={iBusy}>
                Cancelar
              </Button>
              <Button size="sm" onClick={saveItem} disabled={iBusy}>
                {iBusy ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: categorias */}
      <Dialog open={cOpen} onOpenChange={setCOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Categorias</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="Nova categoria (ex.: Camisetas)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addCategory();
                }}
              />
              <Button size="sm" onClick={addCategory} disabled={!newCat.trim()}>
                Adicionar
              </Button>
            </div>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma categoria ainda.</p>
            ) : (
              <div className="space-y-1">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                    <span className="text-sm">{c.name}</span>
                    <button onClick={() => deleteCategory(c.id)} className="text-gray-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Excluir uma categoria não apaga os itens — eles ficam “Sem categoria”.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
