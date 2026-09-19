import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  /** this makes tsdown not transpile at all */
  target: false,
  clean: true,
  sourcemap: true,
  exports: { extensions: true, devExports: true },
});
