import { type FormEvent, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CONTROLLER_MODELS, GEN_SITES, nextGeneratorTag } from "@/data/generators";
import { useGenerators } from "./GeneratorsProvider";
import { cn } from "@/lib/utils";

export function RegisterGeneratorButton({
  collapsed,
  touchFriendly,
  onNavigate,
}: {
  collapsed?: boolean | undefined;
  touchFriendly?: boolean | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const { generators, addGenerator } = useGenerators();
  const [open, setOpen] = useState(false);
  const preview = useMemo(() => nextGeneratorTag(generators).tag, [generators]);
  const [tag, setTag] = useState("");
  const [controller, setController] = useState(CONTROLLER_MODELS[0]!);
  const [site, setSite] = useState(GEN_SITES[0]!);
  const [ip, setIp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTag("");
    setController(CONTROLLER_MODELS[0]!);
    setSite(GEN_SITES[0]!);
    setIp("");
    setError(null);
    setSaving(false);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const err = await addGenerator({ tag: tag || preview, controller, site, ip });
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    reset();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        title={collapsed ? "Cadastrar gerador" : undefined}
        onClick={() => {
          setOpen(true);
          onNavigate?.();
        }}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          touchFriendly ? "min-h-11 py-2" : "py-1.5",
          collapsed && "justify-center px-0",
        )}
      >
        <Plus className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        {!collapsed && <span className="truncate">Cadastrar gerador</span>}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Cadastrar gerador</DialogTitle>
            <DialogDescription>
              O cadastro é salvo no backend RC Geradores. A telemetria passa a aparecer quando existir binding homologado no Rapid SCADA.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-3">
            <label className="text-[12px] font-semibold text-muted-foreground">
              Tag
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
                placeholder={preview}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[12px] font-semibold text-muted-foreground">
              Controladora
              <select
                value={controller}
                onChange={(e) => setController(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {CONTROLLER_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold text-muted-foreground">
              Site
              <select
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {GEN_SITES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold text-muted-foreground">
              IP / identificação de rede
              <input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="10.50.1.130"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            {error && <p className="text-[12px] text-offline">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="mt-1 h-9 rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Cadastrando..." : "Cadastrar"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
