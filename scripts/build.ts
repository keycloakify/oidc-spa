import * as child_process from "child_process";
import * as fs from "fs";
import {
    join as pathJoin,
    relative as pathRelative,
    basename as pathBasename,
    dirname as pathDirname
} from "path";
import { assert } from "tsafe/assert";
import { transformCodebase } from "./tools/transformCodebase";

const isIncremental = process.env["INCREMENTAL"] === "true";

const startTime = Date.now();

const projectDirPath = pathJoin(__dirname, "..");
const distDirPath_root = pathJoin(projectDirPath, "dist");
const cacheDirPath = pathJoin(__dirname, "..", "node_modules", ".cache", "scripts");
const srcDirPath = pathJoin(projectDirPath, "src");
const packageJson = JSON.parse(fs.readFileSync(pathJoin(projectDirPath, "package.json"), "utf8")) as {
    version: string;
    exports: Record<string, { types?: string; module: string; import: string; default: string }>;
};

// Follow the actual export targets: ESM-only entries use an .mjs fallback,
// while dual-format entries fall back to CommonJS in dist/.
const runtimeExportPaths = Array.from(
    new Set(Object.values(packageJson.exports).flatMap(entry => [entry.import, entry.default]))
);

for (const [name, entry] of Object.entries(packageJson.exports)) {
    assert(entry.module === entry.import, `Inconsistent ESM targets for ${name}`);
    assert(entry.import.startsWith("./dist/esm/") && entry.import.endsWith(".mjs"));
    assert(
        entry.default === entry.import ||
            entry.default === entry.import.replace("/esm/", "/").replace(/\.mjs$/, ".js"),
        `Invalid fallback target for ${name}`
    );
}

if (!fs.existsSync(cacheDirPath)) {
    fs.mkdirSync(cacheDirPath, { recursive: true });
}

let preBuildDistWithOnlyVendorDirPath: string | undefined = undefined;

if (fs.existsSync(distDirPath_root)) {
    preserve_vendor: {
        if (!isIncremental) {
            break preserve_vendor;
        }

        preBuildDistWithOnlyVendorDirPath = pathJoin(cacheDirPath, "dist_vendor_only");

        if (fs.existsSync(preBuildDistWithOnlyVendorDirPath)) {
            fs.rmSync(preBuildDistWithOnlyVendorDirPath, { recursive: true });
        }

        transformCodebase({
            srcDirPath: distDirPath_root,
            destDirPath: preBuildDistWithOnlyVendorDirPath,
            transformSourceCode: ({ fileRelativePath, sourceCode }) => {
                // Rebundle the small build-runtime entrypoints on incremental builds
                // too: edits to their wrappers must not be hidden by the vendor cache.
                if (fileRelativePath.startsWith(pathJoin("esm", "vendor", "build-runtime"))) {
                    return undefined;
                }
                if (
                    fileRelativePath.startsWith(pathJoin("vendor")) ||
                    fileRelativePath.startsWith(pathJoin("esm", "vendor"))
                ) {
                    return { modifiedSourceCode: sourceCode };
                }
                return undefined;
            }
        });
    }

    fs.rmSync(distDirPath_root, { recursive: true });
}

