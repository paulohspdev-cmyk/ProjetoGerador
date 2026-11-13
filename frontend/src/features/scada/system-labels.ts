/** Rótulos de apresentação. Nunca alteram códigos de canais, APIs ou registros. */
const metricLabels: Record<string, string> = {
  rpm: "Rotação do motor",
  power_kw: "Potência ativa",
  frequency: "Frequência do gerador",
  mains_frequency: "Frequência da rede",
  mains_voltage_l1: "Tensão da rede — fase L1",
  mains_voltage_l2: "Tensão da rede — fase L2",
  mains_voltage_l3: "Tensão da rede — fase L3",
  battery_voltage: "Tensão da bateria",
  fuel_level: "Nível de combustível",
  coolant_temperature: "Temperatura do líquido de arrefecimento",
  oil_pressure: "Pressão do óleo",
  gcb_closed: "Disjuntor do gerador (GCB)",
  mcb_closed: "Disjuntor da rede (MCB)",
  running_hours: "Horímetro",
};
const auditActions: Record<string, string> = {
  create: "Criação",
  update: "Alteração",
  delete: "Exclusão",
  login: "Acesso",
  logout: "Saída",
  enable: "Habilitação",
  disable: "Desabilitação",
  acknowledge: "Reconhecimento",
};
const auditEntities: Record<string, string> = {
  generator: "Gerador",
  controller: "Controladora",
  controller_connection: "Conexão da controladora",
  asset: "Equipamento",
  asset_link: "Vínculo entre equipamentos",
  user: "Usuário",
  api_token: "Token de API",
  webhook: "Webhook",
  backup: "Backup",
  modem: "Modem",
  setting: "Configuração",
};
const transportLabels: Record<string, string> = {
  reverse_tcp: "TCP reverso",
  modbus_tcp_direct: "Modbus TCP direto",
  modbus_rtu_serial: "Modbus RTU serial",
  rtu_over_tcp: "Modbus RTU sobre TCP",
};
const lifecycleLabels: Record<string, string> = {
  production: "Produção",
  lab: "Laboratório",
  validated: "Validado",
  draft: "Rascunho",
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
  experimental: "Experimental",
};
function humanizeUnknown(code: string): string {
  // Preserva códigos desconhecidos, evitando traduções incorretas de engenharia.
  return code;
}
export const metricLabel = (code: string) => metricLabels[code] ?? humanizeUnknown(code);
export const auditActionLabel = (code: string) => auditActions[code] ?? humanizeUnknown(code);
export const auditEntityLabel = (code: string) => auditEntities[code] ?? humanizeUnknown(code);
export const transportLabel = (code: string) => transportLabels[code] ?? humanizeUnknown(code);
export const lifecycleLabel = (code: string) => lifecycleLabels[code] ?? humanizeUnknown(code);
export const channelAccessLabel = (code: string) =>
  code === "R"
    ? "Somente leitura"
    : code === "W"
      ? "Somente escrita"
      : code === "RW"
        ? "Leitura e escrita"
        : code;
