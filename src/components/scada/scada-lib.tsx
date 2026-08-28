import { useEffect, useState } from "react";
import { Cable, FlaskConical, HeartPulse, Info, Layers, Library, Package, Settings, Tags } from "lucide-react";

import { useTheme } from "@/components/layout/ThemeProvider";
import {
  rcApi,
  type ChannelCatalogItem,
  type ControllerLibrary,
  type SystemDiagnostics,
} from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function useRemote<T>(loader: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((value) => { if (active) { setData(value); setError(""); } })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Falha ao consultar API"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return { data, error, loading };
}

function RemoteState({ loading, error, empty = false }: { loading: boolean; error: string; empty?: boolean }) {
  if (loading) return <p className="text-[12px] text-muted-foreground">Carregando dados reais…</p>;
  if (error) return <p className="text-[12px] text-offline">{error}</p>;
  if (empty) return <p className="text-[12px] text-muted-foreground">Nenhum dado disponível.</p>;
  return null;
}

export function ChannelsScreen() {
  const { data: rows, error, loading } = useRemote<ChannelCatalogItem[]>(() => rcApi.library.channels(), []);
  return (
    <ScreenBody>
      <Stats items={[{ icon: Layers, label: "Canais homologados", value: rows.length }]} />
      <Panel title="Canais Rapid SCADA / Controller Packs">
        <RemoteState loading={loading} error={error} empty={!rows.length} />
        {!!rows.length && <ScadaTable rows={rows} columns={[
          { label: "Canal", render: (r) => <span className="num">{r.cnl}</span> },
          { label: "Tag", render: (r) => <b>{r.name}</b> },
          { label: "Modelo", render: (r) => r.model },
          { label: "Escala", render: (r) => <span className="num">{r.scale}</span> },
          { label: "Acesso", render: (r) => <Pill tone={r.access === "R" ? "ok" : "warn"}>{r.access}</Pill> },
          { label: "Fonte", render: (r) => r.source },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

export function TagsScreen() {
  const { data: rows, error, loading } = useRemote<ChannelCatalogItem[]>(() => rcApi.library.channels(), []);
  return (
    <ScreenBody>
      <Stats items={[{ icon: Tags, label: "Tags homologadas", value: rows.length }]} />
      <Panel title="Mapa de tags real">
        <RemoteState loading={loading} error={error} empty={!rows.length} />
        {!!rows.length && <ScadaTable rows={rows} columns={[
          { label: "ID", render: (r) => <span className="num">{r.id}</span> },
          { label: "Tag", render: (r) => <b>{r.name}</b> },
          { label: "Modelo", render: (r) => r.model },
          { label: "Canal Rapid", render: (r) => <span className="num">{r.cnl}</span> },
          { label: "Acesso", render: (r) => r.access },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

export function TemplatesScreen() {
  const { data, error, loading } = useRemote<ControllerLibrary | null>(() => rcApi.library.get(), null);
  const packs = data?.packs.filter((p) => p.lifecycle === "production") ?? [];
  return (
    <ScreenBody>
      <Panel title="Templates vindos dos Controller Packs de produção">
        <RemoteState loading={loading} error={error} empty={!packs.length} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((p) => (
            <div key={p.packId} className="rounded-lg border border-border p-3">
              <p className="font-bold">{p.manufacturer} {p.model}</p>
              <p className="text-[11px] text-muted-foreground">
                {p.validatedTelemetry?.length ?? 0} telemetrias validadas · {p.status}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function RapidScadaScreen() {
  const { data, error, loading } = useRemote<SystemDiagnostics | null>(() => rcApi.system.diagnostics(), null);
  const services = data?.services.filter((s) => s.id.toLowerCase().includes("scada")) ?? [];
  return (
    <ScreenBody>
      <Stats items={[
        { icon: Settings, label: "Bindings", value: data?.rapid.bindingsExists ? "OK" : "N/D" },
        { icon: Settings, label: "Reader", value: data?.rapid.readerExists ? "OK" : "N/D" },
        { icon: Settings, label: "Communicator", value: data?.rapid.commConfigExists ? "OK" : "N/D" },
      ]} />
      <Panel title="Rapid SCADA">
        <RemoteState loading={loading} error={error} empty={!data} />
        {!!services.length && <ScadaTable rows={services} columns={[
          { label: "Serviço", render: (r) => <b>{r.name}</b> },
          { label: "Status", render: (r) => <Tone tone={r.status === "active" || r.status === "OK" ? "ok" : "warn"}>{r.status}</Tone> },
          { label: "Detalhe", render: (r) => r.detail || "—" },
        ]} />}
        {data && !services.length && <p className="text-[12px] text-muted-foreground">Serviços Rapid ainda não detectados nesta máquina.</p>}
      </Panel>
    </ScreenBody>
  );
}

export function DiagnosticScreen() {
  const { data, error, loading } = useRemote<SystemDiagnostics | null>(() => rcApi.system.diagnostics(), null);
  return (
    <ScreenBody>
      <Panel title="Diagnóstico real">
        <RemoteState loading={loading} error={error} empty={!data} />
        {data && <>
          <ScadaTable rows={data.services} columns={[
            { label: "Componente", render: (r) => <b>{r.name}</b> },
            { label: "Status", render: (r) => <Tone tone={r.status === "active" || r.status === "OK" ? "ok" : "warn"}>{r.status}</Tone> },
            { label: "Detalhe", render: (r) => r.detail || "—" },
          ]} />
          <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[12px]">
            <div className="rounded-md border border-border p-2">Memória: <b>{data.host.memory ? `${data.host.memory.usedPercent}%` : "N/D"}</b></div>
            <div className="rounded-md border border-border p-2">Disco: <b>{data.host.disk ? `${data.host.disk.usedPercent}%` : "N/D"}</b></div>
            <div className="rounded-md border border-border p-2">Geradores: <b>{data.generators.length}</b></div>
          </div>
        </>}
      </Panel>
    </ScreenBody>
  );
}

export function ManufacturersScreen() {
  const { data, error, loading } = useRemote<ControllerLibrary | null>(() => rcApi.library.get(), null);
  const rows = data?.manufacturers ?? [];
  return (
    <ScreenBody>
      <Stats items={[{ icon: Library, label: "Fabricantes reais", value: rows.length }]} />
      <Panel title="Fabricantes presentes nos manifests">
        <RemoteState loading={loading} error={error} empty={!rows.length} />
        {!!rows.length && <ScadaTable rows={rows} columns={[
          { label: "Nome", render: (r) => <b>{r.name}</b> },
          { label: "Modelos", render: (r) => r.models },
          { label: "Produção", render: (r) => <Tone tone={r.production ? "ok" : "muted"}>{r.production}</Tone> },
          { label: "Lab", render: (r) => r.lab },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

export function LibControllersScreen() {
  const { data, error, loading } = useRemote<ControllerLibrary | null>(() => rcApi.library.get(), null);
  const packs = data?.packs ?? [];
  return (
    <ScreenBody>
      <Panel title="Biblioteca de controladoras">
        <RemoteState loading={loading} error={error} empty={!packs.length} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((p) => (
            <div key={p.packId} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">{p.manufacturer} {p.model}</p>
                <Pill tone={p.lifecycle === "production" ? "ok" : "warn"}>{p.lifecycle}</Pill>
              </div>
              <p className="text-[11px] text-muted-foreground">{p.status}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {(p.transports ?? []).join(" · ") || "Sem transporte homologado"}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function ProtocolsScreen() {
  const { data, error, loading } = useRemote<ControllerLibrary | null>(() => rcApi.library.get(), null);
  const rows = data?.protocols ?? [];
  return (
    <ScreenBody>
      <Stats items={[{ icon: Cable, label: "Protocolos", value: rows.length }]} />
      <Panel title="Protocolos declarados nos packs">
        <RemoteState loading={loading} error={error} empty={!rows.length} />
        {!!rows.length && <ScadaTable rows={rows} columns={[
          { label: "Protocolo", render: (r) => <b>{r.name}</b> },
          { label: "Packs", render: (r) => r.packs },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

export function PacksScreen() {
  const { data, error, loading } = useRemote<ControllerLibrary | null>(() => rcApi.library.get(), null);
  return (
    <ScreenBody>
      <Stats items={[
        { icon: Package, label: "Controller Packs", value: data?.counts.total ?? 0 },
        { icon: Package, label: "Produção", value: data?.counts.production ?? 0, tone: "text-online" },
        { icon: FlaskConical, label: "Lab", value: data?.counts.lab ?? 0 },
      ]} />
      <Panel title="Controller Packs">
        <RemoteState loading={loading} error={error} empty={!data?.packs.length} />
        <div className="space-y-2 text-[13px]">
          {data?.packs.map((p) => (
            <div key={p.packId} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <span><b>{p.manufacturer} {p.model}</b> · {p.status}</span>
              <Pill tone={p.lifecycle === "production" ? "ok" : "warn"}>{p.lifecycle}</Pill>
            </div>
          ))}
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function LabScreen() {
  const { data, error, loading } = useRemote<ControllerLibrary | null>(() => rcApi.library.get(), null);
  const lab = data?.packs.filter((p) => p.lifecycle === "lab") ?? [];
  return (
    <ScreenBody>
      <Stats items={[{ icon: FlaskConical, label: "Packs em laboratório", value: lab.length }]} />
      <Panel title="Laboratório / investigação">
        <RemoteState loading={loading} error={error} empty={!lab.length} />
        <div className="space-y-2">
          {lab.map((p) => (
            <div key={p.packId} className="rounded-md border border-border p-3">
              <p className="font-bold">{p.manufacturer} {p.model}</p>
              <p className="text-[11px] text-muted-foreground">{p.notes || "Ainda não homologado para produção."}</p>
            </div>
          ))}
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function HealthScreen() {
  const { data, error, loading } = useRemote<SystemDiagnostics | null>(() => rcApi.system.diagnostics(), null);
  const ok = data?.services.filter((s) => s.status === "active" || s.status === "OK").length ?? 0;
  return (
    <ScreenBody>
      <Stats items={[{ icon: HeartPulse, label: "Serviços OK", value: data ? `${ok}/${data.services.length}` : "N/D", tone: data?.ok ? "text-online" : undefined }]} />
      <Panel title="Saúde do sistema">
        <RemoteState loading={loading} error={error} empty={!data} />
        {data && <ScadaTable rows={data.services} columns={[
          { label: "Componente", render: (r) => <b>{r.name}</b> },
          { label: "Status", render: (r) => <Tone tone={r.status === "active" || r.status === "OK" ? "ok" : "warn"}>{r.status}</Tone> },
          { label: "Detalhe", render: (r) => r.detail || "—" },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

export function VersionScreen() {
  const { data, error, loading } = useRemote<SystemDiagnostics["version"] | null>(() => rcApi.system.version(), null);
  return (
    <ScreenBody>
      <Panel title="Versão do sistema">
        <RemoteState loading={loading} error={error} empty={!data} />
        {data && <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["Aplicação", data.application],
            ["API", data.apiVersion],
            ["Git", data.gitSha || "N/D"],
            ["Branch", data.gitBranch || "N/D"],
            ["Rapid SCADA", data.rapidScada || "N/D"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="num text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>}
      </Panel>
    </ScreenBody>
  );
}

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <ScreenBody>
      <Panel title="Configurações da interface">
        <button
          type="button"
          onClick={() => setTheme(dark ? "light" : "dark")}
          className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-secondary/40"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Tema escuro</p>
            <p className="text-[11px] text-muted-foreground">Preferência visual local; não altera configuração industrial.</p>
          </div>
          <Pill tone={dark ? "ok" : "muted"}>{dark ? "ON" : "OFF"}</Pill>
        </button>
      </Panel>
    </ScreenBody>
  );
}

export function BackupsScreen() {
  const { backups, runBackup } = useScadaOps();
  return (
    <ScreenBody>
      <Stats items={[{ icon: Info, label: "Backups", value: backups.length }]} />
      <Panel title="Backups reais" actions={<ActionBtn onClick={runBackup}>Fazer backup agora</ActionBtn>}>
        {!backups.length && <p className="text-[12px] text-muted-foreground">Nenhum backup executado.</p>}
        {!!backups.length && <ScadaTable rows={backups} columns={[
          { label: "Quando", render: (r) => r.when },
          { label: "Tipo", render: (r) => r.type },
          { label: "Tamanho", render: (r) => r.size },
          { label: "Resultado", render: (r) => <Tone tone={r.result === "OK" ? "ok" : "warn"}>{r.result}</Tone> },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}
