import esbuild from "esbuild";

const serve = process.argv.includes("--serve");

const buildOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: false,
  platform: "browser",
  format: "esm",
  outfile: "dist/bundle.js",
  // @zondax/ledger-icp uses Node.js Buffer — inject a browser polyfill
  inject: ["./buffer-shim.mjs"],
  define: {
    "global": "globalThis",
  },
};

if (serve) {
  const ctx = await esbuild.context(buildOptions);
  const { host, port } = await ctx.serve({ servedir: "." });
  console.log(`Dev server running at http://localhost:${port}`);
} else {
  await esbuild.build(buildOptions);
}
