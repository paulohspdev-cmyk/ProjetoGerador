import { httpRequest } from "@/lib/http-client";

export type ModemAdmission = {
  remotePort: number;
  remoteIp: string;
  firstSeenAt: number;
  lastSeenAt: number;
  acceptedCount: number;
  rejectedCount: number;
  peerCount: number;
  state: "pending" | "approved" | "rejected" | string;
  fieldDeviceId?: string | null;
  fieldDeviceName?: string;
  reason?: string;
};

export type ModemAdmissionPayload = {
  name: string;
  model: string;
  serial: string;
  imei: string;
  sim_iccid: string;
  carrier: string;
  metadata: Record<string, unknown>;
};

// O cadastro de inventário não é uma aprovação de acesso da bridge.
// Somente estas rotas persistem a decisão de admissão e a porta TCP.
export const modemAdmissionApi = {
  list: () => httpRequest<ModemAdmission[]>("/api/modem-admissions"),
  approve: (remotePort: number, payload: ModemAdmissionPayload) =>
    httpRequest<ModemAdmission>(
      `/api/modem-admissions/${encodeURIComponent(String(remotePort))}/approve`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  reject: (remotePort: number, reason = "") =>
    httpRequest<ModemAdmission>(
      `/api/modem-admissions/${encodeURIComponent(String(remotePort))}/reject`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  reopen: (remotePort: number) =>
    httpRequest<ModemAdmission | null>(
      `/api/modem-admissions/${encodeURIComponent(String(remotePort))}/reopen`,
      { method: "POST" },
    ),
};
