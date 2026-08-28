export type UserRole = "administrador" | "cadastro" | "visualizacao";

export type Permission = "view" | "operate" | "create" | "edit" | "remove" | "manageUsers";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  active: boolean;
  lastAccess: string | null;
};

export const ROLE_LABEL: Record<UserRole, string> = {
  administrador: "Administrador",
  cadastro: "Cadastro",
  visualizacao: "Visualização",
};

export const ROLE_META: Array<{ id: UserRole; name: string; perms: string }> = [
  {
    id: "administrador",
    name: "Administrador",
    perms: "Tudo: visualizar, comandar geradores, cadastrar, editar e excluir usuários",
  },
  {
    id: "cadastro",
    name: "Cadastro",
    perms: "Visualizar e cadastrar/editar usuários. Sem comandos de gerador e sem exclusão",
  },
  {
    id: "visualizacao",
    name: "Visualização",
    perms: "Somente leitura. Sem cadastro e sem comandos",
  },
];

export const ROLE_PERMS: Record<UserRole, Record<Permission, boolean>> = {
  administrador: {
    view: true,
    operate: true,
    create: true,
    edit: true,
    remove: true,
    manageUsers: true,
  },
  cadastro: {
    view: true,
    operate: false,
    create: true,
    edit: true,
    remove: false,
    manageUsers: true,
  },
  visualizacao: {
    view: true,
    operate: false,
    create: false,
    edit: false,
    remove: false,
    manageUsers: false,
  },
};

export const USERS_KEY = "rc-auth-users";
export const SESSION_KEY = "rc-auth-session";

export const SEED_USERS: AppUser[] = [
  {
    id: "u-admin",
    name: "Administrador",
    email: "admin@admin.cm",
    password: "Admin@01",
    role: "administrador",
    active: true,
    lastAccess: null,
  },
];

export function canRole(role: UserRole, perm: Permission) {
  return ROLE_PERMS[role][perm];
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
