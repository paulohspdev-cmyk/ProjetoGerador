import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BatteryCharging,
  Bell,
  BellRing,
  Building2,
  CalendarClock,
  CalendarDays,
  Cpu,
  Database,
  Fan,
  FileText,
  Fuel,
  Gauge,
  GitMerge,
  HardDriveDownload,
  HeartPulse,
  Info,
  LayoutDashboard,
  Map,
  MapPin,
  Network,
  Power,
  Radio,
  RefreshCcw,
  Router,
  ScrollText,
  Settings,
  Settings2,
  ShieldCheck,
  Signal,
  Timer,
  UserCog,
  Users,
  UtilityPole,
  Wrench,
  Factory,
  ArrowUpNarrowWide,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  slug: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
};

/*
 * A navegação principal é orientada à tarefa do operador. Telas de engenharia,
 * biblioteca e integração continuam existentes e roteáveis, mas não ocupam o
 * menu diário. Assim o produto deixa de parecer uma console de desenvolvimento.
 */
export const navGroups: NavGroup[] = [
  {
    title: "Operação",
    items: [
      { label: "Visão Geral", slug: "", icon: LayoutDashboard },
      { label: "Geradores", slug: "geradores", icon: Fan },
      { label: "Central de Operação", slug: "central-de-operacao", icon: Gauge },
      { label: "Alarmes", slug: "alarmes", icon: BellRing },
      { label: "Eventos", slug: "eventos", icon: Activity },
      { label: "Mapa", slug: "mapa", icon: Map },
    ],
  },
  {
    title: "Comunicação",
    items: [
      { label: "Modems", slug: "modems", icon: Router },
      { label: "Conectividade", slug: "conectividade", icon: Signal },
      { label: "Gateways", slug: "gateways", icon: Network },
      { label: "Comunicação", slug: "comunicacao", icon: Radio },
    ],
  },
  {
    title: "Energia",
    items: [
      { label: "Rede", slug: "energia-rede", icon: UtilityPole },
      { label: "Geradores", slug: "energia-geradores", icon: Power },
      { label: "Carga", slug: "energia-carga", icon: Factory },
      { label: "Transferência", slug: "energia-transferencia", icon: ArrowLeftRight },
      { label: "Paralelismo", slug: "energia-paralelismo", icon: GitMerge },
    ],
  },
  {
    title: "Manutenção",
    items: [
      { label: "Manutenção", slug: "manutencao", icon: Wrench },
      { label: "Combustível", slug: "combustivel", icon: Fuel },
      { label: "Baterias", slug: "baterias", icon: BatteryCharging },
      { label: "Horímetros", slug: "horimetros", icon: Timer },
      { label: "Agenda", slug: "agenda", icon: CalendarDays },
      { label: "Histórico", slug: "historico", icon: Database },
      { label: "Relatórios", slug: "relatorios", icon: FileText },
    ],
  },
  {
    title: "Gestão",
    items: [
      { label: "Clientes", slug: "clientes", icon: Users },
      { label: "Unidades", slug: "unidades", icon: Building2 },
    ],
  },
  {
    title: "Automação",
    items: [
      { label: "Regras", slug: "regras", icon: Settings2 },
      { label: "Exercício automático", slug: "exercicio-automatico", icon: RefreshCcw },
      { label: "Agendamentos", slug: "agendamentos", icon: CalendarClock },
      { label: "Notificações", slug: "notificacoes", icon: Bell },
      { label: "Escalonamento", slug: "escalonamento", icon: ArrowUpNarrowWide },
    ],
  },
  {
    title: "Administração",
    adminOnly: true,
    items: [
      { label: "Usuários", slug: "usuarios", icon: UserCog, adminOnly: true },
      { label: "Perfis e permissões", slug: "perfis", icon: ShieldCheck, adminOnly: true },
      { label: "Controladoras", slug: "controladoras", icon: Cpu, adminOnly: true },
      { label: "Configurações", slug: "configuracoes", icon: Settings, adminOnly: true },
      { label: "Saúde do sistema", slug: "saude", icon: HeartPulse, adminOnly: true },
      { label: "Backups", slug: "backups", icon: HardDriveDownload, adminOnly: true },
      { label: "Auditoria", slug: "auditoria", icon: ScrollText, adminOnly: true },
      { label: "Versão", slug: "versao", icon: Info, adminOnly: true },
    ],
  },
];

/*
 * Rotas técnicas preservadas para administração/diagnóstico. Elas saem do menu
 * principal, mas findItem continua reconhecendo título e grupo quando abertas
 * por links internos ou por URL direta.
 */
const hiddenTechnicalItems: Array<{ group: string; item: NavItem }> = [
  { group: "Monitoramento", item: { label: "Tendências", slug: "tendencias", icon: Activity } },
  { group: "SCADA", item: { label: "Canais", slug: "canais", icon: Activity } },
  { group: "SCADA", item: { label: "Tags", slug: "tags", icon: Activity } },
  { group: "SCADA", item: { label: "Templates", slug: "templates", icon: Activity } },
  { group: "SCADA", item: { label: "Rapid SCADA", slug: "rapid-scada", icon: Activity } },
  { group: "SCADA", item: { label: "Diagnóstico", slug: "diagnostico", icon: AlertTriangle } },
  { group: "Biblioteca", item: { label: "Fabricantes", slug: "fabricantes", icon: Cpu } },
  { group: "Biblioteca", item: { label: "Controladoras", slug: "lib-controladoras", icon: Cpu } },
  { group: "Biblioteca", item: { label: "Protocolos", slug: "protocolos", icon: Network } },
  { group: "Biblioteca", item: { label: "Controller Packs", slug: "controller-packs", icon: Cpu } },
  { group: "Biblioteca", item: { label: "Laboratório", slug: "laboratorio", icon: Cpu } },
  { group: "Integrações", item: { label: "API", slug: "api", icon: Network } },
  { group: "Integrações", item: { label: "Webhooks", slug: "webhooks", icon: Network } },
  { group: "Integrações", item: { label: "E-mail", slug: "email", icon: Bell } },
  { group: "Integrações", item: { label: "WhatsApp", slug: "whatsapp", icon: Bell } },
  { group: "Integrações", item: { label: "ERP / BMS / outros", slug: "erp-bms", icon: Network } },
];

export function findItem(slug: string) {
  for (const group of navGroups) {
    const found = group.items.find((item) => item.slug === slug);
    if (found) return { group, item: found };
  }
  const hidden = hiddenTechnicalItems.find((entry) => entry.item.slug === slug);
  if (!hidden) return null;
  return {
    group: { title: hidden.group, items: [hidden.item], adminOnly: true } satisfies NavGroup,
    item: hidden.item,
  };
}
