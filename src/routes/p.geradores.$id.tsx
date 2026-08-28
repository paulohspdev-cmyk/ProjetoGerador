import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Topbar } from "@/components/layout/Topbar";
import { GeneratorDetailScreen } from "@/components/generators/GeneratorDetailScreen";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { displayGenName, getGenerator } from "@/data/generators";

export const Route = createFileRoute("/p/geradores/$id")({
  component: GeneratorPage,
  head: ({ params }) => {
    const gen = getGenerator(params.id);
    const name = gen ? displayGenName(gen.tag) : "Gerador";
    const title = `${name} | RC Geradores SCADA`;
    return {
      meta: [{ title }, { name: "description", content: `Painel completo de ${name}` }],
    };
  },
});

function GeneratorPage() {
  const { id } = Route.useParams();
  const { getById } = useGenerators();
  const gen = getById(id) ?? getGenerator(id);
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
      <div className="flex h-full min-h-0 flex-1 overflow-hidden p-1">
        <GeneratorDetailScreen gen={gen} />
      </div>
    </div>
  );
}
