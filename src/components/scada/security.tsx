import { ScrollText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_META } from "@/lib/auth";
import { rcApi, type AuditItem } from "@/lib/api";
import { Panel, ScadaTable, ScreenBody, Stats } from "./kit";

function NoAccess() {
  return (
    <ScreenBody>
      <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Seu perfil não possui permissão para este módulo.
      </div>
    </ScreenBody>
  );
}

export function RolesScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: ShieldCheck, label: "Perfis", value: ROLE_META.length }]} />
      <Panel title="Perfis e permissões">
        <ScadaTable
          rows={ROLE_META}
          columns={[
            { label: "Perfil", render: (row) => <b>{row.name}</b> },
            { label: "Permissões", render: (row) => row.perms },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

function formatAuditDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString("pt-BR", { hour12: false });
}

export function AuditScreen() {
  const { can } = useAuth();
  const [rows, setRows] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!can("manageUsers")) return;
    let mounted = true;
    void rcApi.audit
      .list(300)
      .then((items) => {
        if (mounted) setRows(items);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Falha ao carregar auditoria.");
      });
    return () => {
      mounted = false;
    };
  }, [can]);

  if (!can("manageUsers")) return <NoAccess />;

  return (
    <ScreenBody>
      <Stats items={[{ icon: ScrollText, label: "Eventos de auditoria", value: rows.length }]} />
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 px-3 py-2 text-[12px] text-offline">
          {error}
        </p>
      )}
      <Panel title="Auditoria real do sistema">
        <ScadaTable
          rows={rows}
          columns={[
            {
              label: "Quando",
              render: (row) => <span className="num">{formatAuditDate(row.created_at)}</span>,
            },
            { label: "Usuário", render: (row) => row.actor },
            { label: "Ação", render: (row) => row.action },
            { label: "Tipo", render: (row) => row.entity_type },
            { label: "Alvo", render: (row) => <b>{row.entity_id}</b> },
            { label: "Detalhe", render: (row) => row.detail || "—" },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
