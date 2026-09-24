import { Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { industrialApi } from "@/lib/industrial-api";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/auth";
import { useGenerators } from "./GeneratorsProvider";

// Mantido para o Sidebar: cadastrar geradores depende da permissão create.
export function canManageGenerators(can: (perm: Permission) => boolean) {
  return can("create");
}

export function DeleteGeneratorButton({
  id,
  tag,
  className,
}: {
  id: string;
  tag: string;
  className?: string;
}) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  if (!can("remove")) return null;

  return (
    <button
      type="button"
      aria-label={`Retirar ${tag}`}
      title="Retirar gerador com ciclo de vida seguro"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-offline/15 hover:text-offline",
        className,
      )}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        let lifecycle;
        try {
          lifecycle = await industrialApi.lifecycle.get(id);
        } catch (err) {
          window.alert(
            err instanceof Error ? err.message : "Falha ao verificar ciclo de vida do gerador.",
          );
          return;
        }
        const detail = lifecycle.provisioned
          ? "O equipamento está ativo na integração industrial. A retirada fará backup, desativará a comunicação preservando o histórico e só depois excluirá o cadastro."
          : "O equipamento não possui integração industrial ativa; somente o cadastro será retirado.";
        const typed = window.prompt(
          `${detail}\n\nPara confirmar, digite exatamente: RETIRAR ${tag}`,
        );
        if ((typed ?? "").trim().toUpperCase() !== `RETIRAR ${tag}`.toUpperCase()) return;
        try {
          const result = await industrialApi.lifecycle.retire(id, tag);
          await refresh();
          window.alert(
            result.deprovisioned
              ? `${tag} retirado. Configuração ativa removida e histórico Rapid preservado.`
              : `${tag} retirado do cadastro.`,
          );
        } catch (err) {
          window.alert(err instanceof Error ? err.message : "Falha ao retirar gerador.");
        }
      }}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
