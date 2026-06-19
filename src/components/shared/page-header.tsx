import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";

// Cabeçalho-padrão de página (molde da tela de Contatos):
// título grande + subtítulo à esquerda, botões de ação à direita.
// Use em todas as páginas para manter o visual constante.
//
// Regra de mobile: este molde já inclui o botão do menu lateral (☰) ao lado
// do título, visível só no celular (<768px). A partir de 768px o menu já é
// coluna fixa, então o botão some. Assim, TODA página que usa o PageHeader
// ganha o cabeçalho mobile padronizado automaticamente — inclusive as novas.
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <SidebarTrigger className="mt-0.5 shrink-0 md:hidden" />
        <div className="min-w-0">
          {/* AZ1.4: título um pouco mais firme e compacto (font-bold + tracking-tight). */}
          <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
