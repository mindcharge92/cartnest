import baseConfig from "@repo/eslint-config/base";

export default [
  ...baseConfig,
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**", "**/.turbo/**", "docs/**"],
  },
];
