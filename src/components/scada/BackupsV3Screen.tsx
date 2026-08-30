import { Download, HardDriveDownload, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type BackupApi } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

export function BackupsV3Screen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<BackupApi[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setRows(await rcApi.backups.list()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar backups."); }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setBusy(true); setError("");
    try { await rcApi.backups.create(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar backup."); }
    finally { setBusy(false); }
  };
  const remove = async (row: BackupApi) => {
    if (!window.confirm(`Excluir definitivamente o backup ${row.id}?`)) return;
    try { await rcApi.backups.remove(row.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao excluir backup."); }
  };

  return <ScreenBody>
    <Stats items={[
      { icon: HardDriveDownload, label: "Backups", value: rows.length },
      { icon: HardDriveDownload, label: "Com resultado OK", value: rows.filter((row) => row.result === "OK").length, tone: "text-online" },
    ]} />
    <p className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-muted-foreground">Restauração não é executada pela própria API em produção. O restore continua no runbook/CLI da VM, com serviços parados, validação do arquivo e rollback. Isso evita restaurar o banco por uma requisição HTTP enquanto o sistema está ativo.</p>
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    <Panel title="Backups persistidos" actions={<span className="flex gap-1">{admin && <ActionBtn disabled={busy} onClick={() => void create()}>{busy ? "Executando…" : "Fazer backup agora"}</ActionBtn>}<ActionBtn onClick={() => void load()}><RefreshCcw className="mr-1 inline size-3" />Atualizar</ActionBtn></span>}>
      {!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum backup registrado.</p> : <ScadaTable rows={rows} columns={[
        { label: "Quando", render: (r) => <span className="num">{r.when}</span> },
        { label: "Tipo", render: (r) => r.type },
        { label: "Tamanho", render: (r) => <span className="num">{r.size}</span> },
        { label: "Resultado", render: (r) => <Pill tone={r.result === "OK" ? "ok" : "warn"}>{r.result}</Pill> },
        { label: "Ações", render: (r) => <span className="flex gap-1"><ActionBtn onClick={() => void rcApi.backups.download(r.id).catch((err) => setError(err instanceof Error ? err.message : "Falha no download."))}><Download className="mr-1 inline size-3" />Baixar</ActionBtn>{admin && <ActionBtn tone="danger" onClick={() => void remove(r)}><Trash2 className="mr-1 inline size-3" />Excluir</ActionBtn>}</span> },
      ]} />}
    </Panel>
  </ScreenBody>;
}
