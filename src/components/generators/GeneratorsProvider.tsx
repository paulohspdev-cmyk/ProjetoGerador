import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CONTROLLER_MODELS,
  GENERATORS_KEY,
  GEN_SITES,
  SEED_GENERATORS,
  createGeneratorRecord,
  syncLiveGenerators,
  type Generator,
} from "@/data/generators";

type CreateInput = { tag?: string; controller: string; site: string; ip?: string };

type GeneratorsContextValue = {
  generators: Generator[];
  getById: (id: string) => Generator | undefined;
  addGenerator: (input: CreateInput) => string | null;
  removeGenerator: (id: string) => string | null;
};

const GeneratorsContext = createContext<GeneratorsContextValue | null>(null);

function cloneSeed() {
  return SEED_GENERATORS.map((g) => ({ ...g, mains: { ...g.mains }, gen: { ...g.gen } }));
}

function loadList(): Generator[] {
  try {
    const raw = localStorage.getItem(GENERATORS_KEY);
    if (!raw) return cloneSeed();
    const parsed = JSON.parse(raw) as Generator[];
    if (!Array.isArray(parsed)) return cloneSeed();
    return parsed;
  } catch {
    return cloneSeed();
  }
}

function persist(list: Generator[]) {
  localStorage.setItem(GENERATORS_KEY, JSON.stringify(list));
  syncLiveGenerators(list);
}

export function GeneratorsProvider({ children }: { children: ReactNode }) {
  const [generators, setGenerators] = useState<Generator[]>(() => cloneSeed());

  useEffect(() => {
    const list = loadList();
    persist(list);
    setGenerators(list);
  }, []);

  const getById = useCallback(
    (id: string) => generators.find((g) => g.id === id || g.tag.toLowerCase() === id.toLowerCase()),
    [generators],
  );

  const addGenerator = useCallback(
    (input: CreateInput) => {
      const controller = input.controller.trim();
      const site = input.site.trim();
      if (!controller) return "Informe a controladora.";
      if (!site) return "Informe o site.";
      const tag = (input.tag?.trim() || "").toUpperCase();
      if (tag && generators.some((g) => g.tag.toUpperCase() === tag)) {
        return "Já existe um gerador com esta tag.";
      }
      const next = [...generators, createGeneratorRecord(generators, { ...input, controller, site, tag })];
      persist(next);
      setGenerators(next);
      return null;
    },
    [generators],
  );

  const removeGenerator = useCallback(
    (id: string) => {
      if (!generators.some((g) => g.id === id)) return "Gerador não encontrado.";
      const next = generators.filter((g) => g.id !== id);
      persist(next);
      setGenerators(next);
      return null;
    },
    [generators],
  );

  const value = useMemo(
    () => ({ generators, getById, addGenerator, removeGenerator }),
    [generators, getById, addGenerator, removeGenerator],
  );

  return <GeneratorsContext.Provider value={value}>{children}</GeneratorsContext.Provider>;
}

export function useGenerators() {
  const ctx = useContext(GeneratorsContext);
  if (!ctx) throw new Error("useGenerators must be used within GeneratorsProvider");
  return ctx;
}

export { CONTROLLER_MODELS, GEN_SITES };