for (const targetFormat of ["cjs", "esm"] as const) {
    const distDirPath = (() => {
        switch (targetFormat) {
            case "cjs":
                return distDirPath_root;
            case "esm":
                return pathJoin(distDirPath_root, "esm");
        }
    })();

    {
        const tsconfig = JSON.parse(
            fs.readFileSync(pathJoin(projectDirPath, "tsconfig.json")).toString("utf8")
        );

        const tsconfigPath_forTarget = pathJoin(cacheDirPath, "tsconfig.json");

        fs.writeFileSync(
            tsconfigPath_forTarget,
            JSON.stringify(
                {
                    ...tsconfig,
                    compilerOptions: {
                        ...tsconfig.compilerOptions,
                        rootDir: srcDirPath,
                        tsBuildInfoFile: pathJoin(distDirPath, "tsconfig.tsbuildinfo"),
                        module: (() => {
                            switch (targetFormat) {
                                case "cjs":
                                    return "CommonJS";
                                case "esm":
                                    return "es2020";
                            }
                        })(),
                        outDir: distDirPath
                    },
                    // Compile exported entrypoints and their dependencies only. Ambient
                    // declarations (including virtual modules) must still be available.
                    files: runtimeExportPaths
                        .filter(exportPath =>
                            targetFormat === "esm"
                                ? exportPath.endsWith(".mjs")
                                : exportPath.endsWith(".js")
                        )
                        .map(exportPath =>
                            pathJoin(
                                srcDirPath,
                                exportPath
                                    .replace(/^\.\/dist\/(esm\/)?/, "")
                                    .replace(/\.(mjs|js)$/, ".ts")
                            )
                        ),
                    include: [pathJoin(srcDirPath, "**", "*.d.ts")],
                    exclude: []
                },
                null,
                2
            )
        );

        run(`npx tsc --project ${tsconfigPath_forTarget}`);
    }

    fs.rmSync(pathJoin(distDirPath, "tsconfig.tsbuildinfo"));

    {
        const { version } = packageJson;

        assert(typeof version === "string");

        const filePath = pathJoin(distDirPath, "core", "createOidc.js");

        const content = fs.readFileSync(filePath).toString("utf8");

        const content_modified = content.replace("{{OIDC_SPA_VERSION}}", version);

        assert(content !== content_modified);

        fs.writeFileSync(filePath, content_modified);
    }

    vendor_dependencies: {
        if (preBuildDistWithOnlyVendorDirPath !== undefined && targetFormat !== "esm") {
            break vendor_dependencies;
        }

        const extraBundleFileBasenames = new Set<string>();

        (["frontend", "server", "build-runtime"] as const)
            .filter(targetRuntime => {
                if (preBuildDistWithOnlyVendorDirPath !== undefined) {
                    return targetRuntime === "build-runtime";
                }
                switch (targetRuntime) {
                    case "build-runtime":
                        return targetFormat === "esm";
                    default:
                        return true;
                }
            })
            .map(targetRuntime => ({
                vendorDirPath: pathJoin(distDirPath, "vendor", targetRuntime),
                targetRuntime
            }))
            .forEach(({ vendorDirPath, targetRuntime }) =>
                fs
                    .readdirSync(vendorDirPath)
                    .filter(fileBasename => fileBasename.endsWith(".js"))
                    .map(fileBasename => pathJoin(vendorDirPath, fileBasename))
                    .forEach(filePath => {
                        {
                            const mapFilePath = `${filePath}.map`;

                            if (fs.existsSync(mapFilePath)) {
                                fs.unlinkSync(mapFilePath);
                            }
                        }

                        // We have a special case for oidc-client-ts, we do it manually instead of relying
                        // on webpack or esbuild because we want to avoid any extra byte and we know that
                        // our version of oidc-client-ts has no dependencies so we can copy manually.
                        vendor_oidc_client_ts: {
                            if (pathBasename(filePath) !== "oidc-client-ts.js") {
                                break vendor_oidc_client_ts;
                            }

                            assert(targetRuntime === "frontend");

                            fs.writeFileSync(
                                filePath,
                                Buffer.from(
                                    fs
                                        .readFileSync(
                                            pathJoin(
                                                __dirname,
                                                "..",
                                                "node_modules",
                                                "oidc-client-ts",
                                                "dist",
                                                (() => {
                                                    switch (targetFormat) {
                                                        case "cjs":
                                                            return "umd";
                                                        case "esm":
                                                            return "esm";
                                                    }
                                                })(),
                                                "oidc-client-ts.js"
                                            )
                                        )
                                        .toString("utf8")
                                        .replace("//# sourceMappingURL=oidc-client-ts.js.map", ""),
                                    "utf8"
                                )
                            );

                            return;
                        }

                        esm_bundle: {
                            if (targetFormat !== "esm") {
                                break esm_bundle;
                            }

                            const bundledFilePath = pathJoin(cacheDirPath, "bundle.js");
                            const esbuildExternalNodeBuiltins =
                                targetRuntime === "frontend"
                                    ? ["--external:crypto", "--external:buffer", "--external:util"]
                                    : [];

                            run(
                                [
                                    `npx esbuild`,
                                    `'${filePath}'`,
                                    "--bundle",
                                    "--format=esm",
                                    "--platform=browser",
                                    "--main-fields=browser,module,main",
                                    "--conditions=browser",
                                    // Do not pull node polyfills for vendor bundles that only run in browsers.
                                    ...esbuildExternalNodeBuiltins,
                                    `--outfile='${bundledFilePath}'`
                                ].join(" ")
                            );

                            fs.copyFileSync(bundledFilePath, filePath);

                            return;
                        }

                        cjs_bundle: {
                            if (targetFormat !== "cjs") {
                                break cjs_bundle;
                            }

                            const webpackConfigJsFilePath = pathJoin(cacheDirPath, "webpack.config.js");
                            const webpackOutputDirPath = pathJoin(cacheDirPath, "webpack_output");
                            const webpackOutputFilePath = pathJoin(webpackOutputDirPath, "index.js");

                            fs.writeFileSync(
                                webpackConfigJsFilePath,
                                Buffer.from(
                                    [
                                        `const path = require('path');`,
                                        ``,
                                        `module.exports = {`,
                                        `   mode: 'production',`,
                                        `  entry: '${filePath}',`,
                                        `  output: {`,
                                        `    path: '${webpackOutputDirPath}',`,
                                        `    filename: '${pathBasename(webpackOutputFilePath)}',`,
                                        `    libraryTarget: 'commonjs2',`,
                                        `    chunkFormat: 'module'`,
                                        `  },`,
                                        `  target: "${(() => {
                                            switch (targetRuntime) {
                                                case "frontend":
                                                    return "web";
                                                case "server":
                                                case "build-runtime":
                                                    return "node";
                                            }
                                        })()}",`,
                                        (() => {
                                            switch (targetRuntime) {
                                                case "frontend":
                                                    return [
                                                        `  resolve: {`,
                                                        `    // Do not inject polyfills for optional Node builtins referenced by vendor bundles.`,
                                                        `    fallback: { crypto: false, buffer: false, util: false }`,
                                                        `  },`
                                                    ].join("\n");
                                                case "server":
                                                case "build-runtime":
                                                    return "";
                                            }
                                        })(),
                                        `  module: {`,
                                        `    rules: [`,
                                        `      {`,
                                        `        test: /\.js$/,`,
                                        `        use: {`,
                                        `          loader: 'babel-loader',`,
                                        `          options: {`,
                                        `            presets: ['@babel/preset-env'],`,
                                        `          }`,
                                        `        }`,
                                        `      }`,
                                        `    ]`,
                                        `  }`,
                                        `};`
                                    ].join("\n"),
                                    "utf8"
                                )
                            );

                            run(
                                `npx webpack --config ${pathRelative(
                                    process.cwd(),
                                    webpackConfigJsFilePath
                                )}`
                            );

                            fs.readdirSync(webpackOutputDirPath)
                                .filter(fileBasename => !fileBasename.endsWith(".txt"))
                                .map(fileBasename => pathJoin(webpackOutputDirPath, fileBasename))
                                .forEach(bundleFilePath => {
                                    assert(bundleFilePath.endsWith(".js"));

                                    if (pathBasename(bundleFilePath) === "index.js") {
                                        fs.renameSync(webpackOutputFilePath, filePath);
                                    } else {
                                        const bundleFileBasename = pathBasename(bundleFilePath);

                                        assert(!extraBundleFileBasenames.has(bundleFileBasename));
                                        extraBundleFileBasenames.add(bundleFileBasename);

                                        fs.renameSync(
                                            bundleFilePath,
                                            pathJoin(pathDirname(filePath), bundleFileBasename)
                                        );
                                    }
                                });

                            fs.rmSync(webpackOutputDirPath, { recursive: true });

                            fs.writeFileSync(
                                filePath,
                                Buffer.from(
                                    [
                                        fs.readFileSync(filePath).toString("utf8"),
                                        `exports.__oidcSpaBundle = true;`
                                    ].join("\n"),
                                    "utf8"
                                )
                            );

                            return;
                        }
                    })
            );
    }

    if (targetFormat === "esm") {
        run(`npx js2mjs "${distDirPath}"`);

        const esmTypeDefDir = pathJoin(cacheDirPath, "esm-types");

        if (fs.existsSync(esmTypeDefDir)) {
            fs.rmSync(esmTypeDefDir, { recursive: true });
        }

        transformCodebase({
            srcDirPath: distDirPath,
            destDirPath: esmTypeDefDir,
            transformSourceCode: ({ fileRelativePath, sourceCode }) => {
                if (!fileRelativePath.endsWith(".d.ts")) {
                    return undefined;
                }

                return {
                    modifiedSourceCode: sourceCode
                };
            }
        });

        run(`npx ts-add-js-extension --dir="${distDirPath}"`);

        transformCodebase({
            srcDirPath: esmTypeDefDir,
            destDirPath: distDirPath
        });
    }
}

