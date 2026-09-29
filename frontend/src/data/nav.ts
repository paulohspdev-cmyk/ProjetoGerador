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
  hint?: string;
  purposeRole?: string;
  purpose?: string;
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
      {
        label: "Resumo Operacional",
        slug: "",
        icon: LayoutDashboard,
        hint: "O parque neste momento",
      },
      { label: "Geradores", slug: "geradores", icon: Fan, hint: "Cartão de cada máquina" },
      {
        label: "Centro de Operações",
        slug: "central-de-operacao",
        icon: Gauge,
        hint: "O que precisa de ação",
        purposeRole: "Fila",
        purpose: "O que o operador precisa tratar agora: alarmes, equipamentos fora e pendências.",
      },
      {
        label: "Alarmes",
        slug: "alarmes",
        icon: BellRing,
        hint: "Falhas que exigem ação",
        purposeRole: "Ocorrência",
        purpose:
          "Falhas ativas do parque. Um alarme pede reconhecimento. Não é o histórico do que já passou.",
      },
      {
        label: "Eventos",
        slug: "eventos",
        icon: Activity,
        hint: "Registro do que aconteceu",
        purposeRole: "Histórico",
        purpose:
          "O que aconteceu no parque, em ordem. Evento registra. Alarme é o que ainda pede ação.",
      },
      {
        label: "Mapa",
        slug: "mapa",
        icon: Map,
        hint: "Onde cada unidade está",
        purposeRole: "Local",
        purpose:
          "Posição das unidades no mapa. Serve para achar o site, não para operar o gerador.",
      },
      {
        label: "Visão por unidade",
        slug: "sites",
        icon: MapPin,
        hint: "O parque agrupado por site",
        purposeRole: "Site",
        purpose:
          "Os geradores agrupados pela unidade. Mostra o estado de cada site, não o detalhe da máquina.",
      },
    ],
  },
  {
    title: "Comunicação",
    items: [
      {
        label: "Modems",
        slug: "modems",
        icon: Router,
        hint: "Cadastro do rádio e do chip",
        purposeRole: "Equipamento",
        purpose:
          "Cadastro do rádio celular do site: aparelho, chip, operadora e IMEI. O estado da sessão fica em Conectividade.",
      },
      {
        label: "Conectividade",
        slug: "conectividade",
        icon: Signal,
        hint: "Se o caminho está no ar",
        purposeRole: "Caminho",
        purpose:
          "Mostra se o caminho está no ar agora: sessões da ponte, tráfego, operadora e conexões degradadas.",
      },
      {
        label: "Gateways",
        slug: "gateways",
        icon: Network,
        hint: "Cadastro do concentrador",
        purposeRole: "Equipamento",
        purpose:
          "Cadastro do concentrador de campo, o equipamento que junta várias controladoras numa rede. Não é o estado do gerador.",
      },
      {
        label: "Comunicação",
        slug: "comunicacao",
        icon: Radio,
        hint: "Se o gerador entrega telemetria",
        purposeRole: "Gerador",
        purpose:
          "Mostra se cada gerador está entregando telemetria ao SCADA: ativa, expirada ou sem fonte, com o endpoint da unidade.",
      },
    ],
  },
  {
    title: "Energia",
    items: [
      {
        label: "Rede",
        slug: "energia-rede",
        icon: UtilityPole,
        hint: "Tensão e frequência da rua",
        purposeRole: "Concessionária",
        purpose:
          "Medições da rua neste gerador: tensão, frequência e o disjuntor MCB. Dado do gerador não entra aqui como se fosse concessionária.",
      },
      {
        label: "Geradores",
        slug: "energia-geradores",
        icon: Power,
        hint: "kW e frequência da máquina",
        purposeRole: "Máquina",
        purpose:
          "O que o gerador está produzindo: potência, frequência e o disjuntor GCB. Medição que a controladora não envia fica N/D.",
      },
      {
        label: "Carga",
        slug: "energia-carga",
        icon: Factory,
        hint: "Potência que a planta consome",
        purposeRole: "Consumo",
        purpose:
          "A potência que está indo para a carga, em kW. Pico e fator de potência só aparecem quando essa leitura existe.",
      },
      {
        label: "Transferência",
        slug: "energia-transferencia",
        icon: ArrowLeftRight,
        hint: "Quem alimenta: MCB ou GCB",
        purposeRole: "Fonte",
        purpose:
          "Quem está fechado na carga: a rede pelo MCB ou o gerador pelo GCB. O estado não é adivinhado pela rotação.",
      },
      {
        label: "Paralelismo",
        slug: "energia-paralelismo",
        icon: GitMerge,
        hint: "Máquinas no mesmo barramento",
        purposeRole: "Barramento",
        purpose:
          "Se há leitura de paralelismo e sincronismo entre geradores. Sem essa medição, a tela mostra N/D.",
      },
    ],
  },
  {
    title: "Manutenção",
    items: [
      {
        label: "Manutenção",
        slug: "manutencao",
        icon: Wrench,
        hint: "Planos e ordens de serviço",
        purposeRole: "Intervenção",
        purpose: "Planos, ordens e vencimentos do equipamento. Não é a telemetria da ECU.",
      },
      {
        label: "Combustível",
        slug: "combustivel",
        icon: Fuel,
        hint: "Nível medido no tanque",
        purposeRole: "Tanque",
        purpose:
          "Nível de combustível quando a controladora mede. Sem leitura, não estima litros nem autonomia.",
      },
      {
        label: "Baterias",
        slug: "baterias",
        icon: BatteryCharging,
        hint: "Tensão da bateria",
        purposeRole: "Partida",
        purpose:
          "Tensão de bateria de cada gerador. É a bateria de partida, não a carga da planta.",
      },
      {
        label: "Horímetros",
        slug: "horimetros",
        icon: Timer,
        hint: "Horas de operação",
        purposeRole: "Uso",
        purpose:
          "Horas acumuladas de cada máquina. Serve para saber o uso e o vencimento da manutenção.",
      },
      {
        label: "Agenda",
        slug: "agenda",
        icon: CalendarDays,
        hint: "Visitas e compromissos",
        purposeRole: "Calendário",
        purpose: "Compromissos e visitas programadas. Não dispara o gerador.",
      },
      {
        label: "Histórico",
        slug: "historico",
        icon: Database,
        hint: "O que já ocorreu",
        purposeRole: "Passado",
        purpose: "Consulta do que já aconteceu no processo. Não é a lista de alarmes abertos.",
      },
      {
        label: "Relatórios",
        slug: "relatorios",
        icon: FileText,
        hint: "Exportar leituras",
        purposeRole: "Documento",
        purpose: "Gera e baixa relatórios das leituras e ocorrências. Não altera o gerador.",
      },
    ],
  },
  {
    title: "Gestão",
    items: [
      {
        label: "Clientes",
        slug: "clientes",
        icon: Users,
        hint: "Quem contrata o monitoramento",
        purposeRole: "Contrato",
        purpose: "Cadastro de quem contrata o monitoramento. Cliente não é a unidade física.",
      },
      {
        label: "Unidades",
        slug: "unidades",
        icon: Building2,
        hint: "Sites dos geradores",
        purposeRole: "Local",
        purpose:
          "Cadastro dos sites onde os geradores estão. A unidade agrupa as máquinas de um endereço.",
      },
    ],
  },
  {
    title: "Automação",
    items: [
      {
        label: "Regras",
        slug: "regras",
        icon: Settings2,
        hint: "Se acontecer X, faz Y",
        purposeRole: "Automação",
        purpose: "Regras do tipo: se um gerador sair do ar, avisar ou abrir uma tarefa.",
      },
      {
        label: "Exercício automático",
        slug: "exercicio-automatico",
        icon: RefreshCcw,
        hint: "Partida de teste",
        purposeRole: "Teste",
        purpose:
          "Partidas de teste programadas para confirmar que o gerador pega. Não é a operação normal.",
      },
      {
        label: "Agendamentos",
        slug: "agendamentos",
        icon: CalendarClock,
        hint: "Tarefas com data e hora",
        purposeRole: "Quando",
        purpose:
          "Tarefas marcadas para um dia e hora. Agenda de execução, não o calendário de visitas.",
      },
      {
        label: "Notificações",
        slug: "notificacoes",
        icon: Bell,
        hint: "Avisos ao operador",
        purposeRole: "Aviso",
        purpose:
          "Avisos que o sistema já gerou para o operador. Não configura e-mail nem WhatsApp.",
      },
      {
        label: "Escalonamento",
        slug: "escalonamento",
        icon: ArrowUpNarrowWide,
        hint: "Quem recebe se ninguém tratar",
        purposeRole: "Plantão",
        purpose:
          "Para quem o alarme sobe se ninguém reconhecer. Define a cadeia, não a lista de alarmes.",
      },
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
        hint: "Gráfico de uma medição",
        purposeRole: "Histórico",
        purpose: "Curva de uma medição ao longo do tempo. Só desenha o que foi gravado.",
      },
      {
        label: "Canais",
        slug: "canais",
        icon: Activity,
        adminOnly: true,
        section: "Engenharia",
        hint: "Pontos lidos da ECU",
        purposeRole: "Telemetria",
        purpose: "Pontos de telemetria dos perfis homologados. É o que a plataforma sabe ler.",
      },
      {
        label: "Tags",
        slug: "tags",
        icon: Activity,
        adminOnly: true,
        section: "Engenharia",
        hint: "Nome de cada medição",
        purposeRole: "Mapa",
        purpose: "Nomes das medições no mapa do controlador. Tag não é o valor ao vivo.",
      },
      {
        label: "Templates",
        slug: "templates",
        icon: Activity,
        adminOnly: true,
        section: "Engenharia",
        hint: "Modelo de cadastro",
        purposeRole: "Modelo",
        purpose: "Modelo usado para cadastrar um gerador a partir de um perfil de produção.",
      },
      {
        label: "Motor de telemetria",
        slug: "rapid-scada",
        icon: Activity,
        adminOnly: true,
        section: "Engenharia",
        hint: "Ligação com o Rapid SCADA",
        purposeRole: "Coleta",
        purpose: "Estado da ligação com o motor que coleta as leituras. Não é a tela do gerador.",
      },
      {
        label: "Diagnóstico",
        slug: "diagnostico",
        icon: AlertTriangle,
        adminOnly: true,
        section: "Engenharia",
        hint: "O que está falhando",
        purposeRole: "Falha",
        purpose:
          "O que está falhando na coleta, no cadastro ou na ligação. Serve para achar a causa.",
      },
      {
        label: "Fabricantes",
        slug: "fabricantes",
        icon: Cpu,
        adminOnly: true,
        section: "Biblioteca",
        hint: "Marcas de controladora",
        purposeRole: "Marca",
        purpose: "Marcas de controladora conhecidas pela plataforma, como ComAp e DSE.",
      },
      {
        label: "Biblioteca de controladoras",
        slug: "lib-controladoras",
        icon: Cpu,
        adminOnly: true,
        section: "Biblioteca",
        hint: "Modelos e o que medem",
        purposeRole: "Modelo",
        purpose:
          "Modelos de ECU e o que cada um mede e comanda. O modelo não liga sozinho um gerador.",
      },
      {
        label: "Protocolos",
        slug: "protocolos",
        icon: Network,
        adminOnly: true,
        section: "Biblioteca",
        hint: "Como se fala com a ECU",
        purposeRole: "Protocolo",
        purpose:
          "Como a plataforma conversa com o controlador: Modbus, GenComm e os demais já mapeados.",
      },
      {
        label: "Perfis homologados",
        slug: "controller-packs",
        icon: Cpu,
        adminOnly: true,
        section: "Biblioteca",
        hint: "Contrato validado da ECU",
        purposeRole: "Homologação",
        purpose:
          "O contrato validado de cada controladora: o que pode aparecer e o que pode ser comandado.",
      },
      {
        label: "Laboratório",
        slug: "laboratorio",
        icon: Cpu,
        adminOnly: true,
        section: "Biblioteca",
        hint: "Perfis ainda em teste",
        purposeRole: "Teste",
        purpose: "Perfis em teste. Ainda não são comando de campo.",
      },
      {
        label: "API",
        slug: "api",
        icon: Network,
        adminOnly: true,
        section: "Integrações",
        hint: "Acesso externo aos dados",
        purposeRole: "Integração",
        purpose: "Chaves e acesso para outro sistema ler os dados. Não opera o gerador pela tela.",
      },
      {
        label: "Webhooks",
        slug: "webhooks",
        icon: Network,
        adminOnly: true,
        section: "Integrações",
        hint: "Aviso para outro sistema",
        purposeRole: "Saída",
        purpose:
          "Endereços que recebem um aviso quando algo acontece. Não é a lista de notificações da tela.",
      },
      {
        label: "E-mail",
        slug: "email",
        icon: Bell,
        adminOnly: true,
        section: "Integrações",
        hint: "Envio de alerta por e-mail",
        purposeRole: "Canal",
        purpose: "Configuração do envio de alerta por e-mail. Não é a caixa de avisos do operador.",
      },
      {
        label: "WhatsApp",
        slug: "whatsapp",
        icon: Bell,
        adminOnly: true,
        section: "Integrações",
        hint: "Envio de alerta por WhatsApp",
        purposeRole: "Canal",
        purpose: "Configuração do envio de alerta por WhatsApp. Não substitui o alarme na tela.",
      },
      {
        label: "ERP / BMS / outros",
        slug: "erp-bms",
        icon: Network,
        adminOnly: true,
        section: "Integrações",
        hint: "Ligação com gestão predial",
        purposeRole: "Integração",
        purpose: "Ligação com ERP, BMS ou outro sistema de gestão. Não muda a operação do gerador.",
      },
      {
        label: "Usuários",
        slug: "usuarios",
        icon: UserCog,
        adminOnly: true,
        section: "Sistema",
        hint: "Quem entra na plataforma",
        purposeRole: "Acesso",
        purpose: "Contas de quem entra. O que cada um pode fazer fica em Perfis e permissões.",
      },
      {
        label: "Perfis e permissões",
        slug: "perfis",
        icon: ShieldCheck,
        adminOnly: true,
        section: "Sistema",
        hint: "O que cada perfil pode fazer",
        purposeRole: "Permissão",
        purpose: "O que cada perfil pode ver e comandar. Não cria a conta da pessoa.",
      },
      {
        label: "Controladoras",
        slug: "controladoras",
        icon: Cpu,
        adminOnly: true,
        section: "Sistema",
        hint: "A ECU de cada gerador",
        purposeRole: "Instância",
        purpose:
          "A controladora ligada a cada gerador: modelo, firmware e perfil. Não é a biblioteca de modelos.",
      },
      {
        label: "Configurações",
        slug: "configuracoes",
        icon: Settings,
        adminOnly: true,
        section: "Sistema",
        hint: "Ajustes da plataforma",
        purposeRole: "Ajuste",
        purpose: "Ajustes gerais da plataforma. Não é o parâmetro da ECU do gerador.",
      },
      {
        label: "Saúde do sistema",
        slug: "saude",
        icon: HeartPulse,
        adminOnly: true,
        section: "Sistema",
        hint: "Se a plataforma está no ar",
        purposeRole: "Plataforma",
        purpose: "Se API, banco e ponte de comunicação estão no ar. Não é a saúde do motor.",
      },
      {
        label: "Backups",
        slug: "backups",
        icon: HardDriveDownload,
        adminOnly: true,
        section: "Sistema",
        hint: "Cópias dos dados",
        purposeRole: "Cópia",
        purpose: "Cópias de segurança dos dados da plataforma. Não é o histórico operacional.",
      },
      {
        label: "Auditoria",
        slug: "auditoria",
        icon: ScrollText,
        adminOnly: true,
        section: "Sistema",
        hint: "Quem fez o quê",
        purposeRole: "Rastro",
        purpose: "Quem fez o quê e quando. Serve para rastrear ação, não para ver alarme.",
      },
      {
        label: "Versão",
        slug: "versao",
        icon: Info,
        adminOnly: true,
        section: "Sistema",
        hint: "Versão instalada",
        purposeRole: "Versão",
        purpose: "Versão instalada desta plataforma.",
      },
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
