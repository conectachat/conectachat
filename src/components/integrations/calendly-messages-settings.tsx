/* eslint-disable @typescript-eslint/no-explicit-any */
// =====================================================================
//  Configuração das mensagens automáticas do Calendly (C4).
//  Por empresa: ligar/desligar confirmação e lembrete, definir quanto
//  tempo antes, e editar os textos (com chips de variáveis). Salva em
//  calendly_message_settings (RLS ALL is_member_of). Acesso via
//  (supabase as any) — tabela nova fora do types.ts (CLAUDE.md §8).
// =====================================================================
import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const sb = supabase as any;

const DEFAULTS = {
  confirmation_enabled: true,
  confirmation_offset_minutes: 1440,
  confirmation_template:
    "Olá {{primeiro_nome}}! Confirmando sua {{tipo_evento}} em {{data_reuniao}} às {{hora_reuniao}}. Para remarcar: {{link_remarcar}}",
  reminder_enabled: true,
  reminder_offset_minutes: 120,
  reminder_template:
    "Oi {{primeiro_nome}}, passando para lembrar da sua {{tipo_evento}} hoje às {{hora_reuniao}}. Link de acesso: {{link_reuniao}}",
};

const OFFSETS = [
  { label: "10 minutos antes", value: 10 },
  { label: "30 minutos antes", value: 30 },
  { label: "1 hora antes", value: 60 },
  { label: "2 horas antes", value: 120 },
  { label: "3 horas antes", value: 180 },
  { label: "6 horas antes", value: 360 },
  { label: "12 horas antes", value: 720 },
  { label: "1 dia antes", value: 1440 },
  { label: "2 dias antes", value: 2880 },
];

const VARS = [
  { token: "primeiro_nome", label: "Primeiro nome" },
  { token: "nome", label: "Nome" },
  { token: "tipo_evento", label: "Tipo de evento" },
  { token: "data_reuniao", label: "Data" },
  { token: "hora_reuniao", label: "Hora" },
  { token: "link_reuniao", label: "Link da reunião" },
  { token: "link_remarcar", label: "Link remarcar" },
  { token: "link_cancelar", label: "Link cancelar" },
];

function offsetOptions(current: number) {
  if (OFFSETS.some((o) => o.value === current)) return OFFSETS;
  return [...OFFSETS, { label: `${current} minutos antes`, value: current }].sort((a, b) => a.value - b.value);
}

export function CalendlyMessagesSettings({ orgId }: { orgId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confEnabled, setConfEnabled] = useState(DEFAULTS.confirmation_enabled);
  const [confOffset, setConfOffset] = useState(DEFAULTS.confirmation_offset_minutes);
  const [confTpl, setConfTpl] = useState(DEFAULTS.confirmation_template);
  const [remEnabled, setRemEnabled] = useState(DEFAULTS.reminder_enabled);
  const [remOffset, setRemOffset] = useState(DEFAULTS.reminder_offset_minutes);
  const [remTpl, setRemTpl] = useState(DEFAULTS.reminder_template);

  const confRef = useRef<HTMLTextAreaElement | null>(null);
  const remRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    sb.from("calendly_message_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setConfEnabled(data.confirmation_enabled);
          setConfOffset(data.confirmation_offset_minutes);
          setConfTpl(data.confirmation_template);
          setRemEnabled(data.reminder_enabled);
          setRemOffset(data.reminder_offset_minutes);
          setRemTpl(data.reminder_template);
        }
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  function insertVar(
    ref: React.RefObject<HTMLTextAreaElement | null>,
    token: string,
    value: string,
    setValue: (v: string) => void,
  ) {
    const el = ref.current;
    const tok = `{{${token}}}`;
    if (!el) {
      setValue(value + tok);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tok + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + tok.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function salvar() {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await sb.from("calendly_message_settings").upsert(
        {
          org_id: orgId,
          confirmation_enabled: confEnabled,
          confirmation_offset_minutes: confOffset,
          confirmation_template: confTpl,
          reminder_enabled: remEnabled,
          reminder_offset_minutes: remOffset,
          reminder_template: remTpl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
      if (error) {
        toast.error("Não foi possível salvar", { description: error.message });
        return;
      }
      toast.success("Configuração salva.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mt-4 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">Carregando…</div>;
  }

  const chips = (ref: React.RefObject<HTMLTextAreaElement | null>, value: string, setValue: (v: string) => void) => (
    <div className="mt-2 flex flex-wrap gap-1">
      {VARS.map((v) => (
        <button
          key={v.token}
          type="button"
          onClick={() => insertVar(ref, v.token, value, setValue)}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-green/10 text-brand-green">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Mensagens automáticas pelo WhatsApp</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Dispare confirmação e lembrete automaticamente quando um agendamento é marcado. As variáveis são
            trocadas pelos dados reais no envio.
          </p>

          {/* Confirmação */}
          <div className="mt-4 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Confirmação</Label>
              <Switch checked={confEnabled} onCheckedChange={setConfEnabled} />
            </div>
            {confEnabled && (
              <div className="mt-3 space-y-2">
                <Select value={String(confOffset)} onValueChange={(v) => setConfOffset(Number(v))}>
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {offsetOptions(confOffset).map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <textarea
                  ref={confRef}
                  value={confTpl}
                  onChange={(e) => setConfTpl(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-sm focus:border-brand-green focus:outline-none"
                />
                {chips(confRef, confTpl, setConfTpl)}
              </div>
            )}
          </div>

          {/* Lembrete */}
          <div className="mt-4 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Lembrete</Label>
              <Switch checked={remEnabled} onCheckedChange={setRemEnabled} />
            </div>
            {remEnabled && (
              <div className="mt-3 space-y-2">
                <Select value={String(remOffset)} onValueChange={(v) => setRemOffset(Number(v))}>
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {offsetOptions(remOffset).map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <textarea
                  ref={remRef}
                  value={remTpl}
                  onChange={(e) => setRemTpl(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-sm focus:border-brand-green focus:outline-none"
                />
                {chips(remRef, remTpl, setRemTpl)}
              </div>
            )}
          </div>

          {/* Aviso sobre lembretes nativos do Calendly */}
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            O Calendly também envia lembretes próprios (e-mail/SMS). Se não quiser que o contato receba em
            duplicidade, desligue os lembretes nativos no painel do Calendly e use só os daqui (WhatsApp).
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={salvar} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
