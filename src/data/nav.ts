import {
  LayoutDashboard,
  Fan,
  Gauge,
  Power,
  MapPin,
  Map,
  BellRing,
  Clock,
  Activity,
  Database,
  FileText,
  UtilityPole,
  Factory,
  ArrowLeftRight,
  GitMerge,
  Wrench,
  Fuel,
  BatteryCharging,
  Timer,
  CalendarDays,
  Cpu,
  Router,
  Network,
  Radio,
  Signal,
  Settings2,
  RefreshCcw,
  CalendarClock,
  Bell,
  ArrowUpNarrowWide,
  Layers,
  Tags,
  LayoutTemplate,
  MonitorCog,
  Stethoscope,
  Library,
  CircuitBoard,
  Cable,
  Package,
  FlaskConical,
  Users,
  Building2,
  UserCog,
  ShieldCheck,
  ScrollText,
  Webhook,
  Mail,
  MessageCircle,
  Plug,
  Landmark,
  Settings,
  HardDriveDownload,
  HeartPulse,
  Info,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; slug: string; icon: LucideIcon };
export type NavGroup = { title: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    title: "RC Geradores",
    items: [
      { label: "Visão Geral", slug: "", icon: LayoutDashboard },
      { label: "Geradores", slug: "geradores", icon: Fan },
      { label: "Central de Operação", slug: "central-de-operacao", icon: Gauge },
      { label: "Sites", slug: "sites", icon: MapPin },
      { label: "Mapa", slug: "mapa", icon: Map },
    ],
  },
  {
    title: "Monitoramento",
    items: [
      { label: "Alarmes", slug: "alarmes", icon: BellRing },
      { label: "Eventos", slug: "eventos", icon: Clock },
      { label: "Tendências", slug: "tendencias", icon: Activity },
      { label: "Histórico", slug: "historico", icon: Database },
      { label: "Relatórios", slug: "relatorios", icon: FileText },
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
    ],
  },
  {
    title: "Equipamentos",
    items: [
      { label: "Controladoras", slug: "controladoras", icon: Cpu },
      { label: "Modems", slug: "modems", icon: Router },
      { label: "Gateways", slug: "gateways", icon: Network },
      { label: "Conectividade", slug: "conectividade", icon: Signal },
      { label: "Comunicação", slug: "comunicacao", icon: Radio },
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
    title: "SCADA",
    items: [
      { label: "Canais", slug: "canais", icon: Layers },
      { label: "Tags", slug: "tags", icon: Tags },
      { label: "Templates", slug: "templates", icon: LayoutTemplate },
      { label: "Rapid SCADA", slug: "rapid-scada", icon: MonitorCog },
      { label: "Diagnóstico", slug: "diagnostico", icon: Stethoscope },
    ],
  },
  {
    title: "Biblioteca",
    items: [
      { label: "Fabricantes", slug: "fabricantes", icon: Library },
      { label: "Controladoras", slug: "lib-controladoras", icon: CircuitBoard },
      { label: "Protocolos", slug: "protocolos", icon: Cable },
      { label: "Controller Packs", slug: "controller-packs", icon: Package },
      { label: "Laboratório", slug: "laboratorio", icon: FlaskConical },
    ],
  },
  {
    title: "Gestão",
    items: [
      { label: "Clientes", slug: "clientes", icon: Users },
      { label: "Unidades", slug: "unidades", icon: Building2 },
      { label: "Usuários", slug: "usuarios", icon: UserCog },
      { label: "Perfis e permissões", slug: "perfis", icon: ShieldCheck },
      { label: "Auditoria", slug: "auditoria", icon: ScrollText },
    ],
  },
  {
    title: "Integrações",
    items: [
      { label: "API", slug: "api", icon: Plug },
      { label: "Webhooks", slug: "webhooks", icon: Webhook },
      { label: "E-mail", slug: "email", icon: Mail },
      { label: "WhatsApp", slug: "whatsapp", icon: MessageCircle },
      { label: "ERP / BMS / outros", slug: "erp-bms", icon: Landmark },
    ],
  },
  {
    title: "Sistema",
    items: [
      { label: "Configurações", slug: "configuracoes", icon: Settings },
      { label: "Backups", slug: "backups", icon: HardDriveDownload },
      { label: "Saúde do sistema", slug: "saude", icon: HeartPulse },
      { label: "Versão", slug: "versao", icon: Info },
    ],
  },
];

export function findItem(slug: string) {
  for (const g of navGroups) {
    const found = g.items.find((i) => i.slug === slug);
    if (found) return { group: g, item: found };
  }
  return null;
}
