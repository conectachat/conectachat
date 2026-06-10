import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  MoreVertical,
  MessageSquare,
  Pencil,
  Ban,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Tag as TagIcon,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  TagsManagerDialog,
  TagFilterSelect,
  ContactTagsSection,
  TagChip,
  type Tag,
} from "@/components/contact-tags";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const PER_PAGE = 20;

type ContactRow = {
  id: string;
  org_id: string;
  external_id: string;
  name: string | null;
  name_locked: boolean | null;
  email: string | null;
  birth_date: string | null;
  notes: string | null;
  avatar_url: string | null;
  blocked: boolean | null;
  created_at: string;
  conversations: { last_message_at: string | null }[] | null;
  contact_tags: { tag_id: string; tags: Tag | null }[] | null;
};

function initials(name: string | null, fallback: string) {
  const src = (name?.trim() || fallback || "?").trim();
  const p = src.split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
function formatPhone(id?: string | null) {
  if (!id) return "";
  return "+" + String(id).replace(/\D/g, "");
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function lastMsgOf(c: ContactRow) {
  const list = (c.conversations ?? [])
    .map((x) => x.last_message_at)
    .filter((v): v is string => !!v);
  if (!list.length) return null;
  return list.sort().slice(-1)[0];
}

function Avatar({
  path,
  initials: ini,
  className = "h-9 w-9",
}: {
  path?: string | null;
  initials: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let active = true;
    supabase.storage
      .from("media")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [path]);
  if (url)
    return (
      <img
        src={url}
        alt=""
        className={`${className} rounded-full object-cover`}
      />
    );
  return (
    <div
      className={`${className} flex items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600`}
    >
      {ini}
    </div>
  );
}

export function ContactsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagsManagerOpen, setTagsManagerOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(1);
  }, [debounced, tagFilter]);

  const listQuery = useQuery({
    queryKey: ["contacts-list", debounced, page, tagFilter],
    queryFn: async () => {
      const from = (page - 1) * PER_PAGE;
      const to = from + PER_PAGE - 1;
      const baseCols =
        "id, org_id, external_id, name, name_locked, email, birth_date, notes, avatar_url, blocked, created_at, conversations(last_message_at)";
      let q;
      if (tagFilter) {
        q = supabase
          .from("contacts")
          .select(
            `${baseCols}, contact_tags!inner(tag_id, tags(id, name, color))`,
            { count: "exact" },
          )
          .eq("contact_tags.tag_id", tagFilter)
          .order("created_at", { ascending: false })
          .range(from, to);
      } else {
        q = supabase
          .from("contacts")
          .select(
            `${baseCols}, contact_tags(tag_id, tags(id, name, color))`,
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(from, to);
      }
      const term = debounced.trim();
      if (term) q = q.or(`name.ilike.%${term}%,external_id.ilike.%${term}%`);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as ContactRow[], total: count ?? 0 };
    },
  });

  const countsQuery = useQuery({
    queryKey: ["contacts-counts"],
    queryFn: async () => {
      const [{ count: total }, { count: blocked }] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("blocked", true),
      ]);
      const t = total ?? 0;
      const b = blocked ?? 0;
      return { total: t, blocked: b, active: t - b };
    },
  });

  function reloadAll() {
    queryClient.invalidateQueries({ queryKey: ["contacts-list"] });
    queryClient.invalidateQueries({ queryKey: ["contacts-counts"] });
  }

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAddError(null);
    const telefone = addPhone.replace(/\D/g, "");
    if (telefone.length < 10) {
      setAddError(
        "Número inválido. Use o código do país (ex.: 5547999998888).",
      );
      return;
    }
    if (!orgId) {
      setAddError("Sem empresa vinculada.");
      return;
    }
    setAdding(true);
    const nome = addName.trim();
    const { error } = await supabase
      .from("contacts")
      .upsert(
        {
          org_id: orgId,
          channel_type: "whatsapp_baileys",
          external_id: telefone,
          name: nome || null,
          name_locked: nome.length > 0,
          email: addEmail.trim() || null,
        },
        { onConflict: "org_id,channel_type,external_id" },
      )
      .select("id")
      .single();
    setAdding(false);
    if (error) {
      setAddError("Não foi possível salvar o contato.");
      return;
    }
    setAddOpen(false);
    setAddName("");
    setAddPhone("");
    setAddEmail("");
    reloadAll();
  }

  // Edit drawer
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eBirth, setEBirth] = useState("");
  const [eNotes, setENotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  function openEdit(c: ContactRow) {
    setEditing(c);
    setEName(c.name ?? "");
    setEEmail(c.email ?? "");
    setEBirth(c.birth_date ?? "");
    setENotes(c.notes ?? "");
  }

  async function saveEdit() {
    if (!editing) return;
    setSavingEdit(true);
    const nome = eName.trim();
    const patch = {
      name: nome || null,
      name_locked: nome.length > 0,
      email: eEmail.trim() || null,
      birth_date: eBirth || null,
    };
    const { error } = await supabase
      .from("contacts")
      .update(patch)
      .eq("id", editing.id);
    setSavingEdit(false);
    if (error) {
      alert("Não foi possível salvar o contato.");
      return;
    }
    reloadAll();
    setEditing(null);
  }

  async function saveNotes() {
    if (!editing) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from("contacts")
      .update({ notes: eNotes })
      .eq("id", editing.id);
    setSavingNotes(false);
    if (error) {
      alert("Não foi possível salvar as observações.");
      return;
    }
    reloadAll();
  }

  async function toggleBlock(c: ContactRow) {
    const { error } = await supabase
      .from("contacts")
      .update({ blocked: !c.blocked })
      .eq("id", c.id);
    if (error) {
      alert("Não foi possível atualizar.");
      return;
    }
    reloadAll();
  }

  async function openConversation(c: ContactRow) {
    const { data: canal } = await supabase
      .from("channels")
      .select("id")
      .eq("org_id", c.org_id)
      .eq("type", "whatsapp_baileys")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!canal) {
      alert("Nenhum canal WhatsApp conectado.");
      return;
    }
    let { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", c.id)
      .eq("channel_id", canal.id)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv) {
      const { data: nova, error } = await supabase
        .from("conversations")
        .insert({
          org_id: c.org_id,
          contact_id: c.id,
          channel_id: canal.id,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !nova) {
        alert("Não foi possível abrir a conversa.");
        return;
      }
      conv = nova;
    }
    try {
      sessionStorage.setItem("openConvId", conv.id);
    } catch {
      /* ignore */
    }
    navigate({ to: "/inbox" });
  }

  const [exporting, setExporting] = useState(false);
  async function handleExport() {
    setExporting(true);
    try {
      let todos: Array<{
        name: string | null;
        external_id: string;
        email: string | null;
        birth_date: string | null;
        blocked: boolean | null;
        created_at: string;
      }> = [];
      let de = 0;
      const lote = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("contacts")
          .select("name, external_id, email, birth_date, blocked, created_at")
          .order("created_at", { ascending: false })
          .range(de, de + lote - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        todos = todos.concat(data);
        if (data.length < lote) break;
        de += lote;
      }
      const cab = ["nome", "telefone", "email", "nascimento", "status", "criado_em"];
      const linhas = [
        cab,
        ...todos.map((c) => [
          c.name ?? "",
          c.external_id ?? "",
          c.email ?? "",
          c.birth_date ?? "",
          c.blocked ? "bloqueado" : "ativo",
          c.created_at ?? "",
        ]),
      ];
      const csv = linhas
        .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["\ufeff" + csv], {
        type: "text/csv;charset=utf-8;",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "contatos.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert("Não foi possível exportar os contatos.");
    } finally {
      setExporting(false);
    }
  }

  // ---------- Importar ----------
  type ParsedRow = { nome: string; telefone: string; email: string; suspeito: boolean };
  const [importOpen, setImportOpen] = useState(false);
  const [importCountry, setImportCountry] = useState<"NONE" | "BR">("NONE");
  const [importFileName, setImportFileName] = useState<string>("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [previewValid, setPreviewValid] = useState<ParsedRow[]>([]);
  const [previewSuspect, setPreviewSuspect] = useState<ParsedRow[]>([]);
  const [previewInvalid, setPreviewInvalid] = useState<Array<{ nome: string; telefone: string; email: string }>>([]);
  const [previewExisting, setPreviewExisting] = useState<Set<string>>(new Set());
  const [dupMode, setDupMode] = useState<"keep" | "replace">("keep");
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function resetImportState() {
    setImportFileName("");
    setPreviewValid([]);
    setPreviewSuspect([]);
    setPreviewInvalid([]);
    setPreviewExisting(new Set());
    setDupMode("keep");
    setImportError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openImport() {
    resetImportState();
    setImportOpen(true);
  }

  function downloadTemplate() {
    const csv =
      "nome,telefone,email\nJoão Exemplo,5547999998888,joao@exemplo.com\n";
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-contatos.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function normalizeRow(raw: Record<string, unknown>): { nome: string; telefoneRaw: string; email: string } {
    const lower: Record<string, unknown> = {};
    for (const k of Object.keys(raw)) {
      lower[k.trim().toLowerCase()] = raw[k];
    }
    const nome = String(lower["nome"] ?? lower["name"] ?? "").trim();
    const telefoneRaw = String(lower["telefone"] ?? lower["phone"] ?? lower["celular"] ?? "");
    const email = String(lower["email"] ?? lower["e-mail"] ?? "").trim();
    return { nome, telefoneRaw, email };
  }

  function processRows(raw: Array<Record<string, unknown>>, country: "NONE" | "BR") {
    const valid: ParsedRow[] = [];
    const suspect: ParsedRow[] = [];
    const invalid: Array<{ nome: string; telefone: string; email: string }> = [];
    for (const r of raw) {
      const { nome, telefoneRaw, email } = normalizeRow(r);
      let tel = String(telefoneRaw ?? "").replace(/\D/g, "");
      if (country === "BR" && tel && !tel.startsWith("55") && tel.length <= 11) {
        tel = "55" + tel;
      }
      const ok = tel.length >= 8;
      const isSuspect = tel.length < 11;
      if (!ok) {
        invalid.push({ nome, telefone: telefoneRaw, email });
      } else if (isSuspect) {
        suspect.push({ nome, telefone: tel, email, suspeito: true });
      } else {
        valid.push({ nome, telefone: tel, email, suspeito: false });
      }
    }
    return { valid, suspect, invalid };
  }

  async function handleFileChosen(file: File) {
    setImportError(null);
    setImportResult(null);
    setImportFileName(file.name);
    setImportBusy(true);
    try {
      const name = file.name.toLowerCase();
      let raw: Array<Record<string, unknown>> = [];
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellText: true, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
      } else {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        raw = parsed.data ?? [];
      }
      const { valid, suspect, invalid } = processRows(raw, importCountry);
      const allValid = [...valid, ...suspect];
      // descobrir existentes
      const existentes = new Set<string>();
      const numeros = allValid.map((l) => l.telefone);
      for (let i = 0; i < numeros.length; i += 500) {
        const fatia = numeros.slice(i, i + 500);
        if (fatia.length === 0) break;
        const { data } = await supabase
          .from("contacts")
          .select("external_id")
          .eq("channel_type", "whatsapp_baileys")
          .in("external_id", fatia);
        (data ?? []).forEach((c) => existentes.add(c.external_id));
      }
      setPreviewValid(valid);
      setPreviewSuspect(suspect);
      setPreviewInvalid(invalid);
      setPreviewExisting(existentes);
    } catch (e) {
      setImportError("Não foi possível ler o arquivo.");
    } finally {
      setImportBusy(false);
    }
  }

  // re-process when country changes after a file is loaded
  async function reprocessWithCountry(country: "NONE" | "BR") {
    setImportCountry(country);
    if (!fileInputRef.current?.files?.[0]) return;
    await handleFileChosen(fileInputRef.current.files[0]);
  }

  const importStats = useMemo(() => {
    const all = [...previewValid, ...previewSuspect];
    const novos = all.filter((l) => !previewExisting.has(l.telefone)).length;
    const jaExistem = all.filter((l) => previewExisting.has(l.telefone)).length;
    const invalidos = previewInvalid.length + previewSuspect.length;
    return { novos, jaExistem, invalidos };
  }, [previewValid, previewSuspect, previewInvalid, previewExisting]);

  async function confirmImport() {
    if (!orgId) {
      setImportError("Sem empresa vinculada.");
      return;
    }
    setImportBusy(true);
    setImportError(null);
    try {
      const all = [...previewValid, ...previewSuspect];
      const filtered =
        dupMode === "replace" ? all : all.filter((l) => !previewExisting.has(l.telefone));
      const registros = filtered.map((l) => ({
        org_id: orgId,
        channel_type: "whatsapp_baileys" as const,
        external_id: l.telefone,
        name: (l.nome || "").trim() || null,
        name_locked: (l.nome || "").trim().length > 0,
        email: (l.email || "").trim() || null,
      }));
      for (let i = 0; i < registros.length; i += 500) {
        const { error } = await supabase
          .from("contacts")
          .upsert(registros.slice(i, i + 500), {
            onConflict: "org_id,channel_type,external_id",
          });
        if (error) throw error;
      }
      setImportResult(`${registros.length} contatos importados.`);
      reloadAll();
    } catch (e) {
      setImportError("Não foi possível importar os contatos.");
    } finally {
      setImportBusy(false);
    }
  }


  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Contatos</h1>
              <p className="text-sm text-gray-500">
                Gerencie sua base de contatos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Download size={16} />
                {exporting ? "Exportando…" : "Exportar"}
              </button>
              <button
                onClick={openImport}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Upload size={16} />
                Importar
              </button>
              <button
                onClick={() => setTagsManagerOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <TagIcon size={16} />
                Gerenciar tags
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
          </div>

          {/* Cards */}
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Total de contatos"
              value={countsQuery.data?.total}
            />
            <StatCard label="Ativos" value={countsQuery.data?.active} tone="green" />
            <StatCard
              label="Bloqueados"
              value={countsQuery.data?.blocked}
              tone="red"
            />
          </div>

          {/* Search */}
          <div className="mb-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone…"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">Contato</th>
                  <th className="px-4 py-2.5">Telefone</th>
                  <th className="px-4 py-2.5">Tags</th>
                  <th className="px-4 py-2.5">Criado em</th>
                  <th className="px-4 py-2.5">Última msg</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="w-10 px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listQuery.isLoading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-gray-500"
                    >
                      Carregando…
                    </td>
                  </tr>
                )}
                {!listQuery.isLoading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-gray-500"
                    >
                      Nenhum contato encontrado.
                    </td>
                  </tr>
                )}
                {rows.map((c) => {
                  const ini = initials(c.name, formatPhone(c.external_id));
                  const name = c.name?.trim() || formatPhone(c.external_id) || "Sem nome";
                  const lm = lastMsgOf(c);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            path={c.avatar_url}
                            initials={ini}
                            className="h-9 w-9"
                          />
                          <span className="font-medium text-gray-900">
                            {name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatPhone(c.external_id)}
                      </td>
                      <td className="px-4 py-3 text-gray-400">—</td>
                      <td className="px-4 py-3 text-gray-700">
                        {fmtDate(c.created_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {fmtDate(lm)}
                      </td>
                      <td className="px-4 py-3">
                        {c.blocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Bloqueado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                              <MoreVertical size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => openConversation(c)}>
                              <MessageSquare size={14} />
                              Abrir conversa
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil size={14} />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleBlock(c)}>
                              {c.blocked ? (
                                <>
                                  <CheckCircle2 size={14} />
                                  Desbloquear
                                </>
                              ) : (
                                <>
                                  <Ban size={14} />
                                  Bloquear
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <span>
              {total === 0
                ? "0 contatos"
                : `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} de ${total}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-500">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar contato</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs font-medium text-gray-600">Nome</label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Telefone <span className="text-red-500">*</span>
              </label>
              <input
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="55 47 99999 8888"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Inclua o código do país (ex.: 5547999998888).
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">E-mail</label>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            {addError && (
              <p className="text-xs text-red-600">{addError}</p>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setAddOpen(false)}
              disabled={adding}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {adding ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import modal */}
      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) resetImportState();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar contatos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-600">
                Use o modelo para evitar erros de cabeçalho.
              </span>
              <button
                onClick={downloadTemplate}
                className="text-xs font-medium text-primary hover:underline"
              >
                Baixar modelo
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">
                Completar com país
              </label>
              <select
                value={importCountry}
                onChange={(e) =>
                  reprocessWithCountry(e.target.value as "NONE" | "BR")
                }
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="NONE">
                  Nenhum — os números já têm o código do país
                </option>
                <option value="BR">Brasil (+55)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">
                Arquivo (.csv, .xlsx, .xls)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChosen(f);
                }}
                className="mt-1 w-full text-xs"
              />
              {importFileName && (
                <p className="mt-1 text-[11px] text-gray-500">
                  Arquivo: {importFileName}
                </p>
              )}
            </div>

            {importBusy && (
              <p className="text-xs text-gray-500">Processando…</p>
            )}

            {(previewValid.length > 0 ||
              previewSuspect.length > 0 ||
              previewInvalid.length > 0) && (
              <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-700">
                  <strong>{importStats.novos}</strong> serão adicionados (novos),{" "}
                  <strong>{importStats.jaExistem}</strong> já existem,{" "}
                  <strong>{importStats.invalidos}</strong> com número inválido/suspeito.
                </p>

                {importStats.jaExistem > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-700">
                      Como tratar os números já existentes?
                    </p>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="radio"
                        name="dup"
                        checked={dupMode === "keep"}
                        onChange={() => setDupMode("keep")}
                      />
                      Manter os dados atuais
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="radio"
                        name="dup"
                        checked={dupMode === "replace"}
                        onChange={() => setDupMode("replace")}
                      />
                      Substituir pelos dados da planilha
                    </label>
                  </div>
                )}

                {(previewSuspect.length > 0 || previewInvalid.length > 0) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600">
                      Ver números suspeitos/inválidos
                    </summary>
                    <div className="mt-2 max-h-40 overflow-auto rounded border border-gray-200 bg-white p-2">
                      {previewSuspect.map((r, i) => (
                        <div key={`s-${i}`} className="text-amber-700">
                          {r.telefone} — {r.nome || "(sem nome)"} · suspeito
                        </div>
                      ))}
                      {previewInvalid.map((r, i) => (
                        <div key={`i-${i}`} className="text-red-700">
                          {r.telefone || "(vazio)"} — {r.nome || "(sem nome)"} · inválido
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {importError && (
              <p className="text-xs text-red-600">{importError}</p>
            )}
            {importResult && (
              <p className="text-xs text-green-700">{importResult}</p>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => {
                setImportOpen(false);
                resetImportState();
              }}
              disabled={importBusy}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Fechar
            </button>
            <button
              onClick={confirmImport}
              disabled={
                importBusy ||
                !!importResult ||
                previewValid.length + previewSuspect.length === 0
              }
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {importBusy ? "Importando…" : "Confirmar importação"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Edit drawer */}
      {editing && (
        <div className="fixed inset-0 z-50 flex">
          <button
            className="flex-1 bg-black/30"
            onClick={() => setEditing(null)}
            aria-label="Fechar"
          />
          <aside className="flex w-[380px] flex-col overflow-hidden border-l border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Dados do contato
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="flex flex-col items-center gap-2">
                <Avatar
                  path={editing.avatar_url}
                  initials={initials(editing.name, formatPhone(editing.external_id))}
                  className="h-20 w-20"
                />
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <div>
                  <label className="text-xs font-medium text-gray-500">Nome</label>
                  <input
                    value={eName}
                    onChange={(e) => setEName(e.target.value)}
                    placeholder={formatPhone(editing.external_id)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Telefone</label>
                  <input
                    value={formatPhone(editing.external_id)}
                    disabled
                    className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">E-mail</label>
                  <input
                    type="email"
                    value={eEmail}
                    onChange={(e) => setEEmail(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Nascimento</label>
                  <input
                    type="date"
                    value={eBirth}
                    onChange={(e) => setEBirth(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setEditing(null)}
                    disabled={savingEdit}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={savingEdit}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {savingEdit ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Observações
                </h4>
                <textarea
                  value={eNotes}
                  onChange={(e) => setENotes(e.target.value)}
                  rows={5}
                  placeholder="Anote algo sobre este contato…"
                  className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => setENotes(editing.notes ?? "")}
                    disabled={savingNotes}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {savingNotes ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "text-green-600"
      : tone === "red"
      ? "text-red-600"
      : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}
