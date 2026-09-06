import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

async function main() {
    const outdir = resolve("node_modules/.cache/angular-tests");
    mkdirSync(outdir, { recursive: true });
    const outfile = resolve(outdir, "angular.test.mjs");
    await build({
        entryPoints: ["tests/angular/adapter.test.ts"],
        outfile,
        bundle: true,
        platform: "node",
        format: "esm",
        packages: "external",
        plugins: [
            {
                name: "oidc-transport-fixture",
                setup(build) {
                    build.onResolve({ filter: /^\.\.\/core$/ }, args =>
                        args.importer.endsWith("/angular/createOidcSpaUtils.ts")
                            ? { path: resolve("tests/angular/core.ts") }
                            : undefined
                    );
                }
            }
        ]
    });
    const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
    process.exitCode = result.status ?? 1;
}
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
