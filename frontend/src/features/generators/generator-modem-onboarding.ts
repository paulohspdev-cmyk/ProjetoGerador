import type { FieldDevice } from "@/lib/api";

export function modemAdmissionPort(modem: FieldDevice | undefined) {
  return Number(modem?.metadata?.["admissionPort"] || 0);
}

export function approvedModems(rows: FieldDevice[]) {
  return rows.filter((modem) => {
    const status = String(modem.status || "").toLowerCase();
    return modem.active && (status === "approved_unlinked" || status === "approved_linked");
  });
}
