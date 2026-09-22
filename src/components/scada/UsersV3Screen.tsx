import { type FormEvent, useMemo, useState } from "react";
import { Copy, ShieldCheck, UserCog, Users } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi } from "@/lib/api";
import { ROLE_LABEL, ROLE_META, type AppUser, type UserRole } from "@/lib/auth";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

const roles: UserRole[] = ["administrador", "operador", "cadastro", "visualizacao"];

export function UsersV3Screen() {
  const {
    can,
    user,
    users,
    usersError,
    refreshUsers,
    refreshCurrentUser,
    createUser,
    updateUser,
    removeUser,
  } = useAuth();
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("visualizacao");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [twoFaMessage, setTwoFaMessage] = useState("");
  const [twoFaError, setTwoFaError] = useState("");
  const visibleError = error || usersError || "";

  const startTwoFaSetup = async () => {
    if (twoFaBusy) return;
    setTwoFaBusy(true);
    setTwoFaError("");
    setTwoFaMessage("");
    try {
      const setup = await rcApi.auth.setup2fa();
      setTwoFaSetup(setup);
      setTwoFaCode("");
      setTwoFaMessage("Segredo gerado. Adicione-o ao autenticador e confirme o código de 6 dígitos.");
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : "Falha ao iniciar configuração 2FA.");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const enableTwoFa = async () => {
    if (twoFaBusy || !twoFaSetup) return;
    if (!/^\d{6}$/.test(twoFaCode)) {
      setTwoFaError("Informe o código TOTP de 6 dígitos.");
      return;
    }
    setTwoFaBusy(true);
    setTwoFaError("");
    setTwoFaMessage("");
    try {
      await rcApi.auth.enable2fa(twoFaCode);
      await refreshCurrentUser();
      try {
        await refreshUsers();
      } catch {
        // A ativação do fator já foi concluída; a tela de usuários expõe o erro
        // administrativo separadamente caso a listagem ainda falhe.
      }
      setTwoFaSetup(null);
      setTwoFaCode("");
      setTwoFaMessage("2FA ativado. Ações privilegiadas foram liberadas para esta conta.");
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : "Falha ao ativar 2FA.");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const disableTwoFa = async () => {
    if (twoFaBusy) return;
    if (!/^\d{6}$/.test(twoFaCode) || !twoFaPassword) {
      setTwoFaError("Informe a senha atual e o código TOTP de 6 dígitos.");
      return;
    }
    setTwoFaBusy(true);
    setTwoFaError("");
    setTwoFaMessage("");
    try {
      await rcApi.auth.disable2fa(twoFaCode, twoFaPassword);
      await refreshCurrentUser();
      setTwoFaCode("");
      setTwoFaPassword("");
      setTwoFaMessage(
        "2FA desativado. Em produção, ações privilegiadas permanecerão bloqueadas até reativá-lo.",
      );
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : "Falha ao desativar 2FA.");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const copyTwoFaSecret = async () => {
    if (!twoFaSetup?.secret) return;
    try {
      await navigator.clipboard.writeText(twoFaSetup.secret);
      setTwoFaMessage("Segredo copiado.");
      setTwoFaError("");
    } catch {
      setTwoFaError("Não foi possível copiar automaticamente. Selecione o segredo manualmente.");
    }
  };

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
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
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
    } finally {
      setBusy(false);
    }
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

      <Panel title="Segurança da sua conta">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone={user?.twoFactorEnabled ? "online" : "warning"}>
              {user?.twoFactorEnabled ? "2FA ativo" : "2FA obrigatório pendente"}
            </Pill>
            <p className="text-sm text-muted-foreground">
              Em produção, gestores e operadores precisam de TOTP ativo para ações privilegiadas.
            </p>
          </div>

          {twoFaError && (
            <p className="rounded-lg border border-offline/40 bg-offline/10 px-3 py-2 text-sm text-offline">
              {twoFaError}
            </p>
          )}
          {twoFaMessage && (
            <p className="rounded-lg border border-online/30 bg-online/10 px-3 py-2 text-sm text-online">
              {twoFaMessage}
            </p>
          )}

          {!user?.twoFactorEnabled && !twoFaSetup && (
            <ActionBtn disabled={twoFaBusy} onClick={() => void startTwoFaSetup()}>
              <ShieldCheck className="mr-1 inline size-3" />
              Configurar 2FA
            </ActionBtn>
          )}

          {!user?.twoFactorEnabled && twoFaSetup && (
            <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-sm font-semibold">1. Adicione esta chave ao seu autenticador TOTP</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded-md bg-background px-3 py-2 text-xs">
                  {twoFaSetup.secret}
                </code>
                <ActionBtn onClick={() => void copyTwoFaSecret()}>
                  <Copy className="mr-1 inline size-3" />
                  Copiar chave
                </ActionBtn>
                <a
                  href={twoFaSetup.otpauthUri}
                  className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"
                >
                  Abrir no autenticador
                </a>
              </div>
              <p className="text-sm font-semibold">2. Confirme o código de 6 dígitos</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={twoFaCode}
                  onChange={(event) =>
                    setTwoFaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className="h-10 w-36 rounded-lg border border-input bg-background px-3 text-sm"
                />
                <ActionBtn disabled={twoFaBusy || twoFaCode.length !== 6} onClick={() => void enableTwoFa()}>
                  Ativar 2FA
                </ActionBtn>
                <ActionBtn
                  disabled={twoFaBusy}
                  onClick={() => {
                    setTwoFaSetup(null);
                    setTwoFaCode("");
                    setTwoFaError("");
                    setTwoFaMessage("");
                  }}
                >
                  Cancelar
                </ActionBtn>
              </div>
            </div>
          )}

          {user?.twoFactorEnabled && (
            <details className="rounded-xl border border-border bg-secondary/20 p-4">
              <summary className="cursor-pointer text-sm font-semibold">Desativar ou trocar 2FA</summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Desativar 2FA volta a bloquear ações privilegiadas em produção. Use somente para
                troca controlada do autenticador.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={twoFaPassword}
                  onChange={(event) => setTwoFaPassword(event.target.value)}
                  placeholder="Senha atual"
                  className="h-10 min-w-52 rounded-lg border border-input bg-background px-3 text-sm"
                />
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={twoFaCode}
                  onChange={(event) =>
                    setTwoFaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="Código 2FA"
                  className="h-10 w-36 rounded-lg border border-input bg-background px-3 text-sm"
                />
                <ActionBtn
                  disabled={twoFaBusy || !twoFaPassword || twoFaCode.length !== 6}
                  onClick={() => void disableTwoFa()}
                >
                  Desativar 2FA
                </ActionBtn>
              </div>
            </details>
          )}
        </div>
      </Panel>

      {visibleError && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {visibleError}
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
                autoComplete="name"
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
                autoComplete="email"
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
                autoComplete="new-password"
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
            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Salvando…" : editing ? "Salvar alterações" : "Criar usuário"}
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
                <Pill
                  tone={
                    row.role === "administrador"
                      ? "info"
                      : row.role === "operador"
                        ? "warn"
                        : "muted"
                  }
                >
                  {ROLE_LABEL[row.role]}
                </Pill>
              ),
            },
            {
              label: "2FA",
              render: (row) => (
                <Pill
                  tone={
                    row.twoFactorEnabled
                      ? "ok"
                      : row.role === "administrador" || row.role === "operador"
                        ? "warn"
                        : "muted"
                  }
                >
                  {row.twoFactorEnabled ? "ATIVO" : "NÃO CONFIGURADO"}
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
