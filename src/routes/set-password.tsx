import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/logo";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/set-password")({
  head: () => ({
    meta: [{ title: "Definir senha — ConectaChat" }],
  }),
  ssr: false,
  component: SetPasswordPage,
});

// Esta tela recebe quem clica no link do e-mail de convite (ou de "esqueci a
// senha"). O link traz a sessão na própria URL; o cliente Supabase a detecta
// sozinho. Aqui a pessoa escolhe a senha e entra.
function SetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    // A sessão pode chegar um instante depois (o link é processado na hora).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setStatus("ready");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus("ready");
    });

    // Se em alguns segundos não veio sessão nenhuma, o link é inválido/expirou.
    const t = setTimeout(() => {
      if (active) setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível definir a senha", { description: error.message });
      return;
    }
    toast.success("Senha definida! Bem-vindo(a) ao ConectaChat.");
    navigate({ to: "/inbox", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm border-border/60 shadow-sm">
        <CardHeader className="space-y-3 text-center">
          <Logo variant="vertical" className="h-20 w-auto mx-auto" />
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold tracking-tight">Defina sua senha</CardTitle>
            <CardDescription>Crie uma senha para acessar o ConectaChat.</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {status === "checking" && (
            <p className="py-4 text-center text-sm text-muted-foreground">Validando o link…</p>
          )}

          {status === "invalid" && (
            <div className="space-y-3 py-2 text-center">
              <p className="text-sm text-muted-foreground">
                Este link é inválido ou expirou. Peça um novo convite ou tente recuperar a senha pela tela de
                entrada.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Ir para o login</Link>
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ao menos 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar senha</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Salvando…" : "Definir senha e entrar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
