import * as child_process from "child_process";
import * as fs from "fs";
import {
    join as pathJoin,
    relative as pathRelative,
    basename as pathBasename,
    dirname as pathDirname
} from "path";
import { assert } from "tsafe/assert";
import { Buffer } from "Buffer";

const startTime = Date.now();

const distDirPath = pathJoin(__dirname, "..", "dist");

if (fs.existsSync(distDirPath)) {
    fs.rmSync(distDirPath, { recursive: true });
}

run("npx tsc");

{
    const version: string = JSON.parse(
        fs.readFileSync(pathJoin(process.cwd(), "package.json")).toString("utf8")
    ).version;

    assert(typeof version === "string");

    const filePath = pathJoin(distDirPath, "core", "createOidc.js");

    const content = fs.readFileSync(filePath).toString("utf8");

    const content_modified = content.replace("{{OIDC_SPA_VERSION}}", version);

    assert(content !== content_modified);

    fs.writeFileSync(filePath, content_modified);
}

const extraBundleFileBasenames = new Set<string>();

(["backend", "frontend"] as const)
    .map(backendOrFrontend => ({
        vendorDirPath: pathJoin(distDirPath, "vendor", backendOrFrontend),
        backendOrFrontend
    }))
    .forEach(({ backendOrFrontend, vendorDirPath }) =>
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

                webpack_bundle: {
                    if (
                        backendOrFrontend === "frontend" &&
                        pathBasename(filePath) === "oidc-client-ts.js"
                    ) {
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
                                            "umd",
                                            "oidc-client-ts.js"
                                        )
                                    )
                                    .toString("utf8")
                                    .replace("//# sourceMappingURL=oidc-client-ts.js.map", ""),
                                "utf8"
                            )
                        );

                        break webpack_bundle;
                    }

                    const cacheDirPath = pathJoin(__dirname, "..", "node_modules", ".cache", "scripts");

                    if (!fs.existsSync(cacheDirPath)) {
                        fs.mkdirSync(cacheDirPath, { recursive: true });
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
                                `  },`,
                                `  target: "${(() => {
                                    switch (backendOrFrontend) {
                                        case "frontend":
                                            return "web";
                                        case "backend":
                                            return "node";
                                    }
                                })()}",`,
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

                    run(`npx webpack --config ${pathRelative(process.cwd(), webpackConfigJsFilePath)}`);

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
                }

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
            })
    );

console.log(`✓ built in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

function run(command: string) {
    console.log(`$ ${command}`);
    child_process.execSync(command, { stdio: "inherit" });
}
