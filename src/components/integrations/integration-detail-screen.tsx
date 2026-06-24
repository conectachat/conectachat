import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { useCurrentUser } from "@/hooks/use-current-user";
import { findIntegration } from "@/components/integrations/integration-catalog";
import { AiCredentialsCard } from "@/components/integrations/ai-credentials-card";
import { CalendlyCard } from "@/components/integrations/calendly-card";

export function IntegrationDetailScreen({ slug }: { slug: string }) {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const item = findIntegration(slug);

  // Slug desconhecido — mensagem simples + voltar.
  if (!item) {
    return (
      <div className="h-full overflow-auto bg-gray-50 dark:bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/integracoes"
            className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Integrações
          </Link>
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Integração não encontrada.
          </div>
        </div>
      </div>
    );
  }

  const Icon = item.icon;

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/integracoes"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Integrações
        </Link>

        {/* Cabeçalho da integração */}
        <div className="flex items-start gap-4">
          <div className={`grid size-14 shrink-0 place-items-center rounded-2xl ${item.iconBg} ${item.iconColor}`}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">{item.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{item.blurb}</p>
          </div>
        </div>

        {/* Conteúdo específico de cada integração */}
        <div className="mt-6">
          {slug === "ai" ? (
            <AiCredentialsCard orgId={orgId} />
          ) : slug === "calendly" ? (
            <CalendlyCard orgId={orgId} />
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Esta integração estará disponível em breve.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
