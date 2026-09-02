import { createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/components/auth/AuthProvider";
import { Topbar } from "@/components/layout/Topbar";
import { GeneratorsBoard } from "@/components/generators/GeneratorsBoard";
import { MapScreen } from "@/components/scada/MapScreen";
import { screens } from "@/components/scada/registry";
import { findItem } from "@/data/nav";

export const Route = createFileRoute("/p/$slug")({
  component: SectionPage,
  head: ({ params }) => {
    const found = findItem(params.slug);
    const title = found ? `${found.item.label} | RC Geradores SCADA` : "RC Geradores SCADA";
    const description = found
      ? `${found.item.label} — módulo ${found.group.title.toLowerCase()} do sistema SCADA RC Geradores.`
      : "Sistema SCADA de monitoramento e operação de geradores.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
});

function SectionPage() {
  const { slug } = Route.useParams();
  const { can } = useAuth();
  const found = findItem(slug);
  const label = found?.item.label ?? "Módulo";
  const group = found?.group.title ?? "RC Geradores";
  const adminOnly = Boolean(found?.item.adminOnly || found?.group.adminOnly);

  if (adminOnly && !can("manageUsers")) {
    return (
      <>
        <Topbar breadcrumb={[group, label]} title={label} />
        <div className="p-6">
          <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            Acesso restrito a administradores.
          </div>
        </div>
      </>
    );
  }

  if (slug === "geradores") {
    return <GeneratorsBoard showKpis={false} />;
  }

  if (slug === "mapa") {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <Topbar breadcrumb={[group, label]} title={label} />
        <MapScreen />
      </div>
    );
  }

  const Screen = screens[slug];

  return (
    <>
      <Topbar breadcrumb={[group, label]} title={label} />
      {Screen ? (
        <Screen />
      ) : (
        <div className="p-6 text-sm text-muted-foreground">Módulo não encontrado.</div>
      )}
    </>
  );
}
