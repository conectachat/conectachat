import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Pencil } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { maskCpf, maskCnpj, maskPhone, maskCep } from "@/lib/masks";

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

function ViewRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function CompanyDetailsCard({ orgId }: { orgId: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [personType, setPersonType] = useState<"pf" | "pj">("pj");
  const [docNumber, setDocNumber] = useState("");
  const [legalName, setLegalName] = useState("");
  const [corporateEmail, setCorporateEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [segment, setSegment] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [website, setWebsite] = useState("");

  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const [brandColor, setBrandColor] = useState("#8FC549");
  const [logoUrl, setLogoUrl] = useState("");

  function fill(d: any) {
    if (d.person_type === "pf" || d.person_type === "pj") setPersonType(d.person_type);
    setDocNumber(d.doc_number ?? "");
    setLegalName(d.legal_name ?? "");
    setCorporateEmail(d.corporate_email ?? "");
    setPhone(d.phone ?? "");
    setSegment(d.segment ?? "");
    setCompanySize(d.company_size ?? "");
    setWebsite(d.website ?? "");
    setZip(d.address_zip ?? "");
    setStreet(d.address_street ?? "");
    setNumber(d.address_number ?? "");
    setComplement(d.address_complement ?? "");
    setDistrict(d.address_district ?? "");
    setCity(d.address_city ?? "");
    setState(d.address_state ?? "");
    setBrandColor(d.brand_color ?? "#8FC549");
    setLogoUrl(d.logo_url ?? "");
  }

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    supabase
      .from("organizations")
      .select(
        "person_type, doc_number, legal_name, corporate_email, phone, segment, company_size, website, address_zip, address_street, address_number, address_complement, address_district, address_city, address_state, brand_color, logo_url",
      )
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Erro ao carregar dados da empresa:", error);
        } else if (data) {
          fill(data);
        }
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  async function save() {
    if (!orgId) return;
    setSaving(true);
    const patch = {
      person_type: personType,
      doc_number: docNumber.trim() || null,
      legal_name: legalName.trim() || null,
      corporate_email: corporateEmail.trim() || null,
      phone: phone.trim() || null,
      segment: segment || null,
      company_size: companySize || null,
      website: website.trim() || null,
      address_zip: zip.trim() || null,
      address_street: street.trim() || null,
      address_number: number.trim() || null,
      address_complement: complement.trim() || null,
      address_district: district.trim() || null,
      address_city: city.trim() || null,
      address_state: state.trim() || null,
      address_country: "BR",
      brand_color: brandColor,
      logo_url: logoUrl.trim() || null,
    };
    const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
    setSaving(false);
    if (error) {
      console.error("Erro ao salvar dados da empresa:", error);
      toast.error("Não foi possível salvar os dados da empresa.");
      return;
    }
    toast.success("Dados da empresa salvos!");
    setEditing(false);
  }

  const enderecoResumo = [street, number].filter(Boolean).join(", ");
  const enderecoLinha2 = [district, city, state].filter(Boolean).join(" · ");

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Dados cadastrais e endereço
        </h2>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={!loaded}>
            <Pencil className="mr-1 h-4 w-4" /> Editar
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Informações preenchidas no cadastro inicial. Visível apenas para o dono e administradores.
      </p>

      {!loaded ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : !editing ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ViewRow label="Tipo" value={personType === "pj" ? "Pessoa Jurídica" : "Pessoa Física"} />
          <ViewRow label={personType === "pj" ? "CNPJ" : "CPF"} value={docNumber} />
          {personType === "pj" && <ViewRow label="Razão social" value={legalName} />}
          <ViewRow label="E-mail corporativo" value={corporateEmail} />
          <ViewRow label="Telefone" value={phone} />
          <ViewRow label="Segmento" value={segment} />
          <ViewRow label="Porte" value={companySize} />
          <ViewRow label="Site" value={website} />
          <ViewRow label="Endereço" value={enderecoResumo || null} />
          <ViewRow label="Complemento" value={complement} />
          <ViewRow label="Bairro / Cidade / UF" value={enderecoLinha2 || null} />
          <ViewRow label="CEP" value={zip} />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Cor da marca</p>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 rounded border"
                style={{ backgroundColor: brandColor }}
              />
              <span className="text-sm text-foreground">{brandColor}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPersonType("pj")}
              className={`flex-1 rounded-lg border-2 p-2.5 text-sm font-semibold transition ${
                personType === "pj" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              Pessoa Jurídica (CNPJ)
            </button>
            <button
              type="button"
              onClick={() => setPersonType("pf")}
              className={`flex-1 rounded-lg border-2 p-2.5 text-sm font-semibold transition ${
                personType === "pf" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              Pessoa Física (CPF)
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={personType === "pj" ? "CNPJ" : "CPF"}>
              <Input
                value={docNumber}
                onChange={(e) =>
                  setDocNumber(personType === "pj" ? maskCnpj(e.target.value) : maskCpf(e.target.value))
                }
                placeholder={personType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                inputMode="numeric"
              />
            </Field>
            {personType === "pj" && (
              <Field label="Razão social">
                <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="E-mail corporativo">
              <Input type="email" value={corporateEmail} onChange={(e) => setCorporateEmail(e.target.value)} />
            </Field>
            <Field label="Telefone">
              <Input
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Segmento">
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
            </Field>
            <Field label="Porte">
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
            </Field>
          </div>

          <Field label="Site (opcional)">
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Endereço</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="CEP">
                <Input
                  value={zip}
                  onChange={(e) => setZip(maskCep(e.target.value))}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Rua">
                  <Input value={street} onChange={(e) => setStreet(e.target.value)} />
                </Field>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Número">
                <Input value={number} onChange={(e) => setNumber(e.target.value)} />
              </Field>
              <Field label="Complemento">
                <Input value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Sala, andar…" />
              </Field>
              <Field label="Bairro">
                <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Cidade">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
              </div>
              <Field label="Estado (UF)">
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                />
              </Field>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Identidade visual</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cor primária da marca">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-14 rounded border"
                  />
                  <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
                </div>
              </Field>
              <Field label="Logo (URL — opcional)">
                <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                if (orgId) {
                  supabase
                    .from("organizations")
                    .select(
                      "person_type, doc_number, legal_name, corporate_email, phone, segment, company_size, website, address_zip, address_street, address_number, address_complement, address_district, address_city, address_state, brand_color, logo_url",
                    )
                    .eq("id", orgId)
                    .maybeSingle()
                    .then(({ data }) => {
                      if (data) fill(data);
                    });
                }
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
