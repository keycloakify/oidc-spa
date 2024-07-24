import * as child_process from "child_process";
import * as fs from "fs";
import { join as pathJoin, relative as pathRelative, basename as pathBasename } from "path";
import { assert } from "tsafe/assert";

const startTime = Date.now();

run("npx tsc");

const vendorDistDirName = pathJoin(__dirname, "..", "dist", "vendor");

fs.readdirSync(vendorDistDirName)
    .filter(fileBasename => fileBasename.endsWith(".js"))
    .map(fileBasename => pathJoin(vendorDistDirName, fileBasename))
    .forEach(filePath => {
        {
            const mapFilePath = `${filePath}.map`;

            if (fs.existsSync(mapFilePath)) {
                fs.unlinkSync(mapFilePath);
            }
        }

        const isBundledFile = fs.readFileSync(filePath).toString("utf8").includes("webpack");

        if (isBundledFile) {
            return;
        }

        const cacheDirPath = pathJoin(__dirname, "node_modules", ".cache", "scripts");

        if (!fs.existsSync(cacheDirPath)) {
            fs.mkdirSync(cacheDirPath, { "recursive": true });
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
                    `  target: 'web',`,
                    `  module: {`,
                    `    rules: [`,
                    `      {`,
                    `        test: /\.js$/,`,
                    `        use: {`,
                    `          loader: 'babel-loader',`,
                    `          options: {`,
                    `            presets: ['@babel/preset-env'],`,
                    `          },`,
                    `        },`,
                    `      },`,
                    `    ],`,
                    `  },`,
                    `};`
                ].join("\n")
            )
        );

        run(`npx webpack --config ${pathRelative(process.cwd(), webpackConfigJsFilePath)}`);

        assert(fs.readdirSync(webpackOutputDirPath).filter(p => !p.endsWith(".txt")).length === 1);

        fs.renameSync(webpackOutputFilePath, filePath);

        fs.rmSync(webpackOutputDirPath, { "recursive": true });

        fs.writeFileSync(
            filePath,
            Buffer.from(
                [fs.readFileSync(filePath).toString("utf8"), `exports.__oidcSpaBundle = true;`].join(
                    "\n"
                )
            )
        );
    });

console.log(`✓ built in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

function run(command: string) {
    console.log(`$ ${command}`);
    child_process.execSync(command, { "stdio": "inherit" });
}
