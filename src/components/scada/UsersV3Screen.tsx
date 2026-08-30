import { type FormEvent, useMemo, useState } from "react";
import { UserCog, Users } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABEL, type AppUser, type UserRole } from "@/lib/auth";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

const roles: UserRole[] = ["administrador", "cadastro", "visualizacao"];

export function UsersV3Screen() {
  const { user, users, createUser, updateUser, removeUser } = useAuth();
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

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Users, label: "Usuários", value: users.length },
          {
            icon: UserCog,
            label: "Ativos",
            value: users.filter((item) => item.active).length,
            tone: "text-online",
          },
          { icon: UserCog, label: "Administradores ativos", value: activeAdmins },
        ]}
      />
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        E-mail é identidade de login e não é alterado nesta tela. Nome, perfil, senha e estado podem
        ser atualizados. O backend impede excluir a própria conta e impede remover/rebaixar o último
        administrador ativo.
      </p>
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md border border-online/30 bg-online/10 p-3 text-sm text-online">
          {message}
        </p>
      )}

      <Panel title={editing ? `Editar usuário · ${editing.email}` : "Novo usuário"}>
        <form onSubmit={save} className="grid gap-2 md:grid-cols-4">
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <input
            required={!editing}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={Boolean(editing)}
            placeholder="E-mail"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:bg-secondary"
          />
          <input
            required={!editing}
            minLength={editing && !password ? undefined : 8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={editing ? "Nova senha (vazio = manter)" : "Senha (mín. 8)"}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {roles.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABEL[item]}
              </option>
            ))}
          </select>
          <div className="flex gap-1 md:col-span-4">
            <button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">
              {editing ? "Salvar alterações" : "Criar usuário"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={reset}
                className="h-9 rounded-md border border-border px-3 text-xs"
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
              render: (r) => (
                <span>
                  <b>{r.name}</b>
                  <span className="block text-[10px] text-muted-foreground">{r.email}</span>
                </span>
              ),
            },
            {
              label: "Perfil",
              render: (r) => (
                <Pill tone={r.role === "administrador" ? "info" : "muted"}>
                  {ROLE_LABEL[r.role]}
                </Pill>
              ),
            },
            {
              label: "Estado",
              render: (r) => (
                <Pill tone={r.active ? "ok" : "muted"}>{r.active ? "Ativo" : "Inativo"}</Pill>
              ),
            },
            { label: "Último acesso", render: (r) => r.lastAccess || "—" },
            {
              label: "Ações",
              render: (r) => (
                <span className="flex flex-wrap gap-1">
                  <ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn>
                  <ActionBtn
                    disabled={
                      r.id === user?.id ||
                      (r.role === "administrador" && r.active && activeAdmins <= 1)
                    }
                    onClick={() => void toggle(r)}
                  >
                    {r.active ? "Desativar" : "Ativar"}
                  </ActionBtn>
                  <ActionBtn
                    tone="danger"
                    disabled={
                      r.id === user?.id ||
                      (r.role === "administrador" && r.active && activeAdmins <= 1)
                    }
                    onClick={() => void remove(r)}
                  >
                    Excluir
                  </ActionBtn>
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
