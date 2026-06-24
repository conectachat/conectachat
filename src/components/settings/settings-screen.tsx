import { useEffect, useMemo, useState } from "react";
import {
  Settings,
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  Check,
  UserPlus,
  Copy,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TAG_PALETTE, ColorPicker, type Tag as TagType } from "@/components/contacts/contact-tags";
import { CompanyDetailsCard } from "@/components/settings/company-details-card";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { QuickRepliesSettings } from "@/components/settings/quick-replies-settings";

type FieldType = "text" | "number" | "date";
type CustomField = {
  id: string;
  name: string;
  field_type: FieldType;
  position: number;
};
const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Texto",
  number: "Número",
  date: "Data",
};

// --- Fase 2 / Passo 1: Departamentos --------------------------------------
type Department = { id: string; name: string; member_count: number };
type OrgUser = { user_id: string; role: string; name: string; email: string };
const ORG_ROLE_LABEL: Record<string, string> = {
  owner: "Dono",
  admin: "Admin",
  agent: "Atendente",
};

// --- Bloco E.0: fuso horário + idioma -------------------------------------
// Lista completa de fusos do navegador (cobre qualquer país). Se o navegador
// for antigo e não tiver a função, caímos numa lista curada de fallback.
const TIMEZONE_LIST: string[] = (() => {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (Array.isArray(list) && list.length) return list;
  } catch {
    /* navegador antigo: usa o fallback abaixo */
  }
  return [
    "America/Sao_Paulo",
    "America/Bahia",
    "America/Fortaleza",
    "America/Manaus",
    "America/Rio_Branco",
    "America/Argentina/Buenos_Aires",
    "America/Montevideo",
    "America/Santiago",
    "America/Asuncion",
    "America/La_Paz",
    "America/Lima",
    "America/Bogota",
    "America/Caracas",
    "America/Mexico_City",
    "America/Cancun",
    "America/Monterrey",
    "America/Guatemala",
    "America/Costa_Rica",
    "America/Panama",
    "America/Santo_Domingo",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/Lisbon",
    "Europe/Madrid",
    "Europe/London",
    "Atlantic/Cape_Verde",
    "UTC",
  ];
})();

// Mostra o fuso com o deslocamento atual, ex.: "America/Sao_Paulo (GMT-3)".
function tzLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const off = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return off ? `${tz} (${off})` : tz;
  } catch {
    return tz;
  }
}

const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

// Radix Select não aceita value="" — usamos este código para "herdar da empresa".
const TZ_INHERIT = "__inherit__";

// --- Plano e cobrança -----------------------------------------------------
// O plano da empresa vem da tabela "plans". Os recursos são flags (jsonb).
type PlanRow = {
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  max_users: number;
  max_channels: number;
  features: Record<string, boolean> | null;
};

// Tradução das flags de recurso (plans.features) para rótulos amigáveis.
const PLAN_FEATURE_LABEL: Record<string, string> = {
  crm_kanban: "CRM Kanban",
  chatbot: "Chatbot / automação",
  broadcast: "Disparo em massa",
};

// Formata centavos -> moeda (ex.: 29900, "BRL" -> "R$ 299,00").
function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
  }
}

