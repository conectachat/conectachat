import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { INTEGRATIONS } from "@/components/integrations/integration-catalog";

export function MarketplaceScreen() {
  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Integrações"
          subtitle="Conecte o ConectaChat a outros aplicativos e serviços."
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((item) => {
            const Icon = item.icon;
            const isActive = item.status === "active";

            const card = (
              <div
                className={`group flex h-full flex-col rounded-lg border border-border bg-card p-5 transition-colors ${
                  isActive ? "hover:border-brand-green hover:shadow-sm" : "opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`grid size-11 place-items-center rounded-xl ${item.iconBg} ${item.iconColor}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  {isActive ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                      Disponível
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Em breve
                    </span>
                  )}
                </div>

                <h3 className="mt-3 text-sm font-semibold text-foreground">{item.name}</h3>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{item.blurb}</p>

                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {item.category}
                  </span>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue">
                      Configurar
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </div>
              </div>
            );

            // Só as integrações ativas são clicáveis (abrem a página de detalhe).
            return isActive ? (
              <Link key={item.slug} to="/integracoes/$slug" params={{ slug: item.slug }} className="block">
                {card}
              </Link>
            ) : (
              <div key={item.slug}>{card}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
