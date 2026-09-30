import type { Page } from "@playwright/test";

export async function ensureApprovedModem(page: Page, remotePort: number) {
  return page.evaluate(async (port) => {
    const listResponse = await fetch("/api/field-devices?kind=modem", {
      credentials: "include",
    });
    if (!listResponse.ok) {
      throw new Error("falha ao listar modems E2E: " + String(listResponse.status));
    }
    const devices = (await listResponse.json()) as Array<{
      id: string;
      name: string;
      active?: boolean;
      status?: string;
      metadata?: Record<string, unknown>;
    }>;
    const existing = devices.find((item) => {
      const status = String(item.status || "").toLowerCase();
      const itemPort = Number(item.metadata?.["admissionPort"] || 0);
      return (
        item.active !== false &&
        (status === "approved_unlinked" || status === "approved_linked") &&
        itemPort === port
      );
    });
    if (existing) return existing;

    const response = await fetch("/api/field-devices", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "modem",
        name: "E2E-MDM-" + String(port),
        model: "E2E",
        serial: "",
        imei: "",
        sim_iccid: "",
        carrier: "E2E",
        host: "127.0.0.1",
        status: "approved_unlinked",
        metadata: {
          admissionPort: port,
          admissionIp: "127.0.0.1",
          fixture: true,
        },
      }),
    });
    if (!response.ok) {
      throw new Error("falha ao aprovar modem E2E: " + String(response.status));
    }
    return response.json();
  }, remotePort);
}
