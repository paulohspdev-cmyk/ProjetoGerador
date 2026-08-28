import { Cable, FlaskConical, HeartPulse, Info, Layers, Library, Package, Settings, Tags } from "lucide-react";

import { channels, health, manufacturers, protocols, scadaTags } from "@/data/scada";
import { useTheme } from "@/components/layout/ThemeProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, SwitchRow, Tone } from "./kit";

export function ChannelsScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Layers, label: "Canais", value: channels.length }, { icon: Layers, label: "OK", value: channels.filter((c) => c.status === "OK").length, tone: "text-online" }]} />
      <Panel title="Canais SCADA">
        <ScadaTable
          rows={channels}
          columns={[
            { label: "ID", render: (r) => <span className="num">{r.id}</span> },
            { label: "Nome", render: (r) => <b>{r.name}</b> },
            { label: "Protocolo", render: (r) => r.proto },
            { label: "Endpoint", render: (r) => <span className="num">{r.endpoint}</span> },
            { label: "Tags", render: (r) => r.tags },
            { label: "Status", render: (r) => <Pill tone={r.status === "OK" ? "ok" : "warn"}>{r.status}</Pill> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function TagsScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Tags, label: "Tags", value: scadaTags.length }]} />
      <Panel title="Mapa de tags">
        <ScadaTable
          rows={scadaTags}
          columns={[
            { label: "ID", render: (r) => <span className="num">{r.id}</span> },
            { label: "Tag", render: (r) => <b>{r.name}</b> },
            { label: "Tipo", render: (r) => r.type },
            { label: "Unidade", render: (r) => r.unit },
            { label: "Acesso", render: (r) => r.rw },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function TemplatesScreen() {
  return (
    <ScreenBody>
      <Panel title="Templates de tela">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {["Power Flow DSE", "Sinótico ComAp", "Barramento ATS", "Tanque + horímetro", "Alarmes críticos"].map((t) => (
            <div key={t} className="rounded-lg border border-border p-3">
              <p className="font-bold">{t}</p>
              <p className="text-[11px] text-muted-foreground">Aplicável a controladoras do parque</p>
            </div>
          ))}
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function RapidScadaScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Settings, label: "Instância", value: "RC-SCADA-01" }, { icon: Settings, label: "Projeto", value: "rc-geradores" }]} />
      <Panel title="Rapid SCADA">
        <div className="space-y-2">
          <SwitchRow id="rs-comm" label="Servidor de comunicação" desc="Porta 10000" />
          <SwitchRow id="rs-web" label="Servidor web" desc="HTTPS 443" />
          <SwitchRow id="rs-hist" label="Historiador" desc="Retenção 365 dias" />
          <SwitchRow id="rs-sim" label="Modo simulação" desc="Laboratório" on={false} />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function DiagnosticScreen() {
  return (
    <ScreenBody>
      <Panel title="Diagnóstico">
        <ScadaTable
          rows={health.map((h) => ({ id: h.name, ...h }))}
          columns={[
            { label: "Componente", render: (r) => <b>{r.name}</b> },
            { label: "Status", render: (r) => <Tone tone={r.status === "OK" ? "ok" : "warn"}>{r.status}</Tone> },
            { label: "Detalhe", render: (r) => r.detail },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function ManufacturersScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Library, label: "Fabricantes", value: manufacturers.length }]} />
      <Panel title="Fabricantes">
        <ScadaTable
          rows={manufacturers}
          columns={[
            { label: "Nome", render: (r) => <b>{r.name}</b> },
            { label: "País", render: (r) => r.country },
            { label: "Modelos", render: (r) => r.models },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function LibControllersScreen() {
  return (
    <ScreenBody>
      <Panel title="Biblioteca de controladoras">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {["DSE8610", "DSE7320 MKII", "DSE4520", "ComAp InteliLite 9", "ComAp InteliMains 150", "Deep Sea 6120"].map(
            (m) => (
              <div key={m} className="rounded-lg border border-border p-3">
                <p className="font-bold">{m}</p>
                <p className="text-[11px] text-muted-foreground">Pack de tags + sinótico + comandos START/STOP</p>
              </div>
            ),
          )}
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function ProtocolsScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Cable, label: "Protocolos", value: protocols.length }]} />
      <Panel title="Protocolos">
        <ScadaTable
          rows={protocols}
          columns={[
            { label: "Protocolo", render: (r) => <b>{r.name}</b> },
            { label: "Camada", render: (r) => r.layer },
            { label: "Packs", render: (r) => r.packs },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function PacksScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Package, label: "Controller Packs", value: 6 }]} />
      <Panel title="Controller Packs">
        <div className="space-y-2 text-[13px]">
          {["DSE86xx Modbus", "ComAp IL4/IL9", "ATS InteliMains", "Medição de tanque", "Bateria 12/24 V"].map((p) => (
            <div key={p} className="rounded-md border border-border px-3 py-2">
              {p}
            </div>
          ))}
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function LabScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: FlaskConical, label: "Simulador", value: "Ligado", tone: "text-online" }]} />
      <Panel title="Laboratório">
        <div className="space-y-2">
          <SwitchRow id="lab-mains" label="Simular falta de rede" desc="Força MAINS = 0 V" on={false} />
          <SwitchRow id="lab-start" label="Simular partida" desc="Sobe RPM / Hz em rampa" on={false} />
          <SwitchRow id="lab-alarm" label="Injetar alarme" desc="Temperatura alta GEN003" on={false} />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function HealthScreen() {
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: HeartPulse,
            label: "Serviços OK",
            value: `${health.filter((h) => h.status === "OK").length}/${health.length}`,
            tone: "text-online",
          },
        ]}
      />
      <Panel title="Saúde do sistema">
        <ScadaTable
          rows={health.map((h) => ({ id: h.name, ...h }))}
          columns={[
            { label: "Componente", render: (r) => <b>{r.name}</b> },
            { label: "Status", render: (r) => <Tone tone={r.status === "OK" ? "ok" : "warn"}>{r.status}</Tone> },
            { label: "Detalhe", render: (r) => r.detail },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function VersionScreen() {
  return (
    <ScreenBody>
      <Panel title="Versão do sistema">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Aplicação</p>
            <p className="num text-xl font-bold">SCADA v1.0.0</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Rapid SCADA</p>
            <p className="num text-xl font-bold">5.8.4</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Build</p>
            <p className="num text-xl font-bold">2026.08.27</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Licença</p>
            <p className="font-bold">RC Geradores · Produção</p>
          </div>
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <ScreenBody>
      <Panel title="Configurações">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setTheme(dark ? "light" : "dark")}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-secondary/40"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">Tema escuro</p>
              <p className="text-[11px] text-muted-foreground">SCADA industrial</p>
            </div>
            <span
              className={`num rounded-full px-2 py-0.5 text-[10px] font-bold ${dark ? "bg-online/20 text-online" : "bg-secondary text-muted-foreground"}`}
            >
              {dark ? "ON" : "OFF"}
            </span>
          </button>
          <SwitchRow id="cfg-sound" label="Som de alarme" desc="Prioridade falha/alarme" />
          <SwitchRow id="cfg-confirm" label="Confirmar comandos START/STOP" />
          <SwitchRow id="cfg-autoack" label="Auto ACK informativos" on={false} />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function BackupsScreen() {
  const { backups, runBackup } = useScadaOps();
  return (
    <ScreenBody>
      <Stats items={[{ icon: Info, label: "Backups", value: backups.length }]} />
      <Panel
        title="Backups"
        actions={<ActionBtn onClick={runBackup}>Fazer backup agora</ActionBtn>}
      >
        <ScadaTable
          rows={backups}
          columns={[
            { label: "Quando", render: (r) => r.when },
            { label: "Tipo", render: (r) => r.type },
            { label: "Tamanho", render: (r) => r.size },
            { label: "Resultado", render: (r) => <Tone tone="ok">{r.result}</Tone> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

