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

export function GeneratorIdentityFields({
  name,
  setName,
  site,
  setSite,
  sites,
  controller,
  setController,
  loading,
  gensetCatalog,
  nominalPower,
  setNominalPower,
}: {
  name: string;
  setName: (value: string) => void;
  site: string;
  setSite: (value: string) => void;
  sites: string[];
  controller: string;
  setController: (value: string) => void;
  loading: boolean;
  gensetCatalog: CatalogController[];
  nominalPower: string;
  setNominalPower: (value: string) => void;
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
        Potência nominal (kW)
        <input
          type="number"
          inputMode="decimal"
          min="0.1"
          max="100000"
          step="0.1"
          value={nominalPower}
          onChange={(event) => setNominalPower(event.target.value)}
          placeholder="Ex.: 450"
          className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Opcional. Use o rating em kW da placa/ficha técnica; não copie kVA como kW.
        </span>
      </label>

      <label className="block text-sm font-semibold">
        Controladora
        <select
          value={controller}
          onChange={(event) => setController(event.target.value)}
          disabled={loading || !gensetCatalog.length}
          className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">{loading ? "Carregando…" : "Selecione"}</option>
          {gensetCatalog.map((item) => (
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
