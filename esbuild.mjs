// SOURCE: https://github.com/peterpeterparker/create-ic/blob/main/esbuild.mjs
import esbuild from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import NodeResolve from "@esbuild-plugins/node-resolve";

const dist = join(process.cwd(), "dist");

if (!existsSync(dist)) {
  mkdirSync(dist);
}

const script = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "node",
  write: false,
  target: ["node18", "esnext"],
  banner: {
    js: "import { createRequire as topLevelCreateRequire } from 'module';\n const require = topLevelCreateRequire(import.meta.url);",
  },
});

writeFileSync("dist/index.js", `${script.outputFiles[0].text}`);
