import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Bot, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiModelSelect } from "@/components/shared/ai-model-select";
import { defaultModelFor } from "@/lib/ai-models";
import { useOrgDepartments } from "@/hooks/use-flow-resources";
import {
  useAiAgent,
  useOrgAiKeys,
  useOrgChannels,
  useSetAgentChannels,
  useToggleAiAgentActive,
  useUpdateAiAgent,
  type AgentActivationMode,
  type AiAgent,
  type AiProvider,
  type BusinessHours,
} from "@/hooks/use-ai-agents";

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI (GPT)",
  gemini: "Google Gemini",
  claude: "Anthropic Claude",
};

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const PERSONA_TEMPLATE = `Você é a Lia, atendente virtual da [Nome da Empresa] no WhatsApp.
Seu objetivo é entender o que o cliente precisa, tirar dúvidas e, quando fizer sentido, encaminhar para a equipe.

Como agir:
- Fale em português do Brasil, com tom próximo e educado. Mensagens curtas.
- Entenda a necessidade antes de oferecer algo (1 pergunta por vez).
- Use a base de conhecimento abaixo para responder. Se não souber, seja honesta e ofereça falar com um humano.
- NUNCA invente preço, prazo, política ou informação que não esteja na base de conhecimento.`;

function defaultBusinessHours(): BusinessHours {
  const bh: BusinessHours = {};
  for (const d of DAYS) {
    const isWeekday = d.key !== "sat" && d.key !== "sun";
    bh[d.key] = { enabled: isWeekday, start: "08:00", end: "18:00" };
  }
  return bh;
}

type FormState = {
  name: string;
  provider: AiProvider;
  model: string;
  greeting: string;
  persona: string;
  knowledge_base: string;
  activation_mode: AgentActivationMode;
  business_hours: BusinessHours;
  handoff_enabled: boolean;
  handoff_department_id: string | null;
  handoff_message: string;
  handoff_keywords: string;
};

function toForm(a: AiAgent): FormState {
  const bh = a.business_hours && Object.keys(a.business_hours).length > 0 ? a.business_hours : defaultBusinessHours();
  return {
    name: a.name,
    provider: a.provider,
    model: a.model ?? "",
    greeting: a.greeting ?? "",
    persona: a.persona ?? "",
    knowledge_base: a.knowledge_base ?? "",
    activation_mode: a.activation_mode,
    business_hours: bh,
    handoff_enabled: a.handoff_enabled,
    handoff_department_id: a.handoff_department_id,
    handoff_message: a.handoff_message ?? "",
    handoff_keywords: a.handoff_keywords ?? "",
  };
}

