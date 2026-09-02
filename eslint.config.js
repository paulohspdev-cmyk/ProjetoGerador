import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      // Fast Refresh é uma otimização de HMR do ambiente de desenvolvimento. Providers e
      // componentes-base deste projeto exportam hooks/variants de propósito; isso não afeta
      // build ou runtime de produção e não deve poluir o gate PRE-VM.
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/components/scada/scada-lib.tsx"],
    rules: {
      // useRemote é deliberadamente mount-only e todos os loaders atuais são endpoints rcApi
      // estáticos. check:functional impede a introdução de novos useEffect neste arquivo sem
      // revisão explícita dessa exceção.
      "react-hooks/exhaustive-deps": "off",
    },
  },
  eslintPluginPrettier,
);
