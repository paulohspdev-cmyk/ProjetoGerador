import { Info } from "lucide-react";
import { useTheme } from "@/layout/ThemeProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import {
  ActionBtn,
  Panel,
  Pill,
  ScadaTable,
  ScreenBody,
  Stats,
  Tone,
} from "./kit";

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
            <p className="text-[11px] text-muted-foreground">
              Preferência visual local; não altera configuração industrial.
            </p>
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
      <Stats
        items={[{ icon: Info, label: "Backups", value: backups.length }]}
      />
      <Panel
        title="Backups reais"
        actions={<ActionBtn onClick={runBackup}>Fazer backup agora</ActionBtn>}
      >
        {!backups.length && (
          <p className="text-[12px] text-muted-foreground">
            Nenhum backup executado.
          </p>
        )}
        {!!backups.length && (
          <ScadaTable
            rows={backups}
            columns={[
              { label: "Quando", render: (r) => r.when },
              { label: "Tipo", render: (r) => r.type },
              { label: "Tamanho", render: (r) => r.size },
              {
                label: "Resultado",
                render: (r) => (
                  <Tone tone={r.result === "OK" ? "ok" : "warn"}>
                    {r.result}
                  </Tone>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </ScreenBody>
  );
}
