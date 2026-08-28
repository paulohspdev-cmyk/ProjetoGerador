import { Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "./GeneratorsProvider";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/auth";

export function canManageGenerators(can: (perm: Permission) => boolean) {
  return can("create") || can("remove");
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
  const { removeGenerator } = useGenerators();
  if (!canManageGenerators(can)) return null;

  return (
    <button
      type="button"
      aria-label={`Excluir ${tag}`}
      title="Excluir gerador"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-offline/15 hover:text-offline",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm(`Excluir o gerador ${tag}? Ele sairá dos cards compactos, horizontais e da lista.`)) {
          removeGenerator(id);
        }
      }}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
