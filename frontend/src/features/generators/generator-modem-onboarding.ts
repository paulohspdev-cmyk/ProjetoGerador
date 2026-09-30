import { rcApi, type FieldDevice } from "@/lib/api";

export function modemAdmissionPort(modem: FieldDevice | undefined) {
  return Number(modem?.metadata?.["admissionPort"] || 0);
}

export function approvedModems(rows: FieldDevice[]) {
  return rows.filter((modem) => {
    const status = String(modem.status || "").toLowerCase();
    return (
      modem.active &&
      (status === "approved_unlinked" || status === "approved_linked") &&
      modemAdmissionPort(modem) > 0
    );
  });
}

export async function markModemLinked(modem: FieldDevice, generatorId: string) {
  const linkedGeneratorIds = Array.isArray(modem.metadata?.["linkedGeneratorIds"])
    ? modem.metadata["linkedGeneratorIds"].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];
  if (!linkedGeneratorIds.includes(generatorId)) linkedGeneratorIds.push(generatorId);
  await rcApi.fieldDevices.update(modem.id, {
    status: "approved_linked",
    metadata: {
      ...(modem.metadata || {}),
      linkedGeneratorIds,
    },
  });
}
