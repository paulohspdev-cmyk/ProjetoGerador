import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  SEED_USERS,
  SESSION_KEY,
  USERS_KEY,
  canRole,
  normalizeEmail,
  type AppUser,
  type Permission,
  type UserRole,
} from "@/lib/auth";

type AuthContextValue = {
  ready: boolean;
  user: AppUser | null;
  users: AppUser[];
  login: (email: string, password: string) => string | null;
  logout: () => void;
  can: (perm: Permission) => boolean;
  createUser: (input: { name: string; email: string; password: string; role: UserRole }) => string | null;
  updateUser: (id: string, patch: Partial<Pick<AppUser, "name" | "role" | "active" | "password">>) => string | null;
  removeUser: (id: string) => string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadUsers(): AppUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return SEED_USERS.map((u) => ({ ...u }));
    const parsed = JSON.parse(raw) as AppUser[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED_USERS.map((u) => ({ ...u }));
    const hasAdmin = parsed.some((u) => normalizeEmail(u.email) === "admin@admin.cm");
    return hasAdmin ? parsed : [...SEED_USERS.map((u) => ({ ...u })), ...parsed];
  } catch {
    return SEED_USERS.map((u) => ({ ...u }));
  }
}

function persistUsers(users: AppUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function nowStamp() {
  return new Date().toLocaleString("pt-BR", { hour12: false });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const list = loadUsers();
      persistUsers(list);
      setUsers(list);
      const session = localStorage.getItem(SESSION_KEY);
      if (session && list.some((u) => u.id === session && u.active)) setUserId(session);
    } catch {
      setUsers(SEED_USERS.map((u) => ({ ...u })));
    } finally {
      setReady(true);
    }
  }, []);

  const user = useMemo(() => users.find((u) => u.id === userId) ?? null, [users, userId]);

  const login = useCallback((email: string, password: string) => {
    const mail = normalizeEmail(email);
    if (!mail || !password) return "Informe e-mail e senha.";
    const found = users.find((u) => normalizeEmail(u.email) === mail);
    if (!found || found.password !== password) return "E-mail ou senha inválidos.";
    if (!found.active) return "Usuário desativado. Contate o administrador.";
    const next = users.map((u) => (u.id === found.id ? { ...u, lastAccess: nowStamp() } : u));
    setUsers(next);
    persistUsers(next);
    localStorage.setItem(SESSION_KEY, found.id);
    setUserId(found.id);
    return null;
  }, [users]);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUserId(null);
  }, []);

  const can = useCallback(
    (perm: Permission) => (user ? canRole(user.role, perm) : false),
    [user],
  );

  const createUser = useCallback(
    (input: { name: string; email: string; password: string; role: UserRole }) => {
      if (!user || !canRole(user.role, "create") || !canRole(user.role, "manageUsers")) {
        return "Sem permissão para cadastrar usuários.";
      }
      const name = input.name.trim();
      const email = normalizeEmail(input.email);
      const password = input.password;
      if (!name || !email || !password) return "Preencha nome, e-mail e senha.";
      if (!email.includes("@")) return "E-mail inválido.";
      if (password.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
      if (users.some((u) => normalizeEmail(u.email) === email)) return "Já existe um usuário com este e-mail.";
      const next: AppUser[] = [
        ...users,
        {
          id: `u-${Date.now()}`,
          name,
          email,
          password,
          role: input.role,
          active: true,
          lastAccess: null,
        },
      ];
      setUsers(next);
      persistUsers(next);
      return null;
    },
    [user, users],
  );

  const updateUser = useCallback(
    (id: string, patch: Partial<Pick<AppUser, "name" | "role" | "active" | "password">>) => {
      if (!user || !canRole(user.role, "edit") || !canRole(user.role, "manageUsers")) {
        return "Sem permissão para editar usuários.";
      }
      const target = users.find((u) => u.id === id);
      if (!target) return "Usuário não encontrado.";
      const admins = users.filter((u) => u.role === "administrador" && u.active);
      if (target.role === "administrador" && admins.length <= 1) {
        if (patch.active === false || (patch.role && patch.role !== "administrador")) {
          return "Não é possível desativar ou rebaixar o último administrador.";
        }
      }
      const next = users.map((u) => (u.id === id ? { ...u, ...patch } : u));
      setUsers(next);
      persistUsers(next);
      return null;
    },
    [user, users],
  );

  const removeUser = useCallback(
    (id: string) => {
      if (!user || !canRole(user.role, "remove") || !canRole(user.role, "manageUsers")) {
        return "Sem permissão para excluir usuários.";
      }
      if (id === user.id) return "Você não pode excluir o próprio usuário.";
      const target = users.find((u) => u.id === id);
      if (!target) return "Usuário não encontrado.";
      const admins = users.filter((u) => u.role === "administrador" && u.active);
      if (target.role === "administrador" && admins.length <= 1) {
        return "Não é possível excluir o último administrador.";
      }
      const next = users.filter((u) => u.id !== id);
      setUsers(next);
      persistUsers(next);
      return null;
    },
    [user, users],
  );

  const value = useMemo(
    () => ({ ready, user, users, login, logout, can, createUser, updateUser, removeUser }),
    [ready, user, users, login, logout, can, createUser, updateUser, removeUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
