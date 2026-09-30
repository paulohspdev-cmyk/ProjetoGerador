export type CatalogController = {
  catalogId?: string;
  manufacturer: string;
  family?: string;
  model: string;
  application?: string;
  provisionable?: boolean;
  registerable?: boolean;
  onboardingMode?: "production" | "lab_read_only" | "inventory";
  packLifecycle?: string | null;
};

export function GeneratorEquipmentFields({
  name,
  setName,
  site,
  setSite,
  sites,
  controller,
  setController,
  controllers,
  loading,
}: {
  name: string;
  setName: (value: string) => void;
  site: string;
  setSite: (value: string) => void;
  sites: string[];
  controller: string;
  setController: (value: string) => void;
  controllers: CatalogController[];
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold">
        Nome do gerador
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Gerador principal"
          className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          maxLength={160}
        />
      </label>

      <label className="block text-sm font-semibold">
        Unidade
        <input
          list="rc-generator-sites"
          value={site}
          onChange={(event) => setSite(event.target.value)}
          className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          required
        />
        <datalist id="rc-generator-sites">
          {sites.map((siteName) => (
            <option key={siteName} value={siteName} />
          ))}
        </datalist>
      </label>

      <label className="block text-sm font-semibold">
        Controladora
        <select
          value={controller}
          onChange={(event) => setController(event.target.value)}
          disabled={loading || !controllers.length}
          className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">{loading ? "Carregando…" : "Selecione"}</option>
          {controllers.map((item) => (
            <option key={item.catalogId || item.model} value={item.model}>
              {item.manufacturer} · {item.model}
              {item.onboardingMode === "lab_read_only"
                ? " · LAB (somente leitura)"
                : item.provisionable
                  ? " · PRODUÇÃO"
                  : " · CADASTRO LIBERADO"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
