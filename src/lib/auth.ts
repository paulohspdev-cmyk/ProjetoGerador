export type UserRole = "administrador" | "cadastro" | "visualizacao";

export type Permission = "view" | "operate" | "create" | "edit" | "remove" | "manageUsers";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  lastAccess: string | null;
};

export const ROLE_LABEL: Record<UserRole, string> = {
  administrador: "Gestor do sistema",
  cadastro: "Cadastro",
  visualizacao: "Visualização",
};

export const ROLE_META: Array<{ id: UserRole; name: string; perms: string }> = [
  {
    id: "administrador",
    name: "Gestor do sistema",
    perms:
      "Acesso total: visualização, cadastro, usuários, auditoria e START/STOP autorizados. Demais comandos industriais permanecem indisponíveis",
  },
  {
    id: "cadastro",
    name: "Cadastro",
    perms:
      "Visualizar e cadastrar/editar equipamentos. Sem comandos industriais e sem gestão de usuários",
  },
  {
    id: "visualizacao",
    name: "Visualização",
    perms: "Somente leitura. Sem alterações e sem comandos industriais",
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
    manageUsers: false,
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

export function canRole(role: UserRole, perm: Permission) {
  return ROLE_PERMS[role]?.[perm] ?? false;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
