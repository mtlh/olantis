import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Files that predate the "no effects" rule. Shrink this list; never grow it.
// Any file here may keep its existing effects, but new code should not add any.
const LEGACY_EFFECT_FILES = [
  "src/components/ChartZoom.tsx",
  "src/components/DemoButton.tsx",
  "src/components/GoalPanel.tsx",
  "src/components/ProviderPicker.tsx",
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

// Correctness rules that need the TypeScript type checker. Keep this list to
// rules whose findings are either bugs or dead code, so a red build is always
// a real problem rather than a style preference.
const TYPE_AWARE_RULES = {
  "@typescript-eslint/no-unnecessary-condition": [
    "error",
    { allowConstantLoopConditions: true },
  ],
  "@typescript-eslint/no-unnecessary-type-assertion": "error",
  "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
  "@typescript-eslint/no-unnecessary-type-arguments": "error",
  "@typescript-eslint/no-redundant-type-constituents": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "@typescript-eslint/prefer-optional-chain": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "error",
  "@typescript-eslint/prefer-includes": "error",
  // `String(value)` on an object silently produces "[object Object]".
  "@typescript-eslint/no-base-to-string": "error",
  "@typescript-eslint/no-meaningless-void-operator": "error",
  "@typescript-eslint/require-await": "error",
  "@typescript-eslint/only-throw-error": "error",
  "@typescript-eslint/no-non-null-assertion": "error",
};

// Rules that need no type information but catch real mistakes.
const BEST_PRACTICE_RULES = {
  eqeqeq: ["error", "always", { null: "ignore" }],
  "prefer-const": "error",
  "no-var": "error",
  "no-implicit-coercion": "error",
  "no-param-reassign": "error",
  "no-throw-literal": "error",
  "no-duplicate-imports": "error",
  "no-useless-catch": "error",
  "no-useless-concat": "error",
  "prefer-template": "error",
  "object-shorthand": "error",
  "no-lonely-if": "error",
  "default-case-last": "error",
  "no-sequences": "error",
  "no-array-constructor": "error",
  "no-object-constructor": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-extend-native": "error",
  "no-debugger": "error",
  "no-return-assign": "error",
  "no-unneeded-ternary": "error",
  "no-useless-rename": "error",
  "no-useless-constructor": "error",
  "no-constant-binary-expression": "error",
  "no-self-compare": "error",
  "no-unsafe-optional-chaining": "error",
};

const REACT_RULES = {
  "react/self-closing-comp": "error",
  "react/jsx-boolean-value": ["error", "never"],
  "react/jsx-curly-brace-presence": ["error", { props: "never", children: "never" }],
  "react/jsx-no-useless-fragment": "error",
  "react/no-array-index-key": "error",
  "react/no-children-prop": "error",
  "react/no-danger": "error",
  "react/no-unknown-property": "error",
  "react/no-unstable-nested-components": ["error", { allowAsProps: true }],
  "react/jsx-no-constructed-context-values": "error",
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
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/consistent-generic-constructors": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-wrapper-object-types": "error",
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
      // Repo uses the @/ alias everywhere; keep it that way.
      "no-restricted-imports": ["error", { patterns: [PARENT_IMPORT] }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  {
    name: "olantis/best-practices",
    files: ["**/*.{ts,tsx,mts,mjs,cjs,js}"],
    rules: BEST_PRACTICE_RULES,
  },

  {
    name: "olantis/react",
    files: ["src/**/*.tsx"],
    rules: REACT_RULES,
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
    name: "olantis/type-aware",
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      ...TYPE_AWARE_RULES,
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
    },
  },

  {
    // Tests use `node:test` whose calls return promises by design, so the
    // promise rules would only produce noise there.
    name: "olantis/type-aware-tests",
    files: ["tests/**/*.mts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: TYPE_AWARE_RULES,
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    ".screenshots/**",
    "out/**",
    "build/**",
    "release/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
