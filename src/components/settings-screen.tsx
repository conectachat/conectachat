import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
  const { user } = useCurrentUser();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

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

          <TabsContent value="tags" className="mt-4">
            <Placeholder message="Em construção — chega no próximo passo." />
          </TabsContent>

          <TabsContent value="campos" className="mt-4">
            <Placeholder message="Em construção — chega no próximo passo." />
          </TabsContent>

          <TabsContent value="departamentos" className="mt-4">
            <Placeholder message="Disponível na fase de múltiplos usuários." />
          </TabsContent>

          <TabsContent value="respostas" className="mt-4">
            <Placeholder message="Em construção — chega no próximo passo." />
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
