import type { ComponentType } from "react";

import { AlarmsScreen, EventsScreen, HistoryScreen, OperationCenter, SitesScreen, TrendsScreen } from "./operations";
import { ReportsV3Screen } from "./ReportsV3Screen";
import { ApiV3Screen } from "./ApiV3Screen";
import { SchedulesV3Screen } from "./SchedulesV3Screen";
import { EmailV3Screen, ErpBmsV3Screen, WhatsAppV3Screen } from "./IntegrationsV3Screens";
import { MapScreen } from "./MapScreen";
import { ControllersV3Screen } from "./ControllersV3Screen";
import {
  AgendaScreen,
  BatteriesScreen,
  EnergyGens,
  EnergyLoad,
  EnergyParallel,
  EnergyRede,
  EnergyTransfer,
  FuelScreen,
  HourmetersScreen,
  MaintenanceScreen,
} from "./energy-maint";
import {
  CommunicationScreen,
  ConnectivityScreen,
  EscalationScreen,
  ExerciseScreen,
  GatewaysScreen,
  ModemsScreen,
  NotificationsScreen,
  RulesScreen,
} from "./equip-auto";
import {
  BackupsScreen,
  ChannelsScreen,
  DiagnosticScreen,
  LabScreen,
  LibControllersScreen,
  ManufacturersScreen,
  PacksScreen,
  ProtocolsScreen,
  RapidScadaScreen,
  SettingsScreen,
  TagsScreen,
  TemplatesScreen,
  VersionScreen,
  HealthScreen,
} from "./scada-lib";
import {
  ClientsScreen,
  UnitsScreen,
  WebhooksScreen,
} from "./mgmt";
import { AuditScreen, RolesScreen, UsersScreen } from "./security";

export const screens: Record<string, ComponentType> = {
  "central-de-operacao": OperationCenter,
  sites: SitesScreen,
  mapa: MapScreen,
  alarmes: AlarmsScreen,
  eventos: EventsScreen,
  tendencias: TrendsScreen,
  historico: HistoryScreen,
  relatorios: ReportsV3Screen,
  "energia-rede": EnergyRede,
  "energia-geradores": EnergyGens,
  "energia-carga": EnergyLoad,
  "energia-transferencia": EnergyTransfer,
  "energia-paralelismo": EnergyParallel,
  manutencao: MaintenanceScreen,
  combustivel: FuelScreen,
  baterias: BatteriesScreen,
  horimetros: HourmetersScreen,
  agenda: AgendaScreen,
  controladoras: ControllersV3Screen,
  modems: ModemsScreen,
  gateways: GatewaysScreen,
  conectividade: ConnectivityScreen,
  comunicacao: CommunicationScreen,
  regras: RulesScreen,
  "exercicio-automatico": ExerciseScreen,
  agendamentos: SchedulesV3Screen,
  notificacoes: NotificationsScreen,
  escalonamento: EscalationScreen,
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
  usuarios: UsersScreen,
  perfis: RolesScreen,
  auditoria: AuditScreen,
  api: ApiV3Screen,
  webhooks: WebhooksScreen,
  email: EmailV3Screen,
  whatsapp: WhatsAppV3Screen,
  "erp-bms": ErpBmsV3Screen,
  configuracoes: SettingsScreen,
  backups: BackupsScreen,
  saude: HealthScreen,
  versao: VersionScreen,
};
