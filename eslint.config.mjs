import js from "@eslint/js";

const eslintConfig = [
  {
    ...js.configs.recommended,
  },
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
