import { createFileRoute } from "@tanstack/react-router";
import { CatalogScreen } from "@/components/catalog/catalog-screen";

export const Route = createFileRoute("/_authenticated/catalogo/")({
  head: () => ({
    meta: [
      { title: "Catálogo — ConectaChat" },
      { name: "description", content: "Produtos e serviços da empresa." },
    ],
  }),
  component: CatalogoPage,
});

function CatalogoPage() {
  return (
    <div className="h-full">
      <CatalogScreen />
    </div>
  );
}
