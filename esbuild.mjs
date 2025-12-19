import esbuild from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const dist = join(process.cwd(), "dist");

if (!existsSync(dist)) {
  mkdirSync(dist);
}

const script = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  platform: "node",
  format: "esm",
  write: false,
  // Only native modules must be external (can't be bundled)
  external: ["node-hid"],
  // ESM doesn't have require(), so we create it for any deps that need it
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

writeFileSync("dist/index.mjs", script.outputFiles[0].text);
