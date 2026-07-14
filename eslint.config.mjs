import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested checkouts / build output that aren't part of this app's source:
    ".claude/worktrees/**",
    "mcp-server/dist/**",
    // Standalone Node/CJS hook script (PostToolUse), not part of the app:
    ".claude/hooks/**",
  ]),
]);

export default eslintConfig;