export function AgentEditor({ agentId }: { agentId: string }) {
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAiAgent(agentId);
  const { data: departments } = useOrgDepartments();
  const { data: channels } = useOrgChannels();
  const { data: configuredKeys } = useOrgAiKeys();

  const updateAgent = useUpdateAiAgent();
  const setAgentChannels = useSetAgentChannels();
  const toggleActive = useToggleAiAgentActive();

  const [form, setForm] = useState<FormState | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inicializa o formulário quando o agente carrega.
  useEffect(() => {
    if (agent) {
      setForm(toForm(agent));
      setIsActive(agent.is_active);
    }
  }, [agent]);

  // Marca os canais que já apontam para este agente.
  useEffect(() => {
    if (channels) {
      setSelectedChannels(channels.filter((c) => c.ai_agent_id === agentId).map((c) => c.id));
    }
  }, [channels, agentId]);

  const deptName = useMemo(() => {
    const map = new Map<string, string>();
    (departments ?? []).forEach((d) => map.set(d.id, d.name));
    return map;
  }, [departments]);

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  function setDay(key: string, day: Partial<{ enabled: boolean; start: string; end: string }>) {
    setForm((f) => {
      if (!f) return f;
      const current = f.business_hours[key] ?? { enabled: false, start: "08:00", end: "18:00" };
      return { ...f, business_hours: { ...f.business_hours, [key]: { ...current, ...day } } };
    });
  }

  function toggleChannel(id: string, checked: boolean) {
    setSelectedChannels((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((c) => c !== id)));
  }

  async function handleSave() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("Informe um nome para o agente.");
      return;
    }
    setSaving(true);
    try {
      await updateAgent.mutateAsync({
        id: agentId,
        patch: {
          name,
          provider: form.provider,
          model: form.model.trim(),
          greeting: form.greeting,
          persona: form.persona,
          knowledge_base: form.knowledge_base,
          activation_mode: form.activation_mode,
          business_hours: form.business_hours,
          handoff_enabled: form.handoff_enabled,
          handoff_department_id: form.handoff_department_id,
          handoff_message: form.handoff_message,
          handoff_keywords: form.handoff_keywords,
        },
      });
      await setAgentChannels.mutateAsync({ agentId, channelIds: selectedChannels });
      toast.success("Agente salvo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar o agente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(checked: boolean) {
    setIsActive(checked);
    try {
      await toggleActive.mutateAsync({ id: agentId, isActive: checked });
    } catch (err) {
      setIsActive(!checked);
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar o agente.");
    }
  }

  if (isLoading || !form) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const missingKey = configuredKeys ? !configuredKeys.has(form.provider) : false;

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/agentes" })} title="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-5 w-5 shrink-0 text-brand-blue" />
            <span className="truncate text-base font-semibold text-foreground">{form.name || "Agente"}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={handleToggleActive} disabled={toggleActive.isPending} />
            <span className="text-sm text-muted-foreground">Ativo</span>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#8FC549" }}
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Conteúdo rolável */}
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-y-auto p-6">
        {/* Identidade & IA */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identidade e modelo</CardTitle>
            <CardDescription>O nome do agente e qual inteligência artificial ele usa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do agente</Label>
              <Input id="name" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Provedor de IA</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => {
                    const provider = v as AiProvider;
                    patch({ provider, model: form.model.trim() ? form.model : defaultModelFor(provider) });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">{PROVIDER_LABEL.openai}</SelectItem>
                    <SelectItem value="gemini">{PROVIDER_LABEL.gemini}</SelectItem>
                    <SelectItem value="claude">{PROVIDER_LABEL.claude}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <AiModelSelect
                  provider={form.provider}
                  value={form.model}
                  onChange={(m) => patch({ model: m })}
                />
              </div>
            </div>

            {missingKey && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  A chave do provedor <strong>{PROVIDER_LABEL[form.provider]}</strong> ainda não foi cadastrada.
                  Cadastre em{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => navigate({ to: "/integracoes" })}
                  >
                    Integrações → Inteligência Artificial
                  </button>{" "}
                  para o agente funcionar.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="greeting">Mensagem de apresentação (opcional)</Label>
              <Textarea
                id="greeting"
                value={form.greeting}
                onChange={(e) => patch({ greeting: e.target.value })}
                placeholder="Ex.: Oi! Aqui é a Lia, da Duli. Como posso te ajudar hoje?"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Enviada quando o agente assume uma conversa nova. Deixe em branco para não enviar.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Personalidade */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personalidade (instruções)</CardTitle>
            <CardDescription>
              Quem é o agente, o tom de voz e como ele deve agir. É a parte mais importante.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={form.persona}
              onChange={(e) => patch({ persona: e.target.value })}
              placeholder="Descreva a personalidade e as regras do agente..."
              rows={10}
              className="font-mono text-sm"
            />
            {!form.persona.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => patch({ persona: PERSONA_TEMPLATE })}
              >
                Usar um exemplo pronto
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Base de conhecimento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Base de conhecimento</CardTitle>
            <CardDescription>
              Cole aqui as informações que o agente deve conhecer: sobre a empresa, produtos, preços, horários,
              perguntas frequentes, políticas. (Em breve será possível anexar documentos.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.knowledge_base}
              onChange={(e) => patch({ knowledge_base: e.target.value })}
              placeholder={"Ex.:\nHorário: seg a sex, 8h às 18h.\nEntrega: capital em 24h.\nFormas de pagamento: Pix, cartão.\nPergunta: vocês têm garantia? Resposta: sim, 90 dias."}
              rows={10}
            />
          </CardContent>
        </Card>

        {/* Comportamento / ativação */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quando o agente atende</CardTitle>
            <CardDescription>Defina em que situações o agente responde automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Ativação</Label>
              <Select
                value={form.activation_mode}
                onValueChange={(v) => {
                  const mode = v as AgentActivationMode;
                  const needHours = mode === "fora_do_horario";
                  patch({
                    activation_mode: mode,
                    business_hours:
                      needHours && Object.keys(form.business_hours).length === 0
                        ? defaultBusinessHours()
                        : form.business_hours,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sempre">Sempre (assume a conversa assim que chega)</SelectItem>
                  <SelectItem value="quando_ninguem_atende">
                    Quando ninguém atende (só se não houver atendente na conversa)
                  </SelectItem>
                  <SelectItem value="fora_do_horario">Fora do horário comercial</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Em qualquer modo, o agente se cala assim que um atendente humano assume a conversa.
              </p>
            </div>

            {form.activation_mode === "fora_do_horario" && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium text-foreground">Horário comercial</p>
                <p className="text-xs text-muted-foreground">
                  O agente atua <strong>fora</strong> destes horários. Fuso da empresa (configurado em
                  Configurações).
                </p>
                <div className="space-y-2 pt-1">
                  {DAYS.map((d) => {
                    const day = form.business_hours[d.key] ?? { enabled: false, start: "08:00", end: "18:00" };
                    return (
                      <div key={d.key} className="flex flex-wrap items-center gap-2">
                        <div className="flex w-28 items-center gap-2">
                          <Switch
                            checked={day.enabled}
                            onCheckedChange={(c) => setDay(d.key, { enabled: c })}
                          />
                          <span className="text-sm text-foreground">{d.label}</span>
                        </div>
                        <Input
                          type="time"
                          value={day.start}
                          disabled={!day.enabled}
                          onChange={(e) => setDay(d.key, { start: e.target.value })}
                          className="w-32"
                        />
                        <span className="text-sm text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={day.end}
                          disabled={!day.enabled}
                          onChange={(e) => setDay(d.key, { end: e.target.value })}
                          className="w-32"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Handoff */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Passar para um humano (handoff)</CardTitle>
            <CardDescription>O que acontece quando o cliente precisa falar com uma pessoa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.handoff_enabled}
                onCheckedChange={(c) => patch({ handoff_enabled: c })}
              />
              <span className="text-sm text-foreground">Permitir que o agente passe para um atendente humano</span>
            </div>

            {form.handoff_enabled && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Encaminhar para o departamento</Label>
                  <Select
                    value={form.handoff_department_id ?? "none"}
                    onValueChange={(v) => patch({ handoff_department_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Manter o departamento atual da conversa</SelectItem>
                      {(departments ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="handoff-message">Mensagem ao cliente ao transferir (opcional)</Label>
                  <Textarea
                    id="handoff-message"
                    value={form.handoff_message}
                    onChange={(e) => patch({ handoff_message: e.target.value })}
                    placeholder="Ex.: Vou chamar um atendente do nosso time pra te ajudar. Um momento, por favor."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="handoff-keywords">Palavras do cliente que pedem um humano (opcional)</Label>
                  <Input
                    id="handoff-keywords"
                    value={form.handoff_keywords}
                    onChange={(e) => patch({ handoff_keywords: e.target.value })}
                    placeholder="Ex.: atendente, falar com humano, pessoa"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separe por vírgula. Se o cliente usar uma dessas, o agente passa direto para o humano.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Onde atua */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Onde o agente atua</CardTitle>
            <CardDescription>
              Escolha em quais conexões (canais) este agente responde. Cada conexão tem no máximo um agente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!channels || channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma conexão cadastrada ainda. Crie uma em Conexões para alocar o agente.
              </p>
            ) : (
              <div className="space-y-2">
                {channels.map((c) => {
                  const checked = selectedChannels.includes(c.id);
                  const takenByOther = !!c.ai_agent_id && c.ai_agent_id !== agentId;
                  return (
                    <label
                      key={c.id}
                      className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleChannel(c.id, v === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.default_department_id
                            ? `Departamento padrão: ${deptName.get(c.default_department_id) ?? "—"}`
                            : "Sem departamento padrão"}
                          {takenByOther && " · já tem outro agente (será movido para este ao salvar)"}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
