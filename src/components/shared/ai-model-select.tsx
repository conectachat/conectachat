import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AI_MODELS, isKnownModel, type AiProviderId } from "@/lib/ai-models";

const CUSTOM = "__custom__";

// Seletor de modelo de IA reutilizável: mostra os modelos do provedor escolhido
// num dropdown e oferece a opção "Outro" para digitar um modelo novo à mão.
export function AiModelSelect({
  provider,
  value,
  onChange,
  placeholder = "Selecione o modelo",
}: {
  provider: string;
  value: string;
  onChange: (model: string) => void;
  placeholder?: string;
}) {
  const models = AI_MODELS[provider as AiProviderId] ?? [];
  const hasList = models.length > 0;

  const [custom, setCustom] = useState(
    () => value !== "" && hasList && !isKnownModel(provider, value),
  );

  // Ao trocar de provedor, recalcula se o valor atual é "personalizado".
  useEffect(() => {
    const list = AI_MODELS[provider as AiProviderId] ?? [];
    setCustom(value !== "" && list.length > 0 && !isKnownModel(provider, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // Provedor não selecionado / sem lista conhecida → campo livre.
  if (!hasList) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ex.: gpt-4o-mini"
      />
    );
  }

  const selectValue = custom ? CUSTOM : value;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
              {m.note ? ` — ${m.note}` : ""}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Outro (digitar manualmente)</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite o nome exato do modelo"
        />
      )}
    </div>
  );
}
