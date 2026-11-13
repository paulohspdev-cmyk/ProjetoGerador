export const triggerLabels: Record<string, string> = {
  generator_online: "Gerador conectado",
  generator_offline: "Gerador sem comunicação",
  generator_alert: "Gerador em alerta",
};
export const actionLabels: Record<string, string> = {
  notify: "Enviar notificação",
  work_order: "Criar ordem de serviço",
};
export const notificationStatusLabels: Record<string, string> = {
  queued: "Na fila",
  retry: "Nova tentativa",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Falha",
  cancelled: "Cancelada",
};
export const notificationChannelLabels: Record<string, string> = {
  panel: "Painel",
  email: "E-mail",
  whatsapp: "WhatsApp",
  webhook: "Webhook",
};
export function rulePartLabel(text: string, labels: Record<string, string>) {
  const separator = text.indexOf(":");
  if (separator < 0) return labels[text] ?? text;
  const code = text.slice(0, separator);
  const value = text.slice(separator + 1);
  return `${labels[code] ?? code}: ${value}`;
}

