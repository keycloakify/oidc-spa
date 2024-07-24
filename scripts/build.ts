import * as child_process from "child_process";
import * as fs from "fs";
import { join as pathJoin, relative as pathRelative } from "path";
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

        const RESERVED_PROPERTY_NAME = "__oidcSpaBundle";

        const isBundledFile = fs
            .readFileSync(filePath)
            .toString("utf8")
            .includes(RESERVED_PROPERTY_NAME);

        if (isBundledFile) {
            return;
        }

        const esbuildOutputDirPath = pathJoin(vendorDistDirName, "esbuild_output");
        const esbuildOutputFilePath = pathJoin(esbuildOutputDirPath, "index.js");

        run(
            [
                `esbuild ${pathRelative(process.cwd(), filePath)}`,
                `--bundle`,
                `--platform=browser`,
                `--format=cjs`,
                `--outfile=${pathRelative(process.cwd(), esbuildOutputFilePath)}`
            ].join(" ")
        );

        assert(fs.readdirSync(esbuildOutputDirPath).length === 1);

        fs.renameSync(esbuildOutputFilePath, filePath);

        fs.rmdirSync(esbuildOutputDirPath, { "recursive": true });

        fs.writeFileSync(
            filePath,
            Buffer.from(
                [
                    fs.readFileSync(filePath).toString("utf8"),
                    `exports.${RESERVED_PROPERTY_NAME} = true;`
                ].join("\n"),
                "utf8"
            )
        );
    });

console.log(`✓ built in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

function run(command: string) {
    console.log(`$ ${command}`);
    child_process.execSync(command, { "stdio": "inherit" });
}
