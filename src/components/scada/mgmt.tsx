import { Building2, Mail, MessageCircle, Plug, ScrollText, ShieldCheck, UserCog, Users, Webhook } from "lucide-react";
import { type FormEvent, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABEL, ROLE_META, type UserRole } from "@/lib/auth";
import { auditLog, gensBySite } from "@/data/scada";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, SwitchRow, Tone } from "./kit";

export function ClientsScreen() {
  const { clients, addClient } = useScadaOps();
  const [name, setName] = useState("");
  const [units, setUnits] = useState("1");
  const [gens, setGens] = useState("1");
  const [sla, setSla] = useState("99,0%");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    addClient({ name, units: Number(units) || 1, gens: Number(gens) || 1, sla });
    setName("");
  };

  return (
    <ScreenBody>
      <Stats items={[{ icon: Users, label: "Clientes", value: clients.length }]} />
      <Panel title="Cadastrar cliente">
        <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-[11px] font-semibold text-muted-foreground">
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Unidades
            <input
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Geradores
            <input
              value={gens}
              onChange={(e) => setGens(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            SLA
            <input
              value={sla}
              onChange={(e) => setSla(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90">
              Cadastrar
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Clientes">
        <ScadaTable
          rows={clients}
          columns={[
            { label: "Cliente", render: (r) => <b>{r.name}</b> },
            { label: "Unidades", render: (r) => r.units },
            { label: "Geradores", render: (r) => r.gens },
            { label: "SLA", render: (r) => <span className="num">{r.sla}</span> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function UnitsScreen() {
  const { generators } = useGenerators();
  const units = gensBySite(generators);
  return (
    <ScreenBody>
      <Stats items={[{ icon: Building2, label: "Unidades", value: units.length }]} />
      <Panel title="Unidades">
        <ScadaTable
          rows={units}
          columns={[
            { label: "Unidade", render: (r) => <b>{r.name}</b> },
            { label: "Cidade", render: (r) => r.city },
            { label: "Geradores", render: (r) => r.total },
            { label: "Online", render: (r) => <Tone tone="ok">{r.online}</Tone> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function UsersScreen() {
  const { users, can, createUser, updateUser, removeUser } = useAuth();
  const canCreate = can("create") && can("manageUsers");
  const canEdit = can("edit") && can("manageUsers");
  const canRemove = can("remove") && can("manageUsers");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("visualizacao");
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    const err = createUser({ name, email, password, role });
    if (err) {
      setOk(false);
      setMsg(err);
      return;
    }
    setOk(true);
    setMsg("Usuário cadastrado.");
    setName("");
    setEmail("");
    setPassword("");
    setRole("visualizacao");
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: UserCog, label: "Usuários", value: users.length },
          { icon: ShieldCheck, label: "Ativos", value: users.filter((u) => u.active).length, tone: "text-online" },
        ]}
      />

      {canCreate && (
        <Panel title="Cadastrar usuário">
          <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Senha
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Perfil
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="visualizacao">Visualização</option>
                <option value="cadastro">Cadastro</option>
                <option value="administrador">Administrador</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                Cadastrar
              </button>
            </div>
          </form>
          {msg && (
            <p className={`mt-2 text-[12px] ${ok ? "text-online" : "text-offline"}`}>{msg}</p>
          )}
        </Panel>
      )}

      {!canCreate && (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">
          Seu perfil é somente visualização. Não é possível cadastrar usuários.
        </p>
      )}

      <Panel title="Usuários">
        <ScadaTable
          rows={users}
          columns={[
            { label: "Nome", render: (r) => <b>{r.name}</b> },
            { label: "E-mail", render: (r) => <span className="num">{r.email}</span> },
            { label: "Perfil", render: (r) => ROLE_LABEL[r.role] },
            {
              label: "Status",
              render: (r) => (
                <Tone tone={r.active ? "ok" : "muted"}>{r.active ? "Ativo" : "Inativo"}</Tone>
              ),
            },
            { label: "Último acesso", render: (r) => r.lastAccess ?? "—" },
            {
              label: "Ações",
              render: (r) =>
                canEdit || canRemove ? (
                  <span className="flex flex-wrap gap-1">
                    {canEdit && (
                      <button
                        type="button"
                        className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-secondary"
                        onClick={() => updateUser(r.id, { active: !r.active })}
                      >
                        {r.active ? "Desativar" : "Ativar"}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        className="rounded border border-offline/40 px-2 py-0.5 text-[11px] text-offline hover:bg-offline/10"
                        onClick={() => removeUser(r.id)}
                      >
                        Excluir
                      </button>
                    )}
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function RolesScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: ShieldCheck, label: "Perfis", value: ROLE_META.length }]} />
      <Panel title="Perfis e permissões">
        <ScadaTable
          rows={ROLE_META}
          columns={[
            { label: "Perfil", render: (r) => <b>{r.name}</b> },
            { label: "Permissões", render: (r) => r.perms },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function AuditScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: ScrollText, label: "Eventos de auditoria", value: auditLog.length }]} />
      <Panel title="Auditoria">
        <ScadaTable
          rows={auditLog}
          columns={[
            { label: "Quando", render: (r) => <span className="num">{r.at}</span> },
            { label: "Usuário", render: (r) => r.user },
            { label: "Ação", render: (r) => r.action },
            { label: "Alvo", render: (r) => <b>{r.target}</b> },
            { label: "IP", render: (r) => <span className="num">{r.ip}</span> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function ApiScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Plug, label: "Tokens ativos", value: 2 }]} />
      <Panel title="API">
        <div className="space-y-2 text-[13px]">
          <p className="rounded-md border border-border p-3">
            Base URL <span className="num">https://scada.rcgeradores.com/api/v1</span>
          </p>
          <p className="rounded-md border border-border p-3">Auth: Bearer JWT · escopos ops.read, ops.command</p>
          <p className="rounded-md border border-border p-3">Rate limit: 120 req/min por token</p>
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function WebhooksScreen() {
  const { webhooks, toggleWebhook } = useScadaOps();
  return (
    <ScreenBody>
      <Stats items={[{ icon: Webhook, label: "Webhooks", value: webhooks.length }]} />
      <Panel title="Webhooks">
        <ScadaTable
          rows={webhooks}
          columns={[
            { label: "Evento", render: (r) => <b>{r.event}</b> },
            { label: "URL", render: (r) => <span className="num text-[11px]">{r.url}</span> },
            { label: "Status", render: (r) => <Pill tone={r.status === "Ativo" ? "ok" : "muted"}>{r.status}</Pill> },
            {
              label: "Controlo",
              render: (r) => (
                <ActionBtn onClick={() => toggleWebhook(r.id)}>{r.status === "Ativo" ? "Pausar" : "Ativar"}</ActionBtn>
              ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function EmailScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: Mail, label: "SMTP", value: "OK", tone: "text-online" }]} />
      <Panel title="E-mail">
        <div className="space-y-2">
          <SwitchRow id="email-smtp" label="SMTP" desc="smtp.rcgeradores.com:587" />
          <SwitchRow id="email-digest" label="Digest diário" desc="07:00 para operação" />
          <SwitchRow id="email-crit" label="Alarmes críticos" desc="To: plantao@rcgeradores.com" />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function WhatsAppScreen() {
  return (
    <ScreenBody>
      <Stats items={[{ icon: MessageCircle, label: "WhatsApp", value: "Conectado", tone: "text-online" }]} />
      <Panel title="WhatsApp">
        <div className="space-y-2">
          <SwitchRow id="wa-ops" label="Grupo Operação" desc="Falhas e ACK" />
          <SwitchRow id="wa-maint" label="Grupo Manutenção" desc="OS urgentes" />
          <SwitchRow id="wa-cmd" label="Confirmação de comando" desc="START/STOP via chat" on={false} />
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function ErpScreen() {
  return (
    <ScreenBody>
      <Panel title="ERP / BMS / outros">
        <div className="space-y-2">
          <SwitchRow id="erp-fuel" label="ERP combustível" desc="Exporta tanques 06:30" />
          <SwitchRow id="erp-bms" label="BMS Shopping Leste" desc="BACnet/IP → kW e status" />
          <SwitchRow id="erp-cmms" label="CMMS" desc="Abre OS automática se manut. < 80 h" />
        </div>
      </Panel>
    </ScreenBody>
  );
}
