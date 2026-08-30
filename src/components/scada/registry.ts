import type { ComponentType } from "react";

import { EventsScreen, OperationCenter, SitesScreen, TrendsScreen } from "./operations";
import { ReportsV3Screen } from "./ReportsV3Screen";
import { ApiV3Screen } from "./ApiV3Screen";
import { SchedulesV3Screen } from "./SchedulesV3Screen";
import { EmailV3Screen, WhatsAppV3Screen } from "./IntegrationsV3Screens";
import { ErpBmsLifecycleScreen } from "./ErpBmsLifecycleScreen";
import { IndustrialAlarmsScreen, ProcessHistoryScreen, EscalationV3Screen } from "./IndustrialOpsScreens";
import { MaintenanceHubScreen } from "./MaintenanceHubScreen";
import { AgendaV3Screen } from "./AgendaV3Screen";
import { SystemSettingsV3Screen } from "./SystemSettingsV3Screen";
import { BackupsV3Screen } from "./BackupsV3Screen";
import { MapScreen } from "./MapScreen";
import { ControllersLifecycleScreen } from "./ControllersLifecycleScreen";
import { UsersV3Screen } from "./UsersV3Screen";
import {
  BatteriesScreen,
  EnergyGens,
  EnergyLoad,
  EnergyParallel,
  EnergyRede,
  EnergyTransfer,
  FuelScreen,
  HourmetersScreen,
} from "./energy-maint";
import {
  CommunicationScreen,
  ConnectivityScreen,
  ExerciseScreen,
  GatewaysScreen,
  ModemsScreen,
  NotificationsScreen,
  RulesScreen,
} from "./equip-auto";
import {
  ChannelsScreen,
  DiagnosticScreen,
  LabScreen,
  LibControllersScreen,
  ManufacturersScreen,
  PacksScreen,
  ProtocolsScreen,
  RapidScadaScreen,
  TagsScreen,
  TemplatesScreen,
  VersionScreen,
  HealthScreen,
} from "./scada-lib";
import { ClientsScreen, UnitsScreen, WebhooksScreen } from "./mgmt";
import { AuditScreen, RolesScreen } from "./security";

export const screens: Record<string, ComponentType> = {
  "central-de-operacao": OperationCenter,
  sites: SitesScreen,
  mapa: MapScreen,
  alarmes: IndustrialAlarmsScreen,
  eventos: EventsScreen,
  tendencias: TrendsScreen,
  historico: ProcessHistoryScreen,
  relatorios: ReportsV3Screen,
  "energia-rede": EnergyRede,
  "energia-geradores": EnergyGens,
  "energia-carga": EnergyLoad,
  "energia-transferencia": EnergyTransfer,
  "energia-paralelismo": EnergyParallel,
  manutencao: MaintenanceHubScreen,
  combustivel: FuelScreen,
  baterias: BatteriesScreen,
  horimetros: HourmetersScreen,
  agenda: AgendaV3Screen,
  controladoras: ControllersLifecycleScreen,
  modems: ModemsScreen,
  gateways: GatewaysScreen,
  conectividade: ConnectivityScreen,
  comunicacao: CommunicationScreen,
  regras: RulesScreen,
  "exercicio-automatico": ExerciseScreen,
  agendamentos: SchedulesV3Screen,
  notificacoes: NotificationsScreen,
  escalonamento: EscalationV3Screen,
  canais: ChannelsScreen,
  tags: TagsScreen,
  templates: TemplatesScreen,
  "rapid-scada": RapidScadaScreen,
  diagnostico: DiagnosticScreen,
  fabricantes: ManufacturersScreen,
  "lib-controladoras": LibControllersScreen,
  protocolos: ProtocolsScreen,
  "controller-packs": PacksScreen,
  laboratorio: LabScreen,
  clientes: ClientsScreen,
  unidades: UnitsScreen,
  usuarios: UsersV3Screen,
  perfis: RolesScreen,
  auditoria: AuditScreen,
  api: ApiV3Screen,
  webhooks: WebhooksScreen,
  email: EmailV3Screen,
  whatsapp: WhatsAppV3Screen,
  "erp-bms": ErpBmsLifecycleScreen,
  configuracoes: SystemSettingsV3Screen,
  backups: BackupsV3Screen,
  saude: HealthScreen,
  versao: VersionScreen,
};
