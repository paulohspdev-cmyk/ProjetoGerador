import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { CONTROLLER_MODELS, GEN_SITES, type Generator } from "@/data/generators";
import { ApiError, rcApi, type GeneratorTransport } from "@/lib/api";
import { httpRequest } from "@/lib/http-client";
import { industrialApi } from "@/lib/industrial-api";

// Atualização operacional do inventário/overlay; não altera a cadência de comunicação do controlador.
const GENERATOR_REFRESH_MS = 1000;

type CreateInput = {
  tag?: string | undefined;
  name?: string | undefined;
  customer?: string | undefined;
  controller: string;
  site: string;
  ip?: string | undefined;
  transport?: GeneratorTransport | undefined;
  listenPort?: number | undefined;
  modbusUnit?: number | undefined;
  rapidDeviceNum?: number | undefined;
};

type UpdateInput = Partial<CreateInput> & { enabled?: boolean | undefined };

type GeneratorsContextValue = {
  generators: Generator[];
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getById: (id: string) => Generator | undefined;
  addGenerator: (input: CreateInput) => Promise<string | null>;
  updateGenerator: (id: string, input: UpdateInput) => Promise<string | null>;
  removeGenerator: (id: string) => Promise<string | null>;
};

const GeneratorsContext = createContext<GeneratorsContextValue | null>(null);

export function GeneratorsProvider({ children }: { children: ReactNode }) {
  const { ready: authReady, user } = useAuth();
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setGenerators([]);
      setError(null);
      setReady(authReady);
      return;
    }

    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const generation = ++refreshGeneration.current;
    const operation = (async () => {
      try {
        const list = await rcApi.generators.list();
        if (generation !== refreshGeneration.current) return;
        setGenerators(list);
        setError(null);
      } catch (err) {
        if (generation !== refreshGeneration.current) return;
        if (err instanceof ApiError && err.status === 401) {
          setGenerators([]);
        }
        setError(err instanceof Error ? err.message : "Falha ao consultar o backend.");
      } finally {
        if (generation === refreshGeneration.current) {
          setReady(true);
        }
      }
    })();

    refreshInFlight.current = operation;
    try {
      await operation;
    } finally {
      if (refreshInFlight.current === operation) {
        refreshInFlight.current = null;
      }
    }
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      refreshGeneration.current += 1;
      refreshInFlight.current = null;
      setGenerators([]);
      setReady(true);
      return;
    }

    let stopped = false;
    let timer: number | null = null;

    const schedule = () => {
      if (stopped) return;
      timer = window.setTimeout(async () => {
        if (!document.hidden) {
          await refresh();
        }
        schedule();
      }, GENERATOR_REFRESH_MS);
    };

    void refresh().finally(schedule);
    return () => {
      stopped = true;
      refreshGeneration.current += 1;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [authReady, refresh, user]);

  const getById = useCallback(
    (id: string) =>
      generators.find(
        (generator) => generator.id === id || generator.tag.toLowerCase() === id.toLowerCase(),
      ),
    [generators],
  );

  const addGenerator = useCallback(
    async (input: CreateInput) => {
      const controller = input.controller.trim();
      const site = input.site.trim();
      if (!controller) return "Informe a controladora.";
      if (!site) return "Informe o site.";
      const tag = (input.tag?.trim() || "").toUpperCase();
      if (!tag) return "Informe a tag.";
      if (generators.some((generator) => generator.tag.toUpperCase() === tag))
        return "Já existe um gerador com esta tag.";

      try {
        const ip = input.ip?.trim();
        const name = input.name?.trim();
        const customer = input.customer?.trim();
        await httpRequest<Generator>("/api/generators", {
          method: "POST",
          body: JSON.stringify({
            tag,
            controller,
            site,
            ...(name ? { name } : {}),
            ...(customer ? { customer } : {}),
            ...(ip ? { ip } : {}),
            ...(input.transport ? { transport: input.transport } : {}),
            ...(input.listenPort != null ? { listenPort: input.listenPort } : {}),
            ...(input.modbusUnit != null ? { modbusUnit: input.modbusUnit } : {}),
            ...(input.rapidDeviceNum != null ? { rapidDeviceNum: input.rapidDeviceNum } : {}),
          }),
        });
        await refresh();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Falha ao cadastrar gerador.";
      }
    },
    [generators, refresh],
  );

  const updateGenerator = useCallback(
    async (id: string, input: UpdateInput) => {
      try {
        const payload = {
          ...(input.tag != null ? { tag: input.tag.trim().toUpperCase() } : {}),
          ...(input.name != null ? { name: input.name.trim() } : {}),
          ...(input.customer != null ? { customer: input.customer.trim() } : {}),
          ...(input.site != null ? { site: input.site.trim() } : {}),
          ...(input.ip != null ? { ip: input.ip.trim() } : {}),
          ...(input.transport != null ? { transport: input.transport } : {}),
          ...(input.listenPort != null ? { listenPort: input.listenPort } : {}),
          ...(input.modbusUnit != null ? { modbusUnit: input.modbusUnit } : {}),
          ...(input.rapidDeviceNum != null ? { rapidDeviceNum: input.rapidDeviceNum } : {}),
          ...(input.enabled != null ? { enabled: input.enabled } : {}),
        };
        await httpRequest<Generator>(`/api/generators/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        await refresh();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Falha ao editar gerador.";
      }
    },
    [refresh],
  );

  const removeGenerator = useCallback(
    async (id: string) => {
      const generator = generators.find((item) => item.id === id);
      if (!generator) return "Gerador não encontrado.";
      try {
        await industrialApi.lifecycle.retire(generator.id, generator.tag);
        await refresh();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Falha ao retirar gerador com segurança.";
      }
    },
    [generators, refresh],
  );

  const value = useMemo(
    () => ({
      generators,
      ready,
      error,
      refresh,
      getById,
      addGenerator,
      updateGenerator,
      removeGenerator,
    }),
    [generators, ready, error, refresh, getById, addGenerator, updateGenerator, removeGenerator],
  );

  return <GeneratorsContext.Provider value={value}>{children}</GeneratorsContext.Provider>;
}

export function useGenerators() {
  const ctx = useContext(GeneratorsContext);
  if (!ctx) throw new Error("useGenerators must be used within GeneratorsProvider");
  return ctx;
}

export { CONTROLLER_MODELS, GEN_SITES };
