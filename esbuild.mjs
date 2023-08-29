// SOURCE: https://github.com/buildwithjuno/cli/blob/main/esbuild.mjs
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
  format: "esm",
  platform: "node",
  write: false,
  target: ["node18", "esnext"],
  banner: {
    js: "import { createRequire as topLevelCreateRequire } from 'module';\n const require = topLevelCreateRequire(import.meta.url);",
  },
  // Exclude "node-hid" which is referenced and will try to load an HID.node file. File which we don't require.
  // Solve "Error: Could not locate the bindings file. Tried: (list of folders)"
  // In addition, "node-hid" uses __dirname which does not exist anymore.
  external: ["node-hid"],
});

writeFileSync("dist/index.js", `${script.outputFiles[0].text}`);
