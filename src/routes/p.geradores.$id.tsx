import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Topbar } from "@/components/layout/Topbar";
import { GeneratorDetailScreen } from "@/components/generators/GeneratorDetailScreen";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { displayGenName } from "@/data/generators";

export const Route = createFileRoute("/p/geradores/$id")({
  component: GeneratorPage,
  head: () => ({
    meta: [
      { title: "Gerador | RC Geradores" },
      { name: "description", content: "Painel completo do grupo gerador" },
    ],
  }),
});

function GeneratorPage() {
  const { id } = Route.useParams();
  const { getById, ready, error } = useGenerators();
  const gen = getById(id);

  if (!ready) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando gerador...</div>;
  }

  if (!gen && error) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-bold">Backend indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!gen) throw notFound();
  const name = displayGenName(gen.tag);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar
        back={
          <Link
            to="/p/$slug"
            params={{ slug: "geradores" }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
        }
      />
      <div className="flex h-full min-h-0 flex-1 overflow-hidden p-1" aria-label={name}>
        <GeneratorDetailScreen gen={gen} />
      </div>
    </div>
  );
}
