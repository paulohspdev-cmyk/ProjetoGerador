export type UserRole = "administrador" | "operador" | "cadastro" | "visualizacao";

export type Permission = "view" | "operate" | "create" | "edit" | "remove" | "manageUsers";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  lastAccess: string | null;
  twoFactorEnabled: boolean;
};

export const ROLE_LABEL: Record<UserRole, string> = {
  administrador: "Gestor do sistema",
  operador: "Operador",
  cadastro: "Cadastro",
  visualizacao: "Visualização",
};

export const ROLE_META: Array<{ id: UserRole; name: string; perms: string }> = [
  {
    id: "administrador",
    name: "Gestor do sistema",
    perms:
      "Acesso administrativo completo. Ações privilegiadas exigem 2FA; comandos industriais continuam limitados às capacidades homologadas da controladora.",
  },
  {
    id: "operador",
    name: "Operador",
    perms:
      "Visualização, reconhecimento operacional e comandos industriais homologados. Não gerencia usuários, cadastros, comunicação ou infraestrutura. Ações de comando exigem 2FA.",
  },
  {
    id: "cadastro",
    name: "Cadastro",
    perms:
      "Visualizar e cadastrar/editar equipamentos. Sem comandos industriais e sem gestão de usuários.",
  },
  {
    id: "visualizacao",
    name: "Visualização",
    perms: "Somente leitura. Sem alterações e sem comandos industriais.",
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
  operador: {
    view: true,
    operate: true,
    create: false,
    edit: false,
    remove: false,
    manageUsers: false,
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
