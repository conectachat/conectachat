import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/shared/logo";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

// IMPORTANTE: nunca derivar de window.location.origin — o Supabase precisa da
// URL literal de produção, e ela tem que estar na allowlist de Redirect URLs.
const APP_URL = "https://app.conectachat.online";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta — ConectaChat" },
      { name: "description", content: "Crie sua conta no ConectaChat e comece a atender no WhatsApp." },
    ],
  }),
  ssr: false,
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Já logado? Vai direto pro app.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inbox", replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) return toast.error("Informe seu nome.");
    if (!orgName.trim()) return toast.error("Informe o nome da empresa.");
    if (password.length < 6) return toast.error("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return toast.error("As senhas não conferem.");

    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: APP_URL,
        data: {
          create_org: true, // etiqueta que faz o banco criar a empresa nova
          full_name: fullName.trim(),
          org_name: orgName.trim(),
        },
      },
    });
    setSubmitting(false);

    if (error) {
      toast.error("Não foi possível criar a conta", {
        description:
          error.message === "User already registered"
            ? "Este e-mail já tem conta. Tente entrar."
            : error.message,
      });
      return;
    }

    // Supabase devolve um usuário "vazio" (sem identities) quando o e-mail já existe,
    // para não revelar quem é cadastrado. Tratamos como já cadastrado.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      toast.error("Este e-mail já tem conta. Tente entrar.");
      return;
    }

    // Se a confirmação de e-mail estiver ligada (nosso caso), não vem sessão:
    // mostramos a tela "verifique seu e-mail". Se vier sessão, vai pro app.
    if (data.session) {
      navigate({ to: "/inbox", replace: true });
      return;
    }
    setSentTo(email.trim());
  };

  // Estado de sucesso: e-mail de confirmação enviado.
  if (sentTo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-sm border-border/60 shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
              <MailCheck className="size-7 text-primary" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold tracking-tight">Confirme seu e-mail</CardTitle>
              <CardDescription>
                Enviamos um link de confirmação para <span className="font-medium text-foreground">{sentTo}</span>.
                Abra o e-mail e clique no link para ativar sua conta.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Não chegou? Verifique a caixa de spam. O link abre direto em {APP_URL}.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Voltar para o login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-sm border-border/60 shadow-sm">
        <CardHeader className="space-y-3 text-center">
          <Logo variant="vertical" className="h-20 w-auto mx-auto" />
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold tracking-tight">Criar conta</CardTitle>
            <CardDescription>Comece grátis a atender no WhatsApp</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Seu nome</Label>
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                placeholder="Maria Silva"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgName">Nome da empresa</Label>
              <Input
                id="orgName"
                type="text"
                autoComplete="organization"
                placeholder="Padaria da Maria"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Criando conta..." : "Criar conta grátis"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
