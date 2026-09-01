import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Generator } from "@/data/generators";
import { useGenerators } from "./GeneratorsProvider";

export function GeneratorEditDialog({
  generator,
  trigger,
}: {
  generator: Generator;
  trigger?: ReactNode;
}) {
  const { can } = useAuth();
  const { updateGenerator } = useGenerators();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(generator.name?.trim() || generator.tag);
  const [site, setSite] = useState(generator.site);
  const [enabled, setEnabled] = useState(generator.enabled !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(generator.name?.trim() || generator.tag);
    setSite(generator.site);
    setEnabled(generator.enabled !== false);
    setError(null);
  }, [generator, open]);

  if (!can("edit")) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !site.trim()) {
      setError("Informe o nome e a unidade.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateGenerator(generator.id, {
      name: name.trim(),
      site: site.trim(),
      enabled,
    });
    setSaving(false);
    if (result) {
      setError(result);
      return;
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-secondary"
          >
            <Pencil className="size-3.5" /> Editar
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle>Editar gerador</DialogTitle>
          <DialogDescription>
            Altere nome, unidade e estado do cadastro. Tag, porta, Unit ID e identidade Rapid ficam
            protegidos para não alterar a comunicação industrial por engano.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm font-semibold">
            Nome do gerador
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              maxLength={160}
              required
            />
          </label>

          <label className="block text-sm font-semibold">
            Unidade
            <input
              value={site}
              onChange={(event) => setSite(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              required
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <b className="block text-sm">Cadastro ativo</b>
              <span className="text-xs text-muted-foreground">
                Equipamentos desativados permanecem cadastrados, mas saem da operação.
              </span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4"
            />
          </label>

          <details className="rounded-xl border border-border bg-background/35 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground">
              Identidade técnica protegida
            </summary>
            <div className="mt-2 space-y-1">
              <p>Tag: {generator.tag}</p>
              <p>Controladora: {generator.controller}</p>
              <p>Comunicação: {generator.transport || "não informada"}</p>
              <p>Porta: {generator.listenPort ?? "automática"}</p>
              <p>Endereço Modbus: {generator.modbusUnit ?? "automático"}</p>
              <p>Rapid Device: {generator.rapidDeviceNum ?? "não provisionado"}</p>
            </div>
          </details>

          {error && <p className="text-sm text-offline">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="h-11 w-full rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