function Placeholder({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center text-sm text-muted-foreground">
        <Settings className="mx-auto mb-2 h-6 w-6 opacity-50" />
        <p>{message}</p>
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const { user, activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const isOrgAdmin = activeMembership?.role === "owner" || activeMembership?.role === "admin";
  const isOwner = activeMembership?.role === "owner";
  const qc = useQueryClient();
  const confirm = useConfirm();

  // Navegação das Configurações:
  // - Computador (768px+): abas no topo (TabsList), como sempre.
  // - Celular (<768px): "lista que entra na seção" (estilo Ajustes do
  //   iPhone/Android). settingsTab = seção atual; settingsMobileOpen diz se
  //   estamos vendo a LISTA (false) ou DENTRO de uma seção (true, com Voltar).
  const [settingsTab, setSettingsTab] = useState("geral");
  const [settingsMobileOpen, setSettingsMobileOpen] = useState(false);
  const settingsSections: { value: string; label: string; show: boolean }[] = [
    { value: "geral", label: "Geral", show: true },
    { value: "empresa", label: "Empresa", show: isOrgAdmin },
    { value: "equipe", label: "Equipe", show: isOrgAdmin },
    
    { value: "tags", label: "Tags", show: true },
    { value: "campos", label: "Campos", show: true },
    { value: "departamentos", label: "Departamentos", show: true },
    { value: "respostas", label: "Respostas Rápidas", show: true },
    { value: "horarios", label: "Horários", show: true },
    { value: "distribuicao", label: "Distribuição", show: true },
  ];

  // Opções de fuso (rótulo com deslocamento), montadas uma única vez.
  const tzOptions = useMemo(() => TIMEZONE_LIST.map((tz) => ({ value: tz, label: tzLabel(tz) })), []);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Bloco E.0 — preferências do usuário (fuso + idioma)
  const [userTimezone, setUserTimezone] = useState<string>(""); // "" = herda da empresa
  const [userLanguage, setUserLanguage] = useState<string>("pt-BR");
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Bloco E.0 — dados da empresa (nome + fuso); só dono/admin edita
  const [orgName, setOrgName] = useState("");
  const [orgTimezone, setOrgTimezone] = useState("America/Sao_Paulo");
  const [savingOrg, setSavingOrg] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  // Editar perfil (nome + e-mail com confirmação de e-mail digitado 2x)
  const [editingProfile, setEditingProfile] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Tags state
  const [tagSearch, setTagSearch] = useState("");
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(TAG_PALETTE[0]);
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  // Custom fields state
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [fieldBusy, setFieldBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);


  // Departamentos state (Fase 2 / Passo 1)
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptBusy, setDeptBusy] = useState(false);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [allocDept, setAllocDept] = useState<Department | null>(null); // departamento aberto na alocação

  // Equipe / Usuários state (Fase 2 / Bloco J)
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [nuName, setNuName] = useState("");
  const [nuEmail, setNuEmail] = useState("");
  const [nuRole, setNuRole] = useState<"agent" | "admin">("agent");
  const [nuBusy, setNuBusy] = useState(false);
  const [nuError, setNuError] = useState<string | null>(null);
  // Credenciais geradas (mostradas UMA única vez, para o dono repassar).
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  // Usuário em ação (troca de papel / remoção) — trava os botões da linha.
  const [teamBusyId, setTeamBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, email, timezone, language")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar perfil:", error);
          return;
        }
        setFullName(data?.full_name ?? "");
        setEmail(data?.email ?? user.email ?? "");
        setUserTimezone(data?.timezone ?? "");
        setUserLanguage(data?.language ?? "pt-BR");
      });
  }, [user]);

  // Bloco E.0 — carrega nome e fuso da empresa.
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("organizations")
      .select("name, timezone")
      .eq("id", orgId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar empresa:", error);
          return;
        }
        setOrgName(data?.name ?? "");
        setOrgTimezone(data?.timezone ?? "America/Sao_Paulo");
      });
  }, [orgId]);

  // Plano e cobrança — lê o plano atual da empresa (só dono/admin vê a aba).
  const planQuery = useQuery({
    queryKey: ["org-plan", orgId],
    enabled: !!orgId && isOrgAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("plan_id, plans:plan_id(name, description, price_cents, currency, max_users, max_channels, features)")
        .eq("id", orgId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  // O embed pode vir como objeto ou (em alguns casos) lista — tratamos os dois.
  const planRaw = (planQuery.data as any)?.plans;
  const plan = ((Array.isArray(planRaw) ? planRaw[0] : planRaw) ?? null) as PlanRow | null;

  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileError(null);
    setProfileSuccess(null);
    if (!fullName.trim()) {
      setProfileError("Informe o nome.");
      return;
    }
    setSavingProfile(true);

    // 1) Salva o nome.
    const { error: nameErr } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id);
    if (nameErr) {
      setSavingProfile(false);
      setProfileError("Não foi possível salvar o perfil.");
      return;
    }

    // 2) Se preencheu um novo e-mail, confere a confirmação e troca no
    //    servidor (Edge Function update-email — sem depender de SMTP).
    //    Campos de e-mail em branco = manter o atual.
    const e = newEmail.trim().toLowerCase();
    if (e) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        setSavingProfile(false);
        setProfileError("E-mail inválido.");
        return;
      }
      if (e !== confirmEmail.trim().toLowerCase()) {
        setSavingProfile(false);
        setProfileError("Os e-mails não coincidem.");
        return;
      }
      if (e !== (email || "").toLowerCase()) {
        const { data, error } = await supabase.functions.invoke("update-email", { body: { newEmail: e } });
        if (error || !data?.ok) {
          setSavingProfile(false);
          setProfileError(data?.error || "Não foi possível alterar o e-mail.");
          return;
        }
        setEmail(e);
      }
    }

    setSavingProfile(false);
    setEditingProfile(false);
    setNewEmail("");
    setConfirmEmail("");
    setProfileSuccess("Perfil atualizado!");
  };

  // Bloco E.0 — salva fuso (vazio = NULL = herda da empresa) e idioma.
  const handleSaveUserPrefs = async () => {
    if (!user) return;
    setSavingPrefs(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        timezone: userTimezone.trim() ? userTimezone.trim() : null,
        language: userLanguage,
      })
      .eq("id", user.id);
    if (error) console.error("Erro ao salvar preferências:", error);
    setSavingPrefs(false);
  };

  // Bloco E.0 — salva nome e fuso da empresa (a RLS garante: só dono/admin).
  const handleSaveOrg = async () => {
    if (!orgId) return;
    setSavingOrg(true);
    const { error } = await supabase
      .from("organizations")
      .update({ name: orgName.trim(), timezone: orgTimezone })
      .eq("id", orgId);
    if (error) console.error("Erro ao salvar empresa:", error);
    setSavingOrg(false);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem.");
      return;
    }

    setChangingPassword(true);

    const { error: errVerif } = await supabase.auth.signInWithPassword({
      email: email,
      password: currentPassword,
    });
    if (errVerif) {
      setPasswordError("Senha atual incorreta.");
      setChangingPassword(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSuccess("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
  };

  // Tags queries
  const tagsQuery = useQuery({
    queryKey: ["settings-tags", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Array<TagType & { contact_count: number }>> => {
      const { data, error } = await supabase.from("tags").select("id, name, color, contact_tags(count)").order("name");
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        contact_count: t.contact_tags?.[0]?.count ?? 0,
      }));
    },
  });

  const contactsWithTagQuery = useQuery({
    queryKey: ["contacts-with-tag-count", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from("contact_tags").select("contact_id");
      if (error) throw error;
      return new Set((data ?? []).map((v: any) => v.contact_id)).size;
    },
  });

  const tagsList = tagsQuery.data ?? [];
  const filteredTags = useMemo(() => {
    const s = tagSearch.trim().toLowerCase();
    if (!s) return tagsList;
    return tagsList.filter((t) => t.name.toLowerCase().includes(s));
  }, [tagsList, tagSearch]);

  function invalidateTags() {
    qc.invalidateQueries({ queryKey: ["settings-tags"] });
    qc.invalidateQueries({ queryKey: ["contacts-with-tag-count"] });
    qc.invalidateQueries({ queryKey: ["org-tags"] });
    qc.invalidateQueries({ queryKey: ["contacts-list"] });
    qc.invalidateQueries({ queryKey: ["contact-tags"] });
  }

  function openNewTag() {
    setEditingTag(null);
    setTagName("");
    setTagColor(TAG_PALETTE[0]);
    setTagError(null);
    setTagModalOpen(true);
  }

  function openEditTag(t: TagType) {
    setEditingTag(t);
    setTagName(t.name);
    setTagColor(t.color);
    setTagError(null);
    setTagModalOpen(true);
  }

  async function saveTag() {
    setTagError(null);
    const n = tagName.trim();
    if (!n) return;
    if (!orgId) {
      setTagError("Sem empresa vinculada.");
      return;
    }
    setTagBusy(true);
    if (editingTag) {
      const { error } = await supabase.from("tags").update({ name: n, color: tagColor }).eq("id", editingTag.id);
      setTagBusy(false);
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setTagError("Já existe uma tag com esse nome.");
        } else {
          setTagError("Não foi possível salvar a tag.");
          console.error("Erro ao editar tag:", error);
        }
        return;
      }
    } else {
      const { error } = await supabase
        .from("tags")
        .insert({ org_id: orgId, name: n, color: tagColor })
        .select("id, name, color")
        .single();
      setTagBusy(false);
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setTagError("Já existe uma tag com esse nome.");
        } else {
          setTagError("Não foi possível criar a tag.");
          console.error("Erro ao criar tag:", error);
        }
        return;
      }
    }
    setTagModalOpen(false);
    setEditingTag(null);
    setTagName("");
    setTagColor(TAG_PALETTE[0]);
    invalidateTags();
  }

  async function deleteTag(t: TagType) {
    const ok = await confirm({
      title: "Excluir tag?",
      description: `A tag "${t.name}" será removida de todos os contatos.`,
      confirmText: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("tags").delete().eq("id", t.id);
    if (error) {
      console.error("Erro ao excluir tag:", error);
      toast.error("Não foi possível excluir a tag.");
      return;
    }
    invalidateTags();
  }

  // Custom fields
  const fieldsQuery = useQuery({
    queryKey: ["custom-fields", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CustomField[]> => {
      const { data, error } = await supabase
        .from("custom_fields")
        .select("id, name, field_type, position")
        .order("position")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CustomField[];
    },
  });
  const fieldsList = fieldsQuery.data ?? [];

  function invalidateFields() {
    qc.invalidateQueries({ queryKey: ["custom-fields"] });
    qc.invalidateQueries({ queryKey: ["contacts-list"] });
  }

  function openNewField() {
    setEditingField(null);
    setFieldName("");
    setFieldType("text");
    setFieldError(null);
    setFieldModalOpen(true);
  }
  function openEditField(f: CustomField) {
    setEditingField(f);
    setFieldName(f.name);
    setFieldType(f.field_type);
    setFieldError(null);
    setFieldModalOpen(true);
  }
  async function saveField() {
    setFieldError(null);
    const n = fieldName.trim();
    if (!n) return;
    if (!orgId) {
      setFieldError("Sem empresa vinculada.");
      return;
    }
    setFieldBusy(true);
    if (editingField) {
      const { error } = await supabase
        .from("custom_fields")
        .update({ name: n, field_type: fieldType })
        .eq("id", editingField.id);
      setFieldBusy(false);
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setFieldError("Já existe um campo com esse nome.");
        } else {
          setFieldError("Não foi possível salvar o campo.");
          console.error("Erro ao editar campo:", error);
        }
        return;
      }
    } else {
      const { error } = await supabase.from("custom_fields").insert({
        org_id: orgId,
        name: n,
        field_type: fieldType,
        position: fieldsList.length,
      });
      setFieldBusy(false);
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setFieldError("Já existe um campo com esse nome.");
        } else {
          setFieldError("Não foi possível criar o campo.");
          console.error("Erro ao criar campo:", error);
        }
        return;
      }
    }
    setFieldModalOpen(false);
    setEditingField(null);
    invalidateFields();
  }
  async function deleteField(f: CustomField) {
    const ok = await confirm({
      title: "Excluir campo?",
      description: `O campo "${f.name}" será excluído.`,
      confirmText: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("custom_fields").delete().eq("id", f.id);
    if (error) {
      console.error("Erro ao excluir campo:", error);
      toast.error("Não foi possível excluir o campo.");
      return;
    }
    invalidateFields();
  }

  // Quick replies (respostas rápidas)
  const quickRepliesQuery = useQuery({
    queryKey: ["settings-quick-replies", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<QuickReply[]> => {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("id, shortcut, title, content, active")
        .order("shortcut");
      if (error) throw error;
      return (data ?? []) as QuickReply[];
    },
  });
  const quickRepliesList = quickRepliesQuery.data ?? [];
  const activeQuickReplies = quickRepliesList.filter((q) => q.active).length;
  const filteredQuickReplies = useMemo(() => {
    const s = qrSearch.trim().toLowerCase();
    if (!s) return quickRepliesList;
    return quickRepliesList.filter(
      (q) =>
        q.shortcut.toLowerCase().includes(s) ||
        (q.title ?? "").toLowerCase().includes(s) ||
        q.content.toLowerCase().includes(s),
    );
  }, [quickRepliesList, qrSearch]);

  function invalidateQuickReplies() {
    qc.invalidateQueries({ queryKey: ["settings-quick-replies"] });
    qc.invalidateQueries({ queryKey: ["quick-replies"] });
    qc.invalidateQueries({ queryKey: ["org-quick-replies"] });
  }

  function openNewQuickReply() {
    setEditingQr(null);
    setQrShortcut("");
    setQrTitle("");
    setQrContent("");
    setQrError(null);
    setQrModalOpen(true);
  }
  function openEditQuickReply(q: QuickReply) {
    setEditingQr(q);
    setQrShortcut(q.shortcut);
    setQrTitle(q.title ?? "");
    setQrContent(q.content);
    setQrError(null);
    setQrModalOpen(true);
  }
  async function saveQuickReply() {
    setQrError(null);
    const atalho = qrShortcut
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    const conteudo = qrContent.trim();
    if (!atalho) {
      setQrError("Informe um atalho (ex.: saudacao).");
      return;
    }
    if (!conteudo) {
      setQrError("Informe a mensagem da resposta.");
      return;
    }
    if (!orgId) {
      setQrError("Sem empresa vinculada.");
      return;
    }
    setQrBusy(true);
    if (editingQr) {
      const { error } = await supabase
        .from("quick_replies")
        .update({ shortcut: atalho, title: qrTitle.trim() || null, content: conteudo })
        .eq("id", editingQr.id);
      setQrBusy(false);
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setQrError("Já existe uma resposta com esse atalho.");
        } else {
          setQrError("Não foi possível salvar a resposta.");
          console.error("Erro ao editar resposta rápida:", error);
        }
        return;
      }
    } else {
      const { error } = await supabase.from("quick_replies").insert({
        org_id: orgId,
        shortcut: atalho,
        title: qrTitle.trim() || null,
        content: conteudo,
      });
      setQrBusy(false);
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setQrError("Já existe uma resposta com esse atalho.");
        } else {
          setQrError("Não foi possível criar a resposta.");
          console.error("Erro ao criar resposta rápida:", error);
        }
        return;
      }
    }
    setQrModalOpen(false);
    setEditingQr(null);
    invalidateQuickReplies();
  }
  async function deleteQuickReply(q: QuickReply) {
    const ok = await confirm({
      title: "Excluir resposta rápida?",
      description: `A resposta "/${q.shortcut}" será excluída.`,
      confirmText: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("quick_replies").delete().eq("id", q.id);
    if (error) {
      console.error("Erro ao excluir resposta rápida:", error);
      toast.error("Não foi possível excluir a resposta.");
      return;
    }
    invalidateQuickReplies();
  }
  async function toggleQuickReply(q: QuickReply) {
    const { error } = await supabase.from("quick_replies").update({ active: !q.active }).eq("id", q.id);
    if (error) {
      console.error("Erro ao alterar status da resposta:", error);
      return;
    }
    invalidateQuickReplies();
  }

  // --- Departamentos (Fase 2 / Passo 1) -----------------------------------
  // Lista de departamentos da empresa, já com a contagem de atendentes.
  const departmentsQuery = useQuery({
    queryKey: ["settings-departments", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, department_members(count)")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        id: d.id,
        name: d.name,
        member_count: d.department_members?.[0]?.count ?? 0,
      }));
    },
  });
  const departmentsList = departmentsQuery.data ?? [];

  // Todos os usuários da empresa (para a tela de alocação).
  const orgUsersQuery = useQuery({
    queryKey: ["settings-org-users", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgUser[]> => {
      const { data, error } = await supabase
        .from("org_members")
        .select("user_id, role, created_at, profiles(full_name, email)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        user_id: m.user_id,
        role: (m.role ?? "agent") as string,
        name: m.profiles?.full_name || m.profiles?.email || "Usuário",
        email: m.profiles?.email || "",
      }));
    },
  });
  const orgUsersList = orgUsersQuery.data ?? [];

  // Quem já pertence ao departamento aberto na alocação.
  const deptMembersQuery = useQuery({
    queryKey: ["settings-dept-members", allocDept?.id ?? null],
    enabled: !!allocDept?.id,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("department_members")
        .select("user_id")
        .eq("department_id", allocDept!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.user_id as string));
    },
  });
  const deptMemberSet = deptMembersQuery.data ?? new Set<string>();

  function invalidateDepartments() {
    qc.invalidateQueries({ queryKey: ["settings-departments"] });
  }

  function openNewDept() {
    setEditingDept(null);
    setDeptName("");
    setDeptError(null);
    setDeptModalOpen(true);
  }
  function openEditDept(d: Department) {
    setEditingDept(d);
    setDeptName(d.name);
    setDeptError(null);
    setDeptModalOpen(true);
  }
  async function saveDept() {
    setDeptError(null);
    const n = deptName.trim();
    if (!n) return;
    if (!orgId) {
      setDeptError("Sem empresa vinculada.");
      return;
    }
    setDeptBusy(true);
    if (editingDept) {
      const { error } = await supabase.from("departments").update({ name: n }).eq("id", editingDept.id);
      setDeptBusy(false);
      if (error) {
        setDeptError("Não foi possível salvar o departamento.");
        console.error("Erro ao editar departamento:", error);
        return;
      }
    } else {
      const { error } = await supabase.from("departments").insert({ org_id: orgId, name: n });
      setDeptBusy(false);
      if (error) {
        setDeptError("Não foi possível criar o departamento.");
        console.error("Erro ao criar departamento:", error);
        return;
      }
    }
    setDeptModalOpen(false);
    setEditingDept(null);
    setDeptName("");
    invalidateDepartments();
  }
  async function deleteDept(d: Department) {
    const ok = await confirm({
      title: "Excluir departamento?",
      description: `O departamento "${d.name}" será excluído. As conversas atuais não serão apagadas — elas apenas ficarão sem departamento.`,
      confirmText: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("departments").delete().eq("id", d.id);
    if (error) {
      console.error("Erro ao excluir departamento:", error);
      toast.error("Não foi possível excluir o departamento.");
      return;
    }
    if (allocDept?.id === d.id) setAllocDept(null);
    invalidateDepartments();
  }
  // Marca/desmarca um atendente no departamento aberto. Salva na hora.
  async function toggleMember(userId: string, isMember: boolean) {
    if (!allocDept) return;
    if (isMember) {
      const { error } = await supabase
        .from("department_members")
        .delete()
        .eq("department_id", allocDept.id)
        .eq("user_id", userId);
      if (error) {
        console.error("Erro ao remover do departamento:", error);
        toast.error("Não foi possível remover.");
        return;
      }
    } else {
      const { error } = await supabase
        .from("department_members")
        .insert({ department_id: allocDept.id, user_id: userId });
      if (error) {
        console.error("Erro ao adicionar ao departamento:", error);
        toast.error("Não foi possível adicionar.");
        return;
      }
    }
    qc.invalidateQueries({ queryKey: ["settings-dept-members", allocDept.id] });
    invalidateDepartments();
  }

  // --- Equipe / Usuários (Fase 2 / Bloco J) -------------------------------
  // Toda escrita passa pela Edge Function "manage-team" (service role no
  // servidor); o navegador NÃO escreve direto em org_members.
  function invalidateOrgUsers() {
    qc.invalidateQueries({ queryKey: ["settings-org-users"] });
    qc.invalidateQueries({ queryKey: ["settings-departments"] }); // contagem de atendentes pode mudar
    qc.invalidateQueries({ queryKey: ["org_members"] }); // hook use-current-user (caso o próprio papel mude)
  }

  // Chama a função e padroniza a leitura do resultado.
  // Sucesso = data.ok === true. Erro de negócio = data.ok === false (+ data.error).
  async function callTeam(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("manage-team", { body });
    const errorMsg: string | undefined =
      (data && data.ok === false ? (data.error as string) : undefined) ?? (error ? error.message : undefined);
    return { data: data as any, okFlag: !!data?.ok, errorMsg };
  }

  function openNewUser() {
    setNuName("");
    setNuEmail("");
    setNuRole("agent");
    setNuError(null);
    setNewUserOpen(true);
  }

  async function handleCreateUser() {
    setNuError(null);
    if (!orgId) {
      setNuError("Sem empresa vinculada.");
      return;
    }
    if (!nuName.trim()) {
      setNuError("Informe o nome.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuEmail.trim())) {
      setNuError("E-mail inválido.");
      return;
    }
    setNuBusy(true);
    const { data, okFlag, errorMsg } = await callTeam({
      action: "create",
      orgId,
      fullName: nuName.trim(),
      email: nuEmail.trim(),
      role: nuRole,
    });
    setNuBusy(false);
    if (!okFlag) {
      setNuError(errorMsg ?? "Não foi possível criar o usuário.");
      return;
    }
    setNewUserOpen(false);
    setCreatedCreds({ email: data.email, password: data.tempPassword });
    invalidateOrgUsers();
  }

  async function handleChangeRole(u: OrgUser, role: "agent" | "admin") {
    if (role === u.role || !orgId) return;
    setTeamBusyId(u.user_id);
    const { okFlag, errorMsg } = await callTeam({ action: "set-role", orgId, userId: u.user_id, role });
    setTeamBusyId(null);
    if (!okFlag) {
      toast.error("Não foi possível trocar o papel", { description: errorMsg });
      return;
    }
    toast.success("Papel atualizado.");
    invalidateOrgUsers();
  }

  async function handleRemoveUser(u: OrgUser) {
    if (!orgId) return;
    const okC = await confirm({
      title: "Remover usuário?",
      description: `"${u.name}" perderá o acesso a esta empresa. O histórico de mensagens é mantido; a conta e o e-mail não são apagados.`,
      confirmText: "Remover",
      danger: true,
    });
    if (!okC) return;
    setTeamBusyId(u.user_id);
    const { okFlag, errorMsg } = await callTeam({ action: "remove", orgId, userId: u.user_id });
    setTeamBusyId(null);
    if (!okFlag) {
      toast.error("Não foi possível remover", { description: errorMsg });
      return;
    }
    toast.success("Usuário removido da empresa.");
    invalidateOrgUsers();
  }

  async function copyCreds() {
    if (!createdCreds) return;
    const txt =
      `ConectaChat — seu acesso\n` +
      `E-mail: ${createdCreds.email}\n` +
      `Senha provisória: ${createdCreds.password}\n\n` +
      `Entre e troque a senha em Configurações > Geral.`;
    try {
      await navigator.clipboard.writeText(txt);
      toast.success("Acesso copiado!");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Configurações" subtitle="Gerencie as configurações do sistema." />

        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="mt-6">
          {/* Computador (768px+): abas no topo. Escondidas no celular. */}
          <TabsList className="hidden w-full justify-start overflow-x-auto md:flex">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            {isOrgAdmin && <TabsTrigger value="empresa">Empresa</TabsTrigger>}
            {isOrgAdmin && <TabsTrigger value="equipe">Equipe</TabsTrigger>}
            
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="campos">Campos</TabsTrigger>
            <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
            <TabsTrigger value="respostas">Respostas Rápidas</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
            <TabsTrigger value="distribuicao">Distribuição</TabsTrigger>
          </TabsList>

          {/* Celular (<768px): lista de seções estilo "Ajustes". Some quando
              uma seção é aberta; cada item entra na seção (com Voltar). */}
          {!settingsMobileOpen && (
            <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden">
              {settingsSections
                .filter((s) => s.show)
                .map((s) => (
                  <button
                    key={s.value}
                    onClick={() => {
                      setSettingsTab(s.value);
                      setSettingsMobileOpen(true);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50"
                  >
                    <span>{s.label}</span>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                ))}
            </div>
          )}

          {/* Conteúdo das seções: no celular só aparece quando uma seção foi
              aberta (com "Voltar" no topo); no computador aparece sempre
              (controlado pelas abas acima). */}
          <div className={settingsMobileOpen ? "" : "hidden md:block"}>
            {settingsMobileOpen && (
              <button
                onClick={() => setSettingsMobileOpen(false)}
                className="mb-3 flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 md:hidden"
              >
                <ChevronLeft size={16} /> Voltar
              </button>
            )}

            <TabsContent value="geral" className="mt-4 space-y-6">
              {/* Meu Perfil */}
              <section className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground">Meu Perfil</h2>
                  {!editingProfile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setProfileError(null);
                        setProfileSuccess(null);
                        setNewEmail("");
                        setConfirmEmail("");
                        setEditingProfile(true);
                      }}
                    >
                      Editar perfil
                    </Button>
                  )}
                </div>

                {!editingProfile ? (
                  // Modo visualização
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input value={fullName} readOnly disabled className="bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <Input value={email} readOnly disabled className="bg-muted/50" />
                    </div>
                  </div>
                ) : (
                  // Modo edição
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="nome">Nome</Label>
                        <Input
                          id="nome"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Seu nome"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>E-mail atual</Label>
                        <Input value={email} readOnly disabled className="bg-muted/50" />
                      </div>
                    </div>

                    <div className="rounded-lg border border-dashed border-gray-300 p-4">
                      <p className="text-xs text-muted-foreground">
                        Para trocar o e-mail de acesso, digite o novo e-mail <strong>duas vezes</strong>. Deixe em
                        branco para manter o atual. A troca é imediata; use o novo e-mail no próximo login.
                      </p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="novo-email">Novo e-mail</Label>
                          <Input
                            id="novo-email"
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="voce@empresa.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirmar-email">Confirmar novo e-mail</Label>
                          <Input
                            id="confirmar-email"
                            type="email"
                            value={confirmEmail}
                            onChange={(e) => setConfirmEmail(e.target.value)}
                            placeholder="Repita o novo e-mail"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(profileError || profileSuccess) && (
                  <p className={`mt-3 text-sm ${profileError ? "text-destructive" : "text-green-600"}`}>
                    {profileError ?? profileSuccess}
                  </p>
                )}

                {editingProfile && (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={savingProfile}
                      onClick={() => {
                        setEditingProfile(false);
                        setNewEmail("");
                        setConfirmEmail("");
                        setProfileError(null);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm">
                      {savingProfile ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                )}
              </section>

              {/* Alterar Senha */}
              <section className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-sm font-medium text-foreground">Alterar Senha</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="senha-atual">Senha atual</Label>
                    <Input
                      id="senha-atual"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nova-senha">Nova senha</Label>
                    <Input
                      id="nova-senha"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                    <Input
                      id="confirmar-senha"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                    />
                  </div>
                </div>

                {(passwordError || passwordSuccess) && (
                  <p className={`mt-3 text-sm ${passwordError ? "text-destructive" : "text-green-600"}`}>
                    {passwordError ?? passwordSuccess}
                  </p>
                )}

                <div className="mt-4 flex justify-end">
                  <Button onClick={handleChangePassword} disabled={changingPassword} size="sm">
                    {changingPassword ? "Alterando..." : "Alterar senha"}
                  </Button>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-sm font-medium text-foreground">Preferências do Usuário</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="user-fuso">Meu fuso horário</Label>
                    <Select
                      value={userTimezone ? userTimezone : TZ_INHERIT}
                      onValueChange={(v) => setUserTimezone(v === TZ_INHERIT ? "" : v)}
                    >
                      <SelectTrigger id="user-fuso">
                        <SelectValue placeholder="Selecione o fuso" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={TZ_INHERIT}>Usar o fuso da empresa ({orgTimezone})</SelectItem>
                        {tzOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">É este fuso que vale na hora de agendar mensagens.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-idioma">Idioma</Label>
                    <Select value={userLanguage} onValueChange={setUserLanguage}>
                      <SelectTrigger id="user-idioma">
                        <SelectValue placeholder="Selecione o idioma" />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      O app ainda está em português; a tradução será ativada em breve.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleSaveUserPrefs} disabled={savingPrefs} size="sm">
                    {savingPrefs ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </section>

              <NotificationsCard />
            </TabsContent>

            {/* Bloco E.0 — Empresa (só dono/admin) */}
            {isOrgAdmin && (
              <TabsContent value="empresa" className="mt-4 space-y-6">
                <section className="rounded-lg border border-border bg-card p-5">
                  <h2 className="text-sm font-medium text-foreground">Dados da Empresa</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Visível apenas para o dono e administradores da empresa.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-nome">Nome da empresa</Label>
                      <Input
                        id="org-nome"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Nome da empresa"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-fuso">Fuso horário da empresa</Label>
                      <Select value={orgTimezone} onValueChange={setOrgTimezone}>
                        <SelectTrigger id="org-fuso">
                          <SelectValue placeholder="Selecione o fuso" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {tzOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Usado como padrão para novos usuários e relatórios.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={handleSaveOrg} disabled={savingOrg} size="sm">
                      {savingOrg ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </section>

                <CompanyDetailsCard orgId={orgId} />

                {/* Plano e cobrança ------------------------------------------------ */}
                <section className="rounded-lg border border-border bg-card p-5">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    Plano e cobrança
                  </h2>

                  {planQuery.isLoading ? (
                    <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
                  ) : !plan ? (
                    <p className="mt-4 text-sm text-muted-foreground">Nenhum plano vinculado ainda.</p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {/* Caixa de destaque do plano atual */}
                      <div className="rounded-xl border border-brand-soft-strong bg-brand-soft p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-brand-text">
                              Plano atual
                            </div>
                            <div className="mt-0.5 text-xl font-extrabold text-foreground">
                              {plan.name} ·{" "}
                              {plan.price_cents === 0 ? "Grátis" : `${fmtMoney(plan.price_cents, plan.currency)}/mês`}
                            </div>
                            {plan.description && (
                              <div className="mt-0.5 text-xs text-muted-foreground">{plan.description}</div>
                            )}
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativo
                          </span>
                        </div>

                        <ul className="mt-3 space-y-1 text-[12.5px] text-muted-foreground">
                          <li>
                            •{" "}
                            {plan.max_users >= 9999
                              ? "Atendentes ilimitados"
                              : `Até ${plan.max_users} ${plan.max_users === 1 ? "atendente" : "atendentes"}`}
                          </li>
                          <li>
                            •{" "}
                            {plan.max_channels >= 9999
                              ? "Canais de WhatsApp ilimitados"
                              : `${plan.max_channels} ${plan.max_channels === 1 ? "canal" : "canais"} de WhatsApp`}
                          </li>
                          {Object.entries(plan.features ?? {})
                            .filter(([, on]) => on)
                            .map(([key]) => (
                              <li key={key}>• {PLAN_FEATURE_LABEL[key] ?? key}</li>
                            ))}
                        </ul>
                      </div>

                      {/* Cobrança online (Stripe) — ainda não ativada */}
                      <div className="rounded-lg border border-dashed border-border p-3">
                        <p className="text-xs text-muted-foreground">
                          Cobrança online em breve. Quando o pagamento por cartão estiver ativo, aqui você verá a
                          próxima cobrança e o cartão cadastrado, e poderá trocar de plano.
                        </p>
                      </div>

                      <Button variant="outline" disabled className="w-full">
                        Gerenciar assinatura
                      </Button>
                    </div>
                  )}
                </section>
              </TabsContent>
            )}
            {isOrgAdmin && (
              <TabsContent value="equipe" className="mt-4 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Crie e gerencie os usuários da sua empresa.{" "}
                    {isOwner ? "Você pode criar admins e atendentes." : "Você pode criar atendentes."}
                  </p>
                  <Button onClick={openNewUser} size="sm" className="shrink-0">
                    <UserPlus className="mr-1 h-4 w-4" /> Novo usuário
                  </Button>
                </div>

                {orgUsersQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : (
                  <div className="space-y-2">
                    {orgUsersList.map((u) => {
                      const isSelf = u.user_id === user?.id;
                      const isOwnerRow = u.role === "owner";
                      // Quem chama pode mexer nesta linha? (espelha as regras do servidor)
                      const canManage = !isSelf && !isOwnerRow && (isOwner || u.role === "agent");
                      return (
                        <div
                          key={u.user_id}
                          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                              {isSelf && (
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                  Você
                                </span>
                              )}
                            </div>
                            {u.email && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {isOwner && canManage ? (
                              <Select
                                value={u.role}
                                onValueChange={(v) => handleChangeRole(u, v as "agent" | "admin")}
                                disabled={teamBusyId === u.user_id}
                              >
                                <SelectTrigger className="h-8 w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="agent">Atendente</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                                {ORG_ROLE_LABEL[u.role] ?? u.role}
                              </span>
                            )}
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveUser(u)}
                                disabled={teamBusyId === u.user_id}
                                title="Remover da empresa"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Modal: novo usuário */}
                <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Novo usuário</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="nu-name">Nome</Label>
                        <Input
                          id="nu-name"
                          value={nuName}
                          onChange={(e) => setNuName(e.target.value)}
                          placeholder="Ex.: Maria Silva"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nu-email">E-mail</Label>
                        <Input
                          id="nu-email"
                          type="email"
                          value={nuEmail}
                          onChange={(e) => setNuEmail(e.target.value)}
                          placeholder="maria@empresa.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Papel</Label>
                        <Select value={nuRole} onValueChange={(v) => setNuRole(v as "agent" | "admin")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agent">Atendente</SelectItem>
                            {isOwner && <SelectItem value="admin">Admin</SelectItem>}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {nuRole === "admin"
                            ? "Admin gerencia a operação e a equipe (atendentes)."
                            : "Atendente atende as conversas."}
                        </p>
                      </div>
                      {nuError && <p className="text-sm text-destructive">{nuError}</p>}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setNewUserOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleCreateUser}
                          disabled={nuBusy || !nuName.trim() || !nuEmail.trim()}
                        >
                          {nuBusy ? "Criando…" : "Criar usuário"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Modal: credenciais geradas (mostradas UMA única vez) */}
                <Dialog
                  open={!!createdCreds}
                  onOpenChange={(o) => {
                    if (!o) setCreatedCreds(null);
                  }}
                >
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Usuário criado ✅</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Anote e envie estes dados ao novo usuário.{" "}
                        <strong className="text-foreground">A senha provisória só aparece agora.</strong> Ele deve
                        trocá-la após entrar (Configurações &gt; Geral).
                      </p>
                      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">E-mail: </span>
                          <span className="break-all font-medium text-foreground">{createdCreds?.email}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Senha provisória: </span>
                          <span className="break-all font-mono font-medium text-foreground">
                            {createdCreds?.password}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={copyCreds}>
                          <Copy className="mr-1 h-4 w-4" /> Copiar acesso
                        </Button>
                        <Button size="sm" onClick={() => setCreatedCreds(null)}>
                          Fechar
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </TabsContent>
            )}


            <TabsContent value="tags" className="mt-4 space-y-4">
              {/* Cards */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-2xl font-semibold text-foreground">{tagsList.length}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Tags criadas</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-2xl font-semibold text-foreground">{contactsWithTagQuery.data ?? 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Contatos com tag</p>
                </div>
              </div>

              {/* Search + New */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Buscar tag…"
                    className="pl-9"
                  />
                </div>
                <Button onClick={openNewTag} size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Nova Tag
                </Button>
              </div>

              {/* List */}
              <div className="rounded-lg border border-border bg-card">
                {filteredTags.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    {tagSearch.trim() ? "Nenhuma tag encontrada." : "Nenhuma tag criada ainda."}
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredTags.map((t) => (
                      <li key={t.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                          <span className="text-sm font-medium text-foreground">{t.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {t.contact_count} {t.contact_count === 1 ? "contato" : "contatos"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditTag(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteTag(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Tag Modal (create / edit) */}
              <Dialog open={tagModalOpen} onOpenChange={setTagModalOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingTag ? "Editar tag" : "Nova tag"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tag-name">Nome</Label>
                      <Input
                        id="tag-name"
                        value={tagName}
                        onChange={(e) => setTagName(e.target.value)}
                        placeholder="Nome da tag"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cor</Label>
                      <ColorPicker value={tagColor} onChange={setTagColor} />
                    </div>
                    {tagError && <p className="text-sm text-destructive">{tagError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setTagModalOpen(false)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={saveTag} disabled={tagBusy || !tagName.trim()}>
                        {tagBusy ? "Salvando…" : editingTag ? "Salvar" : "Criar"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="campos" className="mt-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Campos extras que aparecerão no painel de detalhes do contato
                </p>
                <Button onClick={openNewField} size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Novo Campo
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-card">
                {fieldsList.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center text-center text-sm">
                    <p className="font-medium text-foreground">Nenhum campo criado</p>
                    <p className="mt-1 text-muted-foreground">Crie campos como CPF, Empresa, Cargo, etc.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {fieldsList.map((f) => (
                      <li key={f.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-foreground">{f.name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {FIELD_TYPE_LABEL[f.field_type]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditField(f)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteField(f)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Dialog open={fieldModalOpen} onOpenChange={setFieldModalOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingField ? "Editar campo" : "Novo campo"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="field-name">Nome</Label>
                      <Input
                        id="field-name"
                        value={fieldName}
                        onChange={(e) => setFieldName(e.target.value)}
                        placeholder="Ex.: CPF"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="number">Número</SelectItem>
                          <SelectItem value="date">Data</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setFieldModalOpen(false)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={saveField} disabled={fieldBusy || !fieldName.trim()}>
                        {fieldBusy ? "Salvando…" : editingField ? "Salvar" : "Criar"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* Fase 2 / Passo 1 — Departamentos + alocação de usuários */}
            <TabsContent value="departamentos" className="mt-4 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Organize sua equipe em departamentos (ex.: Suporte, Vendas). Um atendente pode estar em vários.
                </p>
                {isOrgAdmin ? (
                  <Button onClick={openNewDept} size="sm" className="shrink-0">
                    <Plus className="mr-1 h-4 w-4" /> Novo Departamento
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Somente o dono e administradores podem gerenciar.
                  </span>
                )}
              </div>

              {departmentsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : departmentsList.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-border bg-card text-center text-sm">
                  <Users className="mb-2 h-6 w-6 text-muted-foreground opacity-50" />
                  <p className="font-medium text-foreground">Nenhum departamento criado</p>
                  <p className="mt-1 text-muted-foreground">
                    {isOrgAdmin ? "Clique em “Novo Departamento” para começar." : "Peça ao administrador para criar."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {departmentsList.map((d) => (
                    <div key={d.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {d.member_count} {d.member_count === 1 ? "atendente" : "atendentes"}
                          </p>
                        </div>
                        {isOrgAdmin && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDept(d)}
                              title="Renomear"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteDept(d)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {isOrgAdmin && (
                        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setAllocDept(d)}>
                          <Users className="mr-1 h-4 w-4" /> Atendentes
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Modal: criar / renomear departamento */}
              <Dialog open={deptModalOpen} onOpenChange={setDeptModalOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingDept ? "Renomear departamento" : "Novo departamento"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="dept-name">Nome</Label>
                      <Input
                        id="dept-name"
                        value={deptName}
                        onChange={(e) => setDeptName(e.target.value)}
                        placeholder="Ex.: Suporte"
                      />
                    </div>
                    {deptError && <p className="text-sm text-destructive">{deptError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDeptModalOpen(false)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={saveDept} disabled={deptBusy || !deptName.trim()}>
                        {deptBusy ? "Salvando…" : editingDept ? "Salvar" : "Criar"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Modal: alocar atendentes a um departamento */}
              <Dialog
                open={!!allocDept}
                onOpenChange={(o) => {
                  if (!o) setAllocDept(null);
                }}
              >
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Atendentes — {allocDept?.name}</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-muted-foreground">
                    Marque quem atende este departamento. As mudanças são salvas na hora.
                  </p>
                  <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                    {orgUsersQuery.isLoading ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
                    ) : orgUsersList.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">Nenhum usuário na empresa ainda.</p>
                    ) : (
                      orgUsersList.map((u) => {
                        const isMember = deptMemberSet.has(u.user_id);
                        return (
                          <button
                            key={u.user_id}
                            type="button"
                            onClick={() => toggleMember(u.user_id, isMember)}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                isMember ? "border-primary bg-primary text-primary-foreground" : "border-input"
                              }`}
                            >
                              {isMember && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{u.name}</span>
                              {u.email && (
                                <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                              )}
                            </span>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                              {ORG_ROLE_LABEL[u.role] ?? u.role}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => setAllocDept(null)}>
                      Fechar
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="respostas" className="mt-4 space-y-4">
              {/* Cards */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-2xl font-semibold text-foreground">{quickRepliesList.length}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Respostas rápidas</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-2xl font-semibold text-foreground">{activeQuickReplies}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Ativas</p>
                </div>
              </div>

              {/* Search + New */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={qrSearch}
                    onChange={(e) => setQrSearch(e.target.value)}
                    placeholder="Buscar respostas rápidas…"
                    className="pl-9"
                  />
                </div>
                <Button onClick={openNewQuickReply} size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Nova Resposta
                </Button>
              </div>

              {/* List */}
              <div className="rounded-lg border border-border bg-card">
                {filteredQuickReplies.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    {qrSearch.trim() ? "Nenhuma resposta encontrada." : "Nenhuma resposta rápida criada ainda."}
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredQuickReplies.map((q) => (
                      <li key={q.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{q.title?.trim() || q.shortcut}</span>
                            <span className="text-xs text-muted-foreground">/{q.shortcut}</span>
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">{q.content}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleQuickReply(q)}
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              q.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {q.active ? "Ativa" : "Inativa"}
                          </button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditQuickReply(q)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteQuickReply(q)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Quick reply Modal (create / edit) */}
              <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingQr ? "Editar resposta rápida" : "Nova resposta rápida"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="qr-shortcut">Atalho</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">/</span>
                        <Input
                          id="qr-shortcut"
                          value={qrShortcut}
                          onChange={(e) => setQrShortcut(e.target.value)}
                          placeholder="saudacao"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sem espaços. No campo de mensagem você usa digitando /
                        {qrShortcut
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, "") || "atalho"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qr-title">Título (opcional)</Label>
                      <Input
                        id="qr-title"
                        value={qrTitle}
                        onChange={(e) => setQrTitle(e.target.value)}
                        placeholder="Ex.: Saudação inicial"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qr-content">Mensagem</Label>
                      <textarea
                        id="qr-content"
                        value={qrContent}
                        onChange={(e) => setQrContent(e.target.value)}
                        placeholder="Texto que será inserido na conversa…"
                        className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    {qrError && <p className="text-sm text-destructive">{qrError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setQrModalOpen(false)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={saveQuickReply} disabled={qrBusy}>
                        {qrBusy ? "Salvando…" : editingQr ? "Salvar" : "Criar"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="horarios" className="mt-4">
              <Placeholder message="Disponível junto com a automação." />
            </TabsContent>

            <TabsContent value="distribuicao" className="mt-4">
              <Placeholder message="Disponível na fase de múltiplos usuários." />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
