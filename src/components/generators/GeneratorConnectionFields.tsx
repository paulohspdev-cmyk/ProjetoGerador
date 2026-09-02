import { Settings2 } from "lucide-react";

import type { GeneratorTransport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NetworkDiscoveryPanel } from "./NetworkDiscoveryPanel";

export const connectionOptions: Array<{
  id: GeneratorTransport;
  title: string;
  description: string;
}> = [
  { id: "reverse_tcp", title: "Modem / 4G", description: "O modem inicia a conexão." },
  { id: "modbus_tcp_direct", title: "Ethernet / VPN", description: "Acesso direto por IP." },
  { id: "rtu_over_tcp", title: "Gateway Ethernet", description: "Barramento RTU via TCP." },
];

type Props = {
  transport: GeneratorTransport;
  setTransport: (value: GeneratorTransport) => void;
  host: string;
  setHost: (value: string) => void;
  tag: string;
  setTag: (value: string) => void;
  listenPort: string;
  setListenPort: (value: string) => void;
  modbusUnit: string;
  setModbusUnit: (value: string) => void;
  rapidDeviceNum: string;
  setRapidDeviceNum: (value: string) => void;
  suggestedTag: string;
  suggestedPort: number;
  advanced: boolean;
  setAdvanced: (value: boolean) => void;
  canScan: boolean;
  setError: (value: string | null) => void;
};

export function GeneratorConnectionFields(props: Props) {
  const effectivePort = Number(
    props.listenPort ||
      (props.transport === "reverse_tcp"
        ? props.suggestedPort
        : props.transport === "modbus_tcp_direct"
          ? 502
          : 0),
  );
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Como este gerador se conecta?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {connectionOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                props.setTransport(option.id);
                if (option.id === "modbus_tcp_direct" && !props.listenPort)
                  props.setListenPort("502");
                props.setError(null);
              }}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                props.transport === option.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-secondary/40",
              )}
            >
              <b className="text-sm">{option.title}</b>
              <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      {props.transport !== "reverse_tcp" && (
        <>
          <label className="block text-sm font-semibold">
            Endereço do equipamento
            <input
              value={props.host}
              onChange={(event) => props.setHost(event.target.value)}
              placeholder="IP da controladora ou gateway"
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              required
            />
          </label>
          {props.canScan && (
            <NetworkDiscoveryPanel
              port={effectivePort || 502}
              onSelect={props.setHost}
              onError={props.setError}
            />
          )}
        </>
      )}

      <div className="rounded-xl border border-online/30 bg-online/8 p-3 text-sm">
        <b>Configuração automática</b>
        <p className="mt-1 text-xs text-muted-foreground">
          O sistema escolhe identificação, porta e canal. Use o modo avançado quando a instalação
          exigir valores específicos.
        </p>
      </div>

      <button
        type="button"
        onClick={() => props.setAdvanced(!props.advanced)}
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <Settings2 className="size-4" />
        {props.advanced ? "Ocultar opções avançadas" : "Opções avançadas"}
      </button>

      {props.advanced && (
        <div className="grid gap-3 rounded-xl border border-border bg-background/35 p-3 sm:grid-cols-2">
          <Field
            label="Identificação"
            value={props.tag}
            placeholder={props.suggestedTag}
            onChange={(value) => props.setTag(value.toUpperCase())}
          />
          <Field
            label="Porta TCP"
            value={props.listenPort}
            placeholder={String(props.transport === "reverse_tcp" ? props.suggestedPort : 502)}
            numeric
            onChange={props.setListenPort}
          />
          <Field
            label="Unit ID Modbus"
            value={props.modbusUnit}
            numeric
            onChange={props.setModbusUnit}
          />
          <Field
            label="Identificador de telemetria"
            value={props.rapidDeviceNum}
            placeholder="Automático"
            numeric
            onChange={props.setRapidDeviceNum}
          />
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  numeric,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  numeric?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <input
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        onChange={(event) =>
          onChange(numeric ? event.target.value.replace(/\D/g, "") : event.target.value)
        }
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}
