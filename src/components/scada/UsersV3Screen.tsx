import { type FormEvent, useMemo, useState } from "react";
import { ShieldCheck, UserCog, Users } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABEL, ROLE_META, type AppUser, type UserRole } from "@/lib/auth";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

const roles: UserRole[] = ["administrador", "cadastro", "visualizacao"];

export function UsersV3Screen() {
  const { can, user, users, createUser, updateUser, removeUser } = useAuth();
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("visualizacao");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const activeAdmins = useMemo(
    () => users.filter((item) => item.active && item.role === "administrador").length,
    [users],
  );
  const selectedRole = ROLE_META.find((item) => item.id === role);

  const reset = () => {
    setEditing(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("visualizacao");
    setError("");
  };

  const beginEdit = (item: AppUser) => {
    setEditing(item);
    setName(item.name);
    setEmail(item.email);
    setPassword("");
    setRole(item.role);
    setError("");
    setMessage("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (editing) {
      const patch: { name: string; role: UserRole; password?: string } = {
        name: name.trim(),
        role,
      };
      if (password) patch.password = password;
      const result = await updateUser(editing.id, patch);
      if (result) {
        setError(result);
        return;
      }
      setMessage("Usuário atualizado.");
      reset();
      return;
    }
    const result = await createUser({ name: name.trim(), email: email.trim(), password, role });
    if (result) {
      setError(result);
      return;
    }
    setMessage("Usuário criado.");
    reset();
  };

  const toggle = async (item: AppUser) => {
    setError("");
    setMessage("");
    const result = await updateUser(item.id, { active: !item.active });
    if (result) setError(result);
    else setMessage(item.active ? "Usuário desativado." : "Usuário ativado.");
  };

  const remove = async (item: AppUser) => {
    if (!window.confirm(`Excluir o usuário ${item.name}?`)) return;
    setError("");
    setMessage("");
    const result = await removeUser(item.id);
    if (result) setError(result);
    else setMessage("Usuário excluído.");
  };

  if (!can("manageUsers")) {
    return (
      <ScreenBody>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Seu perfil não possui permissão para gerenciar usuários.
        </div>
      </ScreenBody>
    );
  }

  return (
    <ScreenBody>
      <div>
        <h2 className="text-lg font-extrabold">Usuários</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cadastre pessoas, defina o perfil de acesso e mantenha contas ativas ou inativas.
        </p>
      </div>

      <Stats
        items={[
          { icon: Users, label: "Usuários", value: users.length },
          {
            icon: UserCog,
            label: "Ativos",
            value: users.filter((item) => item.active).length,
            tone: "text-online",
          },
          { icon: ShieldCheck, label: "Gestores do sistema", value: activeAdmins },
        ]}
      />

      {error && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl border border-online/30 bg-online/10 p-3 text-sm text-online">
          {message}
        </p>
      )}

      <Panel title={editing ? `Editar ${editing.name}` : "Novo usuário"}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold">
              Nome
              <input
                required
                minLength={2}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="text-sm font-semibold">
              Identificador de acesso
              <input
                required={!editing}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={Boolean(editing)}
                placeholder="usuario@empresa.com"
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:bg-secondary"
              />
            </label>
            <label className="text-sm font-semibold">
              {editing ? "Nova senha" : "Senha"}
              <input
                required={!editing}
                minLength={editing && !password ? undefined : 8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={editing ? "Deixe vazio para manter" : "Mínimo de 8 caracteres"}
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="text-sm font-semibold">
              Perfil
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {ROLE_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedRole && (
            <p className="rounded-lg border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
              <b className="text-foreground">{selectedRole.name}:</b> {selectedRole.perms}
            </p>
          )}

          <div className="flex gap-2">
            <button className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">
              {editing ? "Salvar alterações" : "Criar usuário"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={reset}
                className="h-10 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel title="Usuários cadastrados">
        <ScadaTable
          rows={users}
          min="900px"
          columns={[
            {
              label: "Usuário",
              render: (row) => (
                <span>
                  <b>{row.name}</b>
                  <span className="block text-xs text-muted-foreground">{row.email}</span>
                </span>
              ),
            },
            {
              label: "Perfil",
              render: (row) => (
                <Pill tone={row.role === "administrador" ? "info" : "muted"}>
                  {ROLE_LABEL[row.role]}
                </Pill>
              ),
            },
            {
              label: "Estado",
              render: (row) => (
                <Pill tone={row.active ? "ok" : "muted"}>{row.active ? "Ativo" : "Inativo"}</Pill>
              ),
            },
            { label: "Último acesso", render: (row) => row.lastAccess || "—" },
            {
              label: "Ações",
              render: (row) => {
                const protectedAccount =
                  row.id === user?.id ||
                  (row.role === "administrador" && row.active && activeAdmins <= 1);
                return (
                  <span className="flex flex-wrap gap-1">
                    <ActionBtn onClick={() => beginEdit(row)}>Editar</ActionBtn>
                    <ActionBtn disabled={protectedAccount} onClick={() => void toggle(row)}>
                      {row.active ? "Desativar" : "Ativar"}
                    </ActionBtn>
                    <ActionBtn
                      tone="danger"
                      disabled={protectedAccount}
                      onClick={() => void remove(row)}
                    >
                      Excluir
                    </ActionBtn>
                  </span>
                );
              },
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
