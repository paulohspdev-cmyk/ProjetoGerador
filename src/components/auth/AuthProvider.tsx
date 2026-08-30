import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, rcApi } from "@/lib/api";
import { canRole, type AppUser, type Permission, type UserRole } from "@/lib/auth";

type UserPatch = Partial<Pick<AppUser, "name" | "role" | "active">> & { password?: string };

type AuthContextValue = {
  ready: boolean;
  user: AppUser | null;
  users: AppUser[];
  sessionError: string | null;
  usersError: string | null;
  login: (email: string, password: string, otp?: string) => Promise<string | null>;
  logout: () => Promise<void>;
  can: (perm: Permission) => boolean;
  refreshUsers: () => Promise<void>;
  createUser: (input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }) => Promise<string | null>;
  updateUser: (id: string, patch: UserPatch) => Promise<string | null>;
  removeUser: (id: string) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  const refreshUsers = useCallback(async () => {
    try {
      const list = await rcApi.users.list();
      setUsers(list);
      setUsersError(null);
    } catch (error) {
      setUsersError(errorMessage(error, "Falha ao carregar usuários."));
      throw error;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const current = await rcApi.auth.me();
        if (!mounted) return;
        setUser(current);
        setSessionError(null);
        if (canRole(current.role, "manageUsers")) {
          try {
            const list = await rcApi.users.list();
            if (mounted) {
              setUsers(list);
              setUsersError(null);
            }
          } catch (error) {
            if (mounted) {
              setUsersError(errorMessage(error, "Falha ao carregar usuários."));
            }
          }
        } else {
          setUsers([]);
          setUsersError(null);
        }
      } catch (error) {
        if (!mounted) return;
        setUser(null);
        setUsers([]);
        setUsersError(null);
        if (error instanceof ApiError && error.status === 401) {
          setSessionError(null);
        } else {
          setSessionError(errorMessage(error, "Falha ao verificar a sessão no backend."));
        }
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, otp?: string) => {
    if (!email.trim() || !password) return "Informe e-mail e senha.";

    let current: AppUser;
    try {
      current = await rcApi.auth.login(email.trim(), password, otp?.trim() || undefined);
    } catch (error) {
      return errorMessage(error, "Não foi possível entrar no sistema.");
    }

    setUser(current);
    setSessionError(null);
    if (canRole(current.role, "manageUsers")) {
      try {
        const list = await rcApi.users.list();
        setUsers(list);
        setUsersError(null);
      } catch (error) {
        // A sessão já foi criada com sucesso. Uma falha administrativa posterior
        // não pode transformar autenticação válida em "falha de login".
        setUsers([]);
        setUsersError(errorMessage(error, "Login efetuado, mas a lista de usuários não carregou."));
      }
    } else {
      setUsers([]);
      setUsersError(null);
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    try {
      await rcApi.auth.logout();
    } catch {
      // O estado do frontend é limpo abaixo mesmo se o backend já estiver indisponível.
    }
    setUser(null);
    setUsers([]);
    setSessionError(null);
    setUsersError(null);
  }, []);

  const can = useCallback((perm: Permission) => (user ? canRole(user.role, perm) : false), [user]);

  const createUser = useCallback(
    async (input: { name: string; email: string; password: string; role: UserRole }) => {
      if (!user || !canRole(user.role, "manageUsers"))
        return "Sem permissão para cadastrar usuários.";
      try {
        await rcApi.users.create(input);
        await refreshUsers();
        return null;
      } catch (error) {
        return errorMessage(error, "Falha ao cadastrar usuário.");
      }
    },
    [refreshUsers, user],
  );

  const updateUser = useCallback(
    async (id: string, patch: UserPatch) => {
      if (!user || !canRole(user.role, "manageUsers")) return "Sem permissão para editar usuários.";
      try {
        const updated = await rcApi.users.update(id, patch);
        if (updated.id === user.id) setUser(updated);
        await refreshUsers();
        return null;
      } catch (error) {
        return errorMessage(error, "Falha ao editar usuário.");
      }
    },
    [refreshUsers, user],
  );

  const removeUser = useCallback(
    async (id: string) => {
      if (!user || !canRole(user.role, "manageUsers"))
        return "Sem permissão para excluir usuários.";
      try {
        await rcApi.users.remove(id);
        await refreshUsers();
        return null;
      } catch (error) {
        return errorMessage(error, "Falha ao excluir usuário.");
      }
    },
    [refreshUsers, user],
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      users,
      sessionError,
      usersError,
      login,
      logout,
      can,
      refreshUsers,
      createUser,
      updateUser,
      removeUser,
    }),
    [
      ready,
      user,
      users,
      sessionError,
      usersError,
      login,
      logout,
      can,
      refreshUsers,
      createUser,
      updateUser,
      removeUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
