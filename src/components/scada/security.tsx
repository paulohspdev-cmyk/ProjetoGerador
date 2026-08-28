import { ScrollText, ShieldCheck, UserCog } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABEL, ROLE_META, type UserRole } from "@/lib/auth";
import { rcApi, type AuditItem } from "@/lib/api";
import { Panel, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function NoAccess() {
  return (
    <ScreenBody>
      <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Seu perfil não possui permissão para este módulo.
      </div>
    </ScreenBody>
  );
}

export function UsersScreen() {
  const { users, can, createUser, updateUser, removeUser } = useAuth();
  const allowed = can("manageUsers");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("visualizacao");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!allowed) return <NoAccess />;

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const error = await createUser({ name, email, password, role });
    setBusy(false);
    if (error) {
      setSuccess(false);
      setMessage(error);
      return;
    }
    setSuccess(true);
    setMessage("Usuário cadastrado com sucesso.");
    setName("");
    setEmail("");
    setPassword("");
    setRole("visualizacao");
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: UserCog, label: "Usuários", value: users.length },
          { icon: ShieldCheck, label: "Ativos", value: users.filter((u) => u.active).length, tone: "text-online" },
        ]}
      />

      <Panel title="Cadastrar usuário">
        <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-[11px] font-semibold text-muted-foreground">
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Senha inicial
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Perfil
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="visualizacao">Visualização</option>
              <option value="cadastro">Cadastro</option>
              <option value="administrador">Administrador</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Salvando…" : "Cadastrar"}
            </button>
          </div>
        </form>
        {message && <p className={`mt-2 text-[12px] ${success ? "text-online" : "text-offline"}`}>{message}</p>}
      </Panel>

      <Panel title="Usuários">
        <ScadaTable
          rows={users}
          columns={[
            { label: "Nome", render: (row) => <b>{row.name}</b> },
            { label: "E-mail", render: (row) => <span className="num">{row.email}</span> },
            { label: "Perfil", render: (row) => ROLE_LABEL[row.role] },
            {
              label: "Status",
              render: (row) => <Tone tone={row.active ? "ok" : "muted"}>{row.active ? "Ativo" : "Inativo"}</Tone>,
            },
            { label: "Último acesso", render: (row) => row.lastAccess ?? "—" },
            {
              label: "Ações",
              render: (row) => (
                <span className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-secondary"
                    onClick={() => void updateUser(row.id, { active: !row.active })}
                  >
                    {row.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-offline/40 px-2 py-0.5 text-[11px] text-offline hover:bg-offline/10"
                    onClick={() => {
                      if (window.confirm(`Excluir o usuário ${row.email}?`)) void removeUser(row.id);
                    }}
                  >
                    Excluir
                  </button>
                </span>
              ),
            },
          ]}
        />
      </Panel>
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
      {error && <p className="rounded-md border border-offline/40 bg-offline/10 px-3 py-2 text-[12px] text-offline">{error}</p>}
      <Panel title="Auditoria real do sistema">
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Quando", render: (row) => <span className="num">{formatAuditDate(row.created_at)}</span> },
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
