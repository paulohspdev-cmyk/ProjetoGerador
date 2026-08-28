import { Bell, CalendarClock, Network, RefreshCcw, Router, Settings2, Signal } from "lucide-react";

import { buildControllers, buildGateways, buildModems } from "@/data/scada";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, SwitchRow, Tone } from "./kit";

export function ControllersScreen() {
  const { generators } = useGenerators();
  const controllers = buildControllers(generators);
  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Signal, label: "Controladoras", value: controllers.length },
          { icon: Signal, label: "Online", value: controllers.filter((c) => c.online).length, tone: "text-online" },
        ]}
      />
      <Panel title="Inventário de controladoras">
        <ScadaTable
          rows={controllers}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.gen}</b> },
            { label: "Modelo", render: (r) => r.model },
            { label: "Firmware", render: (r) => <span className="num">{r.fw}</span> },
            { label: "Protocolo", render: (r) => r.proto },
            { label: "IP", render: (r) => <span className="num">{r.ip}</span> },
            { label: "Link", render: (r) => <Tone tone={r.online ? "ok" : "err"}>{r.online ? "Online" : "Offline"}</Tone> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function ModemsScreen() {
  const { generators } = useGenerators();
  const modems = buildModems(generators);
  return (
    <ScreenBody>
      <Stats items={[{ icon: Router, label: "Modems", value: modems.length }]} />
      <Panel title="Modems celulares">
        <ScadaTable
          rows={modems}
          columns={[
            { label: "ID", render: (r) => <span className="num">{r.id}</span> },
            { label: "Site", render: (r) => r.site },
            { label: "Modelo", render: (r) => r.model },
            { label: "Tecnologia", render: (r) => r.tech },
            { label: "RSSI", render: (r) => <span className="num">{r.rssi} dBm</span> },
            { label: "Status", render: (r) => <Pill tone={r.status === "Online" ? "ok" : "err"}>{r.status}</Pill> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function GatewaysScreen() {
  const { generators } = useGenerators();
  const gateways = buildGateways(generators);
  return (
    <ScreenBody>
      <Stats items={[{ icon: Network, label: "Gateways", value: gateways.length }]} />
      <Panel title="Gateways de borda">
        <ScadaTable
          rows={gateways}
          columns={[
            { label: "ID", render: (r) => <span className="num">{r.id}</span> },
            { label: "Site", render: (r) => r.site },
            { label: "Modelo", render: (r) => r.model },
            { label: "Canais", render: (r) => r.channels },
            { label: "CPU", render: (r) => <span className="num">{r.cpu} %</span> },
            { label: "Uptime", render: (r) => r.uptime },
            { label: "Status", render: (r) => <Tone tone="ok">{r.status}</Tone> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function ConnectivityScreen() {
  const { generators } = useGenerators();
  const modems = buildModems(generators);
  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Signal, label: "Links 4G", value: modems.filter((m) => m.status === "Online").length, tone: "text-online" },
          { icon: Signal, label: "Latência média", value: "412 ms" },
        ]}
      />
      <Panel title="Conectividade por site">
        <ScadaTable
          rows={modems}
          columns={[
            { label: "Site", render: (r) => <b>{r.site}</b> },
            { label: "Modem", render: (r) => r.id },
            { label: "Sinal", render: (r) => <span className="num">{r.rssi} dBm</span> },
            { label: "Estado", render: (r) => r.status },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function CommunicationScreen() {
  return (
    <ScreenBody>
      <Panel title="Matriz de comunicação">
        <div className="grid gap-2 sm:grid-cols-2">
          <SwitchRow id="proto-modbus" label="Modbus TCP" desc="Polling 1 s · timeout 800 ms" />
          <SwitchRow id="proto-mqtt" label="MQTT" desc="QoS 1 · retain tags críticas" />
          <SwitchRow id="proto-snmp" label="SNMP traps" desc="Hospital Norte" />
          <SwitchRow id="proto-serial" label="Serial RTU" desc="Osasco COM3" on={true} />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function RulesScreen() {
  const { rules, toggleRule } = useScadaOps();
  return (
    <ScreenBody>
      <Stats items={[{ icon: Settings2, label: "Regras", value: rules.length }, { icon: Settings2, label: "Ativas", value: rules.filter((r) => r.enabled).length, tone: "text-online" }]} />
      <Panel title="Regras de automação">
        <ScadaTable
          rows={rules}
          columns={[
            { label: "ID", render: (r) => <span className="num">{r.id}</span> },
            { label: "Regra", render: (r) => <b>{r.name}</b> },
            { label: "Gatilho", render: (r) => r.trigger },
            { label: "Ação", render: (r) => r.action },
            { label: "Estado", render: (r) => <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "ON" : "OFF"}</Pill> },
            {
              label: "Controlo",
              render: (r) => (
                <ActionBtn onClick={() => toggleRule(r.id)}>{r.enabled ? "Desligar" : "Ligar"}</ActionBtn>
              ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function ExerciseScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: RefreshCcw, label: "Exercícios/semana", value: 4 }, { icon: RefreshCcw, label: "Último OK", value: "GEN008" }]} />
      <Panel title="Exercício automático">
        <div className="space-y-2">
          <SwitchRow id="ex-weekly" label="Exercício semanal" desc="Sábados 09:00 · 15 min em carga" />
          <SwitchRow id="ex-transfer" label="Transferência real" desc="Abrir MCB durante o teste" on={false} />
          <SwitchRow id="ex-abort" label="Abortar se alarme" desc="Não inicia com alarme ativo" />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function SchedulesScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: CalendarClock, label: "Agendamentos", value: 5 }]} />
      <Panel title="Agendamentos">
        <div className="space-y-2">
          <SwitchRow id="sch-backup" label="Backup 23:00" desc="Dump Rapid SCADA + configs" />
          <SwitchRow id="sch-report" label="Relatório diário 07:00" desc="E-mail operação" />
          <SwitchRow id="sch-erp" label="Sync ERP 06:30" desc="Horímetros e combustível" />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function NotificationsScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Bell, label: "Canais", value: 3 }]} />
      <Panel title="Notificações">
        <div className="space-y-2">
          <SwitchRow id="notif-email" label="E-mail" desc="alarmes@rcgeradores.com" />
          <SwitchRow id="notif-whatsapp" label="WhatsApp" desc="Grupo Operação RC" />
          <SwitchRow id="notif-push" label="Push no painel" desc="Som + badge" />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function EscalationScreen() {
  return (
    <ScreenBody>
      <Panel title="Escalonamento">
        <ol className="space-y-2 text-[13px]">
          <li className="rounded-md border border-border p-3">1. Operador de plantão — 0 min</li>
          <li className="rounded-md border border-border p-3">2. Supervisor — 10 min sem ACK</li>
          <li className="rounded-md border border-border p-3">3. Engenharia — 25 min · falha crítica</li>
          <li className="rounded-md border border-border p-3">4. Diretoria — 45 min · site offline</li>
        </ol>
      </Panel>
    </ScreenBody>
  );
}

