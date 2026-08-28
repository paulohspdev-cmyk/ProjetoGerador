import { createFileRoute } from "@tanstack/react-router";

import { Topbar } from "@/components/layout/Topbar";
import { OverviewDashboard } from "@/components/scada/OverviewDashboard";

const title = "RC Geradores | SCADA de monitoramento de geradores";
const description =
  "Visão geral operacional do parque: carga total, alarmes, modems, comunicação, sites e saúde do sistema SCADA.";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Index() {
  return (
    <>
      <Topbar breadcrumb={["RC Geradores", "Dashboards"]} title="Visão Geral" />
      <OverviewDashboard />
    </>
  );
}
