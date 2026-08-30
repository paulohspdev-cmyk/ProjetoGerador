import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { CONTROLLER_MODELS, GEN_SITES, type Generator } from "@/data/generators";
import { ApiError, rcApi, type GeneratorTransport } from "@/lib/api";
import { industrialApi } from "@/lib/industrial-api";

type CreateInput = {
  tag?: string | undefined;
  controller: string;
  site: string;
  ip?: string | undefined;
  transport?: GeneratorTransport | undefined;
  listenPort?: number | undefined;
  modbusUnit?: number | undefined;
  rapidDeviceNum?: number | undefined;
};

type GeneratorsContextValue = {
  generators: Generator[];
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getById: (id: string) => Generator | undefined;
  addGenerator: (input: CreateInput) => Promise<string | null>;
  removeGenerator: (id: string) => Promise<string | null>;
};

const GeneratorsContext = createContext<GeneratorsContextValue | null>(null);

export function GeneratorsProvider({ children }: { children: ReactNode }) {
  const { ready: authReady, user } = useAuth();
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setGenerators([]);
      setError(null);
      setReady(authReady);
      return;
    }
    try {
      const list = await rcApi.generators.list();
      setGenerators(list);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setGenerators([]);
      }
      setError(err instanceof Error ? err.message : "Falha ao consultar o backend.");
    } finally {
      setReady(true);
    }
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setGenerators([]);
      setReady(true);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [authReady, refresh, user]);

  const getById = useCallback(
    (id: string) => generators.find((g) => g.id === id || g.tag.toLowerCase() === id.toLowerCase()),
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
      if (generators.some((g) => g.tag.toUpperCase() === tag))
        return "Já existe um gerador com esta tag.";

      try {
        const ip = input.ip?.trim();
        await rcApi.generators.create({
          tag,
          controller,
          site,
          ...(ip ? { ip } : {}),
          ...(input.transport ? { transport: input.transport } : {}),
          ...(input.listenPort != null ? { listenPort: input.listenPort } : {}),
          ...(input.modbusUnit != null ? { modbusUnit: input.modbusUnit } : {}),
          ...(input.rapidDeviceNum != null ? { rapidDeviceNum: input.rapidDeviceNum } : {}),
        });
        await refresh();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Falha ao cadastrar gerador.";
      }
    },
    [generators, refresh],
  );

  const removeGenerator = useCallback(
    async (id: string) => {
      const generator = generators.find((g) => g.id === id);
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
    () => ({ generators, ready, error, refresh, getById, addGenerator, removeGenerator }),
    [generators, ready, error, refresh, getById, addGenerator, removeGenerator],
  );

  return <GeneratorsContext.Provider value={value}>{children}</GeneratorsContext.Provider>;
}

export function useGenerators() {
  const ctx = useContext(GeneratorsContext);
  if (!ctx) throw new Error("useGenerators must be used within GeneratorsProvider");
  return ctx;
}

export { CONTROLLER_MODELS, GEN_SITES };
