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
  section?: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
};

/*
 * A navegação principal expõe todas as superfícies implementadas. Módulos
 * técnicos permanecem protegidos por permissão administrativa, mas não ficam
 * escondidos do operador autorizado.
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
      { label: "Visão por unidade", slug: "sites", icon: MapPin },
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
    title: "Sistema",
    adminOnly: true,
    items: [
      {
        label: "Tendências",
        slug: "tendencias",
        icon: Activity,
        adminOnly: true,
        section: "Monitoramento",
      },
      { label: "Canais", slug: "canais", icon: Activity, adminOnly: true, section: "Engenharia" },
      { label: "Tags", slug: "tags", icon: Activity, adminOnly: true, section: "Engenharia" },
      {
        label: "Templates",
        slug: "templates",
        icon: Activity,
        adminOnly: true,
        section: "Engenharia",
      },
      {
        label: "Motor de telemetria",
        slug: "rapid-scada",
        icon: Activity,
        adminOnly: true,
        section: "Engenharia",
      },
      {
        label: "Diagnóstico",
        slug: "diagnostico",
        icon: AlertTriangle,
        adminOnly: true,
        section: "Engenharia",
      },
      {
        label: "Fabricantes",
        slug: "fabricantes",
        icon: Cpu,
        adminOnly: true,
        section: "Biblioteca",
      },
      {
        label: "Biblioteca de controladoras",
        slug: "lib-controladoras",
        icon: Cpu,
        adminOnly: true,
        section: "Biblioteca",
      },
      {
        label: "Protocolos",
        slug: "protocolos",
        icon: Network,
        adminOnly: true,
        section: "Biblioteca",
      },
      {
        label: "Perfis homologados",
        slug: "controller-packs",
        icon: Cpu,
        adminOnly: true,
        section: "Biblioteca",
      },
      {
        label: "Laboratório",
        slug: "laboratorio",
        icon: Cpu,
        adminOnly: true,
        section: "Biblioteca",
      },
      { label: "API", slug: "api", icon: Network, adminOnly: true, section: "Integrações" },
      {
        label: "Webhooks",
        slug: "webhooks",
        icon: Network,
        adminOnly: true,
        section: "Integrações",
      },
      { label: "E-mail", slug: "email", icon: Bell, adminOnly: true, section: "Integrações" },
      { label: "WhatsApp", slug: "whatsapp", icon: Bell, adminOnly: true, section: "Integrações" },
      {
        label: "ERP / BMS / outros",
        slug: "erp-bms",
        icon: Network,
        adminOnly: true,
        section: "Integrações",
      },
      { label: "Usuários", slug: "usuarios", icon: UserCog, adminOnly: true, section: "Sistema" },
      {
        label: "Perfis e permissões",
        slug: "perfis",
        icon: ShieldCheck,
        adminOnly: true,
        section: "Sistema",
      },
      {
        label: "Controladoras",
        slug: "controladoras",
        icon: Cpu,
        adminOnly: true,
        section: "Sistema",
      },
      {
        label: "Configurações",
        slug: "configuracoes",
        icon: Settings,
        adminOnly: true,
        section: "Sistema",
      },
      {
        label: "Saúde do sistema",
        slug: "saude",
        icon: HeartPulse,
        adminOnly: true,
        section: "Sistema",
      },
      {
        label: "Backups",
        slug: "backups",
        icon: HardDriveDownload,
        adminOnly: true,
        section: "Sistema",
      },
      {
        label: "Auditoria",
        slug: "auditoria",
        icon: ScrollText,
        adminOnly: true,
        section: "Sistema",
      },
      { label: "Versão", slug: "versao", icon: Info, adminOnly: true, section: "Sistema" },
    ],
  },
];

export function findItem(slug: string) {
  for (const group of navGroups) {
    const found = group.items.find((item) => item.slug === slug);
    if (found) return { group, item: found };
  }
  return null;
}
