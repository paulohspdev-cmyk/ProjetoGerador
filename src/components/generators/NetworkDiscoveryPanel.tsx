import { useState } from "react";

import { industrialApi } from "@/lib/industrial-api";

export function NetworkDiscoveryPanel({
  port,
  onSelect,
  onError,
}: {
  port: number;
  onSelect: (host: string) => void;
  onError: (message: string | null) => void;
}) {
  const [cidr, setCidr] = useState("");
  const [results, setResults] = useState<Array<{ host: string; port: number; latencyMs: number }>>(
    [],
  );
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    if (!cidr.trim()) {
      onError("Informe a rede VPN/LAN em CIDR, por exemplo 10.40.10.0/24.");
      return;
    }
    setScanning(true);
    setResults([]);
    onError(null);
    try {
      const result = await industrialApi.discovery.modbusTcp(cidr.trim(), port || 502);
      setResults(result.found);
      if (!result.found.length)
        onError("Nenhum equipamento respondeu. Verifique rota/VPN, firewall e porta.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Falha na descoberta de rede.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-bold">Localizar controladora na VPN/LAN</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Informe a rede atrás do modem. A busca somente abre e fecha a conexão TCP; não lê nem
        escreve registradores.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={cidr}
          onChange={(event) => setCidr(event.target.value)}
          placeholder="10.40.10.0/24"
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button
          type="button"
          disabled={scanning}
          onClick={() => void scan()}
          className="h-10 rounded-md border border-border px-3 text-xs font-bold disabled:opacity-50"
        >
          {scanning ? "Procurando…" : "Procurar IP"}
        </button>
      </div>
      {results.length > 0 && (
        <div className="mt-2 space-y-1">
          {results.map((item) => (
            <button
              key={item.host}
              type="button"
              onClick={() => onSelect(item.host)}
              className="flex w-full justify-between rounded-md bg-secondary/60 px-3 py-2 text-xs"
            >
              <span>
                {item.host}:{item.port}
              </span>
              <span>{item.latencyMs} ms · usar este IP</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
