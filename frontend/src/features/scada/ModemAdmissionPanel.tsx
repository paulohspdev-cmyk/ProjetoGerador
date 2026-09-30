import type { BridgePeerObservation } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable } from "./kit";

export type ModemAdmissionRow = BridgePeerObservation & { id: string };

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
  onApprove: (peer: BridgePeerObservation) => void;
  onReject: (peer: BridgePeerObservation) => void;
}) {
  return (
    <Panel title="Aguardando aprovação">
      {!rows.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum modem novo aguardando aprovação.
        </p>
      ) : (
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Entrada", render: (peer) => <b>TCP {peer.remotePort}</b> },
            { label: "Origem", render: (peer) => peer.remoteIp },
            { label: "Primeiro acesso", render: (peer) => dateTime(peer.firstSeenAt) },
            {
              label: "Último acesso",
              render: (peer) => {
                const connected = Date.now() / 1000 - peer.lastSeenAt <= 30;
                return (
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone={connected ? "ok" : "muted"}>
                      {connected ? "Conectado" : "Sem atividade"}
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
