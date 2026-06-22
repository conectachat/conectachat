import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

import { NODE_CATALOG, type CatalogItem } from "./node-catalog";

type FlowSidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
};

function handleDragStart(event: React.DragEvent<HTMLDivElement>, item: CatalogItem) {
  event.dataTransfer.setData("application/reactflow", item.type);
  event.dataTransfer.effectAllowed = "move";
}

export function FlowSidebar({ collapsed, onToggleCollapse }: FlowSidebarProps) {
  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center rounded-xl border bg-background py-2 shadow-lg">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          aria-label="Expandir componentes"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 flex-col overflow-hidden rounded-xl border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Componentes
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          aria-label="Recolher componentes"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <Accordion
          type="multiple"
          defaultValue={NODE_CATALOG.map((c) => c.key)}
          className="w-full"
        >
          {NODE_CATALOG.map((cat) => (
            <AccordionItem key={cat.key} value={cat.key} className="border-b-0">
              <AccordionTrigger className="px-2 py-2 text-sm font-medium hover:no-underline">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.label}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <div className="flex flex-col gap-1">
                  {cat.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.type}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item)}
                        className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted active:cursor-grabbing"
                      >
                        <Icon className="h-4 w-4" style={{ color: cat.color }} />
                        <span>{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        Arraste os componentes para o canvas
      </div>
    </div>
  );
}
