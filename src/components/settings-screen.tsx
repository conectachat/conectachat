import { useEffect, useMemo, useState } from "react";
import { Settings, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  TAG_PALETTE,
  ColorPicker,
  type Tag as TagType,
} from "@/components/contact-tags";

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

type QuickReply = {
  id: string;
  shortcut: string;
  title: string | null;
  content: string;
  active: boolean;
};


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
  const qc = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

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

  // Quick replies state
  const [qrSearch, setQrSearch] = useState("");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [editingQr, setEditingQr] = useState<QuickReply | null>(null);
  const [qrShortcut, setQrShortcut] = useState("");
  const [qrTitle, setQrTitle] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);


  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar perfil:", error);
          return;
        }
        setFullName(data?.full_name ?? "");
        setEmail(data?.email ?? user.email ?? "");
      });
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.id);
    if (error) {
      console.error("Erro ao salvar perfil:", error);
    }
    setSavingProfile(false);
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
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, color, contact_tags(count)")
        .order("name");
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
      const { error } = await supabase
        .from("tags")
        .update({ name: n, color: tagColor })
        .eq("id", editingTag.id);
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
    if (!confirm(`Excluir a tag "${t.name}"? Ela será removida de todos os contatos.`)) return;
    const { error } = await supabase.from("tags").delete().eq("id", t.id);
    if (error) {
      console.error("Erro ao excluir tag:", error);
      alert("Não foi possível excluir a tag.");
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
    if (!confirm(`Excluir o campo "${f.name}"?`)) return;
    const { error } = await supabase.from("custom_fields").delete().eq("id", f.id);
    if (error) {
      console.error("Erro ao excluir campo:", error);
      alert("Não foi possível excluir o campo.");
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
    const atalho = qrShortcut.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
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
    if (!confirm(`Excluir a resposta "/${q.shortcut}"?`)) return;
    const { error } = await supabase.from("quick_replies").delete().eq("id", q.id);
    if (error) {
      console.error("Erro ao excluir resposta rápida:", error);
      alert("Não foi possível excluir a resposta.");
      return;
    }
    invalidateQuickReplies();
  }
  async function toggleQuickReply(q: QuickReply) {
    const { error } = await supabase
      .from("quick_replies")
      .update({ active: !q.active })
      .eq("id", q.id);
    if (error) {
      console.error("Erro ao alterar status da resposta:", error);
      return;
    }
    invalidateQuickReplies();
  }



  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie as configurações do sistema
        </p>

        <Tabs defaultValue="geral" className="mt-6">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="campos">Campos</TabsTrigger>
            <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
            <TabsTrigger value="respostas">Respostas Rápidas</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
            <TabsTrigger value="distribuicao">Distribuição</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="mt-4 space-y-6">
            {/* Meu Perfil */}
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-foreground">Meu Perfil</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" value={email} readOnly disabled className="bg-muted/50" />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm">
                  {savingProfile ? "Salvando..." : "Salvar"}
                </Button>
              </div>
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
                <p
                  className={`mt-3 text-sm ${
                    passwordError ? "text-destructive" : "text-green-600"
                  }`}
                >
                  {passwordError ?? passwordSuccess}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  size="sm"
                >
                  {changingPassword ? "Alterando..." : "Alterar senha"}
                </Button>
              </div>
            </section>
          </TabsContent>

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
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="text-sm font-medium text-foreground">{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.contact_count} {t.contact_count === 1 ? "contato" : "contatos"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditTag(t)}
                        >
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTagModalOpen(false)}
                    >
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
                  <p className="mt-1 text-muted-foreground">
                    Crie campos como CPF, Empresa, Cargo, etc.
                  </p>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditField(f)}
                        >
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
                  <DialogTitle>
                    {editingField ? "Editar campo" : "Novo campo"}
                  </DialogTitle>
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
                    <Select
                      value={fieldType}
                      onValueChange={(v) => setFieldType(v as FieldType)}
                    >
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
                  {fieldError && (
                    <p className="text-sm text-destructive">{fieldError}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFieldModalOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveField}
                      disabled={fieldBusy || !fieldName.trim()}
                    >
                      {fieldBusy ? "Salvando…" : editingField ? "Salvar" : "Criar"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="departamentos" className="mt-4">
            <Placeholder message="Disponível na fase de múltiplos usuários." />
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
                          <span className="text-sm font-medium text-foreground">
                            {q.title?.trim() || q.shortcut}
                          </span>
                          <span className="text-xs text-muted-foreground">/{q.shortcut}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{q.content}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleQuickReply(q)}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            q.active
                              ? "bg-green-100 text-green-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {q.active ? "Ativa" : "Inativa"}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditQuickReply(q)}
                        >
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
                  <DialogTitle>
                    {editingQr ? "Editar resposta rápida" : "Nova resposta rápida"}
                  </DialogTitle>
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
                      {qrShortcut.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "atalho"}
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
        </Tabs>
      </div>
    </div>
  );
}
