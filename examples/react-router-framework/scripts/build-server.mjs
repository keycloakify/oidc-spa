import { build } from "esbuild";

await build({
    entryPoints: ["server/app.ts"],
    outfile: "build/server/app.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    // The unchanged Next.js data module imports server-only. Its react-server
    // condition resolves to an empty module in this backend-only build.
    conditions: ["react-server"],
    external: ["express", "@trpc/server", "@upstash/redis", "oidc-spa", "zod"]
});
