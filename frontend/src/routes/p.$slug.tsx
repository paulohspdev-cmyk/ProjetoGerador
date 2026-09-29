import { createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/features/auth/AuthProvider";
import { Topbar } from "@/layout/Topbar";
import { GeneratorsBoard } from "@/features/generators/GeneratorsBoard";
import { MapScreen } from "@/features/scada/MapScreen";
import { PagePurpose } from "@/features/scada/communication-guide";
import { screens } from "@/features/scada/registry";
import { findItem } from "@/data/nav";

export const Route = createFileRoute("/p/$slug")({
  component: SectionPage,
  head: ({ params }) => {
    const found = findItem(params.slug);
    const title = found ? `${found.item.label} | RC Geradores` : "RC Geradores";
    const description = found
      ? `${found.item.label} — módulo ${found.group.title.toLowerCase()} do sistema RC Geradores.`
      : "Sistema profissional de monitoramento e operação de geradores.";
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
            Seu perfil não possui acesso a este módulo.
          </div>
        </div>
      </>
    );
  }

  if (slug === "geradores") {
    return <GeneratorsBoard showKpis={false} />;
  }

  const purpose =
    found?.item.purpose && found.item.purposeRole
      ? { role: found.item.purposeRole, text: found.item.purpose }
      : null;

  if (slug === "mapa") {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <Topbar breadcrumb={[group, label]} title={label} />
        {purpose && (
          <div className="shrink-0 px-3 pt-3 sm:px-4">
            <PagePurpose role={purpose.role} text={purpose.text} />
          </div>
        )}
        <MapScreen />
      </div>
    );
  }

  const Screen = screens[slug];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar breadcrumb={[group, label]} title={label} />
      {purpose && (
        <div className="shrink-0 px-3 pt-3 sm:px-4 lg:px-4 2xl:px-5">
          <PagePurpose role={purpose.role} text={purpose.text} />
        </div>
      )}
      {Screen ? (
        <Screen />
      ) : (
        <div className="p-6 text-sm text-muted-foreground">Módulo não encontrado.</div>
      )}
    </div>
  );
}
