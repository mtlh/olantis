import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Files that predate the "no effects" rule. Shrink this list; never grow it.
// Any file here may keep its existing effects, but new code should not add any.
const LEGACY_EFFECT_FILES = [
  "src/components/ChartZoom.tsx",
  "src/components/CreatePortfolioWizard.tsx",
  "src/components/Dashboard.tsx",
  "src/components/DemoButton.tsx",
  "src/components/GoalPanel.tsx",
  "src/components/ProviderPicker.tsx",
  "src/components/Settings.tsx",
  "src/components/Sidebar.tsx",
  "src/components/StockDetail.tsx",
  "src/components/WatchlistPanel.tsx",
  "src/components/dashboard/DashboardGoalCard.tsx",
  "src/components/dashboard/HoldingDialog.tsx",
  "src/components/dashboard/PerformanceChart.tsx",
  "src/components/dashboard/useDashboardSelection.ts",
  "src/components/dashboard/useStaleHoldings.ts",
  "src/components/ui/toast.tsx",
  "src/components/useBrandIconWarmup.ts",
  "src/components/useDesktopUpdate.ts",
  "src/lib/store.ts",
  "src/lib/use-chart-animation.ts",
];

// `ignore`-style pattern: matches `../x` and `../../x`, not `./x` or `@/x`.
const PARENT_IMPORT = {
  group: ["../**"],
  message: "Use the @/ alias instead of parent-relative imports.",
};

const SERVER_ONLY_IMPORT = {
  group: [
    "@/lib/db",
    "@/lib/db/**",
    "drizzle-orm",
    "drizzle-orm/**",
    "@neondatabase/serverless",
    "yahoo-finance2",
  ],
  message:
    "Server-only module. Client code calls /api/* or reads the workspace bootstrap store.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    name: "olantis/linter-options",
    linterOptions: {
      // A stale disable comment after a refactor should fail, not silently widen the rules.
      reportUnusedDisableDirectives: "error",
    },
  },

  {
    name: "olantis/guardrails",
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Next's config only swaps in the TS parser; these rules are not enabled by it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          ignoreRestSiblings: true,
          caughtErrors: "none",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // The fastest way to make an error disappear is also the fastest way to hide a bug.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": false,
          "ts-nocheck": false,
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // Repo uses the @/ alias everywhere; keep it that way.
      "no-restricted-imports": ["error", { patterns: [PARENT_IMPORT] }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  {
    // Client code must never pull server modules into the browser bundle.
    name: "olantis/client-boundary",
    files: ["src/components/**/*.{ts,tsx}", "src/lib/{store,use-chart-animation}.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [PARENT_IMPORT, SERVER_ONLY_IMPORT],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message:
            "Read storage via window.localStorage inside a client-only hook so SSR stays deterministic.",
        },
      ],
    },
  },

  {
    name: "olantis/no-effects",
    files: ["src/**/*.{ts,tsx}"],
    ignores: LEGACY_EFFECT_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='useEffect'], CallExpression[callee.name='useLayoutEffect'], CallExpression[callee.property.name='useEffect'], CallExpression[callee.property.name='useLayoutEffect']",
          message:
            "No effects. Derive during render, use an event handler for side effects, or useSyncExternalStore for external state. If two values must stay in sync, model them as one value. See AGENTS.md.",
        },
      ],
    },
  },

  {
    name: "olantis/async",
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "release/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
