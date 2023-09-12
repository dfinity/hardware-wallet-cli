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
  platform: "node",
  write: false,
  plugins: [
    NodeResolve.NodeResolvePlugin({
      extensions: [".ts", ".js"],
      onResolved: (resolved) => {
        // We need to exclude node-hid but not hw-transport-node-hid-noevents for
        // the bindings library to work properly.
        // https://github.com/TooTallNate/node-bindings/issues/65#issuecomment-637495802
        if (
          resolved.includes("node_modules") &&
          resolved.includes("node-hid") &&
          !resolved.includes("noevents")
        ) {
          return {
            external: true,
          };
        }
        return resolved;
      },
    }),
  ],
});

writeFileSync("dist/index.js", `${script.outputFiles[0].text}`);
