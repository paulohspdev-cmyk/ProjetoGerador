import { Link } from "@tanstack/react-router";
import { Check, Minus, ScrollText, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABEL, ROLE_PERMS, type Permission, type UserRole } from "@/lib/auth";
import { rcApi, type AuditItem } from "@/lib/api";
import { Panel, ScadaTable, ScreenBody, Stats } from "./kit";

function NoAccess() {
  return (
    <ScreenBody>
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Seu perfil não possui permissão para este módulo.
      </div>
    </ScreenBody>
  );
}

const roles: UserRole[] = ["administrador", "cadastro", "visualizacao"];
const permissionLabels: Array<{ id: Permission; label: string }> = [
  { id: "view", label: "Visualizar" },
  { id: "operate", label: "Operar START/STOP" },
  { id: "create", label: "Cadastrar" },
  { id: "edit", label: "Editar" },
  { id: "remove", label: "Excluir" },
  { id: "manageUsers", label: "Gerenciar usuários" },
];

export function RolesScreen() {
  const { users } = useAuth();

  return (
    <ScreenBody>
      <div>
        <h2 className="text-lg font-extrabold">Perfis e permissões</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Veja exatamente o que cada perfil pode fazer no sistema.
        </p>
      </div>

      <Stats
        items={[
          { icon: ShieldCheck, label: "Perfis", value: roles.length },
          {
            icon: Users,
            label: "Usuários ativos",
            value: users.filter((item) => item.active).length,
          },
        ]}
      />

      <Panel
        title="Permissões"
        actions={
          <Link
            to="/p/$slug"
            params={{ slug: "usuarios" }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Gerenciar usuários
          </Link>
        }
      >
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-3 text-left">Perfil</th>
                <th className="px-3 py-3 text-center">Pessoas</th>
                {permissionLabels.map((permission) => (
                  <th key={permission.id} className="px-3 py-3 text-center">
                    {permission.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-3 font-bold">{ROLE_LABEL[role]}</td>
                  <td className="num px-3 py-3 text-center">
                    {users.filter((item) => item.active && item.role === role).length}
                  </td>
                  {permissionLabels.map((permission) => {
                    const allowed = ROLE_PERMS[role][permission.id];
                    return (
                      <td key={permission.id} className="px-3 py-3 text-center">
                        {allowed ? (
                          <Check className="mx-auto size-4 text-online" aria-label="Permitido" />
                        ) : (
                          <Minus
                            className="mx-auto size-4 text-muted-foreground"
                            aria-label="Não permitido"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          O perfil é atribuído individualmente na tela Usuários. Funções industriais não liberadas
          pelo produto continuam indisponíveis mesmo para administrador.
        </p>
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
        <p className="rounded-xl border border-offline/40 bg-offline/10 px-3 py-2 text-sm text-offline">
          {error}
        </p>
      )}
      <Panel title="Auditoria">
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
