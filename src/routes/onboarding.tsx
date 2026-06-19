import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Check, Building2, MapPin, Palette, PartyPopper } from "lucide-react";
import { maskCpf, maskCnpj, maskPhone, maskCep } from "@/lib/masks";

// Cor padrão da marca (verde ConectaChat).
const BRAND_GREEN = "#8FC549";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({ meta: [{ title: "Bem-vindo — ConectaChat" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { user: data.user };
  },
  component: OnboardingPage,
});

const STEPS = [
  { key: "empresa", label: "Empresa", icon: Building2 },
  { key: "endereco", label: "Endereço", icon: MapPin },
  { key: "identidade", label: "Identidade", icon: Palette },
  { key: "concluir", label: "Concluir", icon: PartyPopper },
] as const;

const SEGMENTOS = [
  "Varejo / E-commerce",
  "Alimentação",
  "Beleza e Estética",
  "Saúde",
  "Educação",
  "Serviços Profissionais",
  "Imobiliária",
  "Agência / Marketing",
  "Software / SaaS",
  "Indústria",
  "Construção",
  "Logística",
  "Outro",
];

const PORTES = ["Autônomo / MEI", "Pequena (até 9)", "Média (10-49)", "Grande (50+)"];

function OnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Empresa
  const [personType, setPersonType] = useState<"pf" | "pj">("pj");
  const [docNumber, setDocNumber] = useState("");
  const [legalName, setLegalName] = useState("");
  const [name, setName] = useState(""); // nome fantasia / nome do negócio (organizations.name)
  const [corporateEmail, setCorporateEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [segment, setSegment] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [website, setWebsite] = useState("");

  // Endereço
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  // Identidade
  const [brandColor, setBrandColor] = useState(BRAND_GREEN);
  const [logoUrl, setLogoUrl] = useState("");

  // Carrega a empresa atual (a mais recente do usuário) e pré-preenche.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) {
        navigate({ to: "/login", replace: true });
        return;
      }

      const { data: members } = await supabase
        .from("org_members")
        .select("org_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      const id = members?.[0]?.org_id;
      if (!id) {
        // Usuário sem empresa: deixa o app cuidar (tela "sem empresa").
        navigate({ to: "/inbox", replace: true });
        return;
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!active) return;

      if (org?.onboarding_completed) {
        navigate({ to: "/inbox", replace: true });
        return;
      }

      if (org) {
        setOrgId(org.id);
        if (org.person_type === "pf" || org.person_type === "pj") setPersonType(org.person_type);
        if (org.doc_number) setDocNumber(org.doc_number);
        if (org.legal_name) setLegalName(org.legal_name);
        setName(org.name ?? "");
        setCorporateEmail(org.corporate_email ?? u.user?.email ?? "");
        if (org.phone) setPhone(org.phone);
        if (org.segment) setSegment(org.segment);
        if (org.company_size) setCompanySize(org.company_size);
        if (org.website) setWebsite(org.website);
        if (org.address_zip) setZip(org.address_zip);
        if (org.address_street) setStreet(org.address_street);
        if (org.address_number) setNumber(org.address_number);
        if (org.address_complement) setComplement(org.address_complement);
        if (org.address_district) setDistrict(org.address_district);
        if (org.address_city) setCity(org.address_city);
        if (org.address_state) setState(org.address_state);
        if (org.brand_color) setBrandColor(org.brand_color);
        if (org.logo_url) setLogoUrl(org.logo_url);
        if (typeof org.onboarding_step === "number" && org.onboarding_step > 0) {
          setStep(Math.min(org.onboarding_step, STEPS.length - 1));
        }
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  // Salva o progresso parcial (sem mexer no name, que só é gravado ao concluir).
  async function persistPartial(nextStep: number) {
    if (!orgId) return;
    const patch = {
      person_type: personType,
      doc_number: docNumber || null,
      legal_name: legalName || null,
      corporate_email: corporateEmail || null,
      phone: phone || null,
      segment: segment || null,
      company_size: companySize || null,
      website: website || null,
      address_zip: zip || null,
      address_street: street || null,
      address_number: number || null,
      address_complement: complement || null,
      address_district: district || null,
      address_city: city || null,
      address_state: state || null,
      address_country: "BR",
      brand_color: brandColor,
      logo_url: logoUrl || null,
      onboarding_step: nextStep,
    };
    const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
    if (error) throw error;
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!name.trim()) return "Informe o nome da empresa.";
      if (!docNumber.trim()) return personType === "pj" ? "Informe o CNPJ." : "Informe o CPF.";
      if (!phone.trim()) return "Informe o telefone.";
      if (!segment) return "Selecione o segmento.";
      if (!companySize) return "Selecione o porte.";
    }
    if (step === 1) {
      if (!zip.trim() || !city.trim() || !state.trim()) return "Preencha CEP, cidade e estado.";
    }
    return null;
  }

  async function next() {
    const err = validateStep();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      await persistPartial(step + 1);
      setStep(Math.min(step + 1, STEPS.length - 1));
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  async function finalizar() {
    if (!orgId) return;
    setSaving(true);
    try {
      await persistPartial(STEPS.length - 1);
      const finalName = name.trim();
      const { error } = await supabase
        .from("organizations")
        .update({
          onboarding_completed: true,
          ...(finalName ? { name: finalName } : {}),
        })
        .eq("id", orgId);
      if (error) throw error;
      toast.success("Tudo pronto! Bem-vindo ao ConectaChat.");
      navigate({ to: "/inbox", replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao concluir.");
    } finally {
      setSaving(false);
    }
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo variant="horizontal" className="h-9 w-auto" />
          <Button variant="ghost" size="sm" onClick={sair}>
            Sair
          </Button>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Vamos configurar seu ConectaChat</h1>
          <p className="text-sm text-muted-foreground">
            Leva uns 3 minutos. Você pode voltar e ajustar depois nas Configurações.
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex items-center gap-1 overflow-x-auto pb-2 md:gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.key} className="flex shrink-0 items-center gap-1.5 md:gap-2">
                <div
                  className={`grid size-8 place-items-center rounded-full text-xs font-bold transition ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </div>
                <div
                  className={`hidden text-xs sm:block md:text-sm ${
                    active ? "font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </div>
                {i < STEPS.length - 1 && <div className="h-px w-4 bg-border md:w-8" />}
              </div>
            );
          })}
        </div>

        <Card className="space-y-4 p-6">
          {step === 0 && (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPersonType("pj")}
                  className={`flex-1 rounded-lg border-2 p-3 text-sm font-semibold transition ${
                    personType === "pj" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  Pessoa Jurídica (CNPJ)
                </button>
                <button
                  type="button"
                  onClick={() => setPersonType("pf")}
                  className={`flex-1 rounded-lg border-2 p-3 text-sm font-semibold transition ${
                    personType === "pf" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  Pessoa Física (CPF)
                </button>
              </div>

              <Row label={personType === "pj" ? "CNPJ" : "CPF"}>
                <Input
                  value={docNumber}
                  onChange={(e) =>
                    setDocNumber(personType === "pj" ? maskCnpj(e.target.value) : maskCpf(e.target.value))
                  }
                  placeholder={personType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                  inputMode="numeric"
                />
              </Row>

              {personType === "pj" && (
                <Row label="Razão social">
                  <Input
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="Ex: Padaria do João LTDA"
                  />
                </Row>
              )}

              <Row label={personType === "pj" ? "Nome fantasia" : "Nome do negócio"}>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Padaria do João" />
              </Row>

              <div className="grid gap-3 sm:grid-cols-2">
                <Row label="E-mail corporativo">
                  <Input
                    type="email"
                    value={corporateEmail}
                    onChange={(e) => setCorporateEmail(e.target.value)}
                  />
                </Row>
                <Row label="Telefone">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                  />
                </Row>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Row label="Segmento">
                  <Select value={segment} onValueChange={setSegment}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha…" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEGMENTOS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
                <Row label="Porte">
                  <Select value={companySize} onValueChange={setCompanySize}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PORTES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
              </div>

              <Row label="Site (opcional)">
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
              </Row>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Row label="CEP">
                  <Input
                    value={zip}
                    onChange={(e) => setZip(maskCep(e.target.value))}
                    placeholder="00000-000"
                    inputMode="numeric"
                  />
                </Row>
                <div className="sm:col-span-2">
                  <Row label="Rua">
                    <Input value={street} onChange={(e) => setStreet(e.target.value)} />
                  </Row>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Row label="Número">
                  <Input value={number} onChange={(e) => setNumber(e.target.value)} />
                </Row>
                <Row label="Complemento">
                  <Input
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Sala, andar…"
                  />
                </Row>
                <Row label="Bairro">
                  <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
                </Row>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Row label="Cidade">
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </Row>
                </div>
                <Row label="Estado (UF)">
                  <Input
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="SP"
                  />
                </Row>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Row label="Cor primária da marca">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-14 rounded border"
                  />
                  <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
                </div>
              </Row>
              <Row label="Logo (URL — opcional)">
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…/logo.png"
                />
              </Row>
              <p className="text-xs text-muted-foreground">
                Você pode trocar isso depois nas Configurações.
              </p>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10">
                <PartyPopper className="size-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Tudo certo, {name || "bem-vindo"}!</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Sua conta está pronta. Conclua para entrar no app e, em seguida, conecte seu WhatsApp em{" "}
                <span className="font-medium text-foreground">Conexões</span>.
              </p>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                Lembrete: a conexão do WhatsApp via QR é não-oficial — use um número que você possa
                substituir se necessário.
              </p>
            </div>
          )}

          <div className="mt-2 flex justify-between border-t border-border pt-4">
            <Button variant="ghost" onClick={back} disabled={step === 0 || saving}>
              Voltar
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null} Avançar
              </Button>
            ) : (
              <Button onClick={finalizar} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null} Ir para o app
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
