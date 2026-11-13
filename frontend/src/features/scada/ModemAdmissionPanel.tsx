import type { ModemAdmission } from "./modem-admission-api";
import { ActionBtn, Panel, Pill, ScadaTable } from "./kit";

export type ModemAdmissionRow = ModemAdmission & { id: string };

function dateTime(epoch: number | null | undefined) {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString("pt-BR");
}

export function ModemAdmissionPanel({
  rows,
  onApprove,
  onReject,
}: {
  rows: ModemAdmissionRow[];
  onApprove: (peer: ModemAdmission) => void;
  onReject: (peer: ModemAdmission) => void;
}) {
  return (
    <Panel title="Aguardando aprovação">
      {!rows.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma porta observada está pendente de admissão.
        </p>
      ) : (
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Entrada", render: (peer) => <b>TCP {peer.remotePort}</b> },
            { label: "Origem observada", render: (peer) => peer.remoteIp || "—" },
            { label: "Tentativas", render: (peer) => `Aceitas: ${peer.acceptedCount} · Recusadas: ${peer.rejectedCount}` },
            { label: "Primeiro acesso", render: (peer) => dateTime(peer.firstSeenAt) },
            {
              label: "Último acesso",
              render: (peer) => {
                const recentlySeen =
                  peer.lastSeenAt > 0 && Date.now() / 1000 - peer.lastSeenAt <= 30;
                return (
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone={recentlySeen ? "info" : "muted"}>
                      {recentlySeen ? "Observação recente" : "Sem observação recente"}
                    </Pill>
                    <span>{dateTime(peer.lastSeenAt)}</span>
                  </span>
                );
              },
            },
            {
              label: "Ações",
              render: (peer) => (
                <span className="flex flex-wrap gap-1">
                  <ActionBtn onClick={() => onApprove(peer)}>Aceitar</ActionBtn>
                  <ActionBtn tone="danger" onClick={() => onReject(peer)}>
                    Rejeitar
                  </ActionBtn>
                </span>
              ),
            },
          ]}
        />
      )}
    </Panel>
  );
}
