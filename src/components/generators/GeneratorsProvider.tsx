import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { CONTROLLER_MODELS, GEN_SITES, type Generator } from "@/data/generators";
import { rcApi, type GeneratorTransport } from "@/lib/api";

type CreateInput = {
  tag?: string;
  controller: string;
  site: string;
  ip?: string;
  transport?: GeneratorTransport;
  listenPort?: number;
  modbusUnit?: number;
  rapidDeviceNum?: number;
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
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await rcApi.generators.list();
      setGenerators(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar o backend.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

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
      if (generators.some((g) => g.tag.toUpperCase() === tag)) {
        return "Já existe um gerador com esta tag.";
      }

      try {
        await rcApi.generators.create({
          tag,
          controller,
          site,
          ip: input.ip?.trim() || undefined,
          transport: input.transport,
          listenPort: input.listenPort,
          modbusUnit: input.modbusUnit,
          rapidDeviceNum: input.rapidDeviceNum,
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
      if (!generators.some((g) => g.id === id)) return "Gerador não encontrado.";
      try {
        await rcApi.generators.remove(id);
        await refresh();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Falha ao excluir gerador.";
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