{
    let modifiedPackageJsonContent = fs
        .readFileSync(pathJoin(projectDirPath, "package.json"))
        .toString("utf8");

    modifiedPackageJsonContent = (() => {
        const o = JSON.parse(modifiedPackageJsonContent);

        for (const propertyName of ["scripts", "lint-staged", "husky", "devDependencies"]) {
            assert(propertyName in o);
            delete o[propertyName];
        }

        delete o.files;

        return JSON.stringify(o, null, 4);
    })();

    modifiedPackageJsonContent = modifiedPackageJsonContent
        .replace(/"dist\//g, '"')
        .replace(/"\.\/dist\//g, '"./')
        .replace(/"!dist\//g, '"!')
        .replace(/"!\.\/dist\//g, '"!./');

    fs.writeFileSync(
        pathJoin(distDirPath_root, "package.json"),
        Buffer.from(modifiedPackageJsonContent, "utf8")
    );
}

for (const basename of ["README.md", "LICENSE"]) {
    fs.cpSync(pathJoin(projectDirPath, basename), pathJoin(distDirPath_root, basename));
}

transformCodebase({
    srcDirPath: pathJoin(projectDirPath, "src"),
    destDirPath: pathJoin(distDirPath_root, "src")
});

transformCodebase({
    srcDirPath: distDirPath_root,
    destDirPath: distDirPath_root,
    transformSourceCode: ({ filePath, sourceCode }) => {
        if (filePath.endsWith(".js.map") || filePath.endsWith(".mjs.map")) {
            const sourceMapObj = JSON.parse(sourceCode.toString("utf8"));

            sourceMapObj.sources = sourceMapObj.sources.map((source: string) =>
                source.startsWith("../src/")
                    ? source.replace("..", ".")
                    : source.replace("../src", "src")
            );

            const modifiedSourceCode = Buffer.from(JSON.stringify(sourceMapObj), "utf8");

            return {
                modifiedSourceCode
            };
        }

        return {
            modifiedSourceCode: sourceCode
        };
    }
});

if (preBuildDistWithOnlyVendorDirPath !== undefined) {
    transformCodebase({
        srcDirPath: preBuildDistWithOnlyVendorDirPath,
        destDirPath: distDirPath_root
    });
}

// Check the packaged contract after all transformations and cache restores.
for (const [name, entry] of Object.entries(packageJson.exports)) {
    for (const exportPath of Object.values(entry)) {
        assert(fs.existsSync(pathJoin(projectDirPath, exportPath)), `Missing ${name}: ${exportPath}`);
    }

    const declarationPath = entry.import.replace(/\.mjs$/, ".d.ts");
    assert(fs.existsSync(pathJoin(projectDirPath, declarationPath)), `Missing types for ${name}`);

    if (entry.default !== entry.import) {
        assert(
            fs.existsSync(pathJoin(projectDirPath, entry.default.replace(/\.js$/, ".d.ts"))),
            `Missing CommonJS types for ${name}`
        );
        continue;
    }

    const cjsPath = entry.import.replace("/esm/", "/").replace(/\.mjs$/, ".js");
    assert(!fs.existsSync(pathJoin(projectDirPath, cjsPath)), `Unexpected CommonJS build for ${name}`);
}

console.log(`✓ built in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

function run(command: string) {
    console.log(`$ ${command}`);
    child_process.execSync(command, { stdio: "inherit" });
}
