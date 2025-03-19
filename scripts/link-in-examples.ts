/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { execSync } from "child_process";
import { join as pathJoin, relative as pathRelative } from "path";
import * as fs from "fs";

const projectDirPath = pathJoin(__dirname, "..");

//NOTE: This is only required because of: https://github.com/garronej/ts-ci/blob/c0e207b9677523d4ec97fe672ddd72ccbb3c1cc4/README.md?plain=1#L54-L58
fs.writeFileSync(
    pathJoin(projectDirPath, "dist", "package.json"),
    Buffer.from(
        JSON.stringify(
            (() => {
                const packageJsonParsed = JSON.parse(
                    fs.readFileSync(pathJoin(projectDirPath, "package.json")).toString("utf8")
                );

                return {
                    ...packageJsonParsed,
                    main: packageJsonParsed["main"]?.replace(/^dist\//, ""),
                    types: packageJsonParsed["types"]?.replace(/^dist\//, ""),
                    module: packageJsonParsed["module"]?.replace(/^dist\//, ""),
                    bin: !("bin" in packageJsonParsed)
                        ? undefined
                        : Object.fromEntries(
                              Object.entries(packageJsonParsed["bin"]).map(([key, value]) => [
                                  key,
                                  (value as string).replace(/^dist\//, "")
                              ])
                          ),
                    exports: !("exports" in packageJsonParsed)
                        ? undefined
                        : Object.fromEntries(
                              Object.entries(packageJsonParsed["exports"]).map(([key, value]) => [
                                  key,
                                  (value as string).replace(/^\.\/dist\//, "./")
                              ])
                          )
                };
            })(),
            null,
            2
        ),
        "utf8"
    )
);

const commonThirdPartyDeps = (() => {
    const namespaceModuleNames: string[] = [];
    const standaloneModuleNames = ["react", "@types/react"];

    return [
        ...namespaceModuleNames
            .map(namespaceModuleName =>
                fs
                    .readdirSync(pathJoin(projectDirPath, "node_modules", namespaceModuleName))
                    .map(submoduleName => `${namespaceModuleName}/${submoduleName}`)
            )
            .reduce((prev, curr) => [...prev, ...curr], []),
        ...standaloneModuleNames
    ];
})();

const yarnHomeDirPath = pathJoin(projectDirPath, ".yarn_home");

fs.rmSync(yarnHomeDirPath, { recursive: true, force: true });

fs.mkdirSync(yarnHomeDirPath);

const execYarnLink = (params: { targetModuleName?: string; cwd: string }) => {
    const { targetModuleName, cwd } = params;

    const cmd = ["yarn", "link", ...(targetModuleName !== undefined ? [targetModuleName] : [])].join(
        " "
    );

    console.log(`$ cd ${pathRelative(projectDirPath, cwd) || "."} && ${cmd}`);

    execSync(cmd, {
        cwd,
        env: {
            ...process.env,
            HOME: yarnHomeDirPath
        }
    });
};

const testAppNames = [
    "react-router",
    "react-router-framework",
    "tanstack-router",
    "tanstack-router-file-based",
    "multi-providers"
] as const;

const getTestAppPath = (testAppName: (typeof testAppNames)[number]) =>
    pathJoin(projectDirPath, "examples", testAppName);

testAppNames.forEach(testAppName => {
    const cwd = getTestAppPath(testAppName);

    /*
    const yarnLockFilePath = pathJoin(cwd, "yarn.lock");

    if (fs.existsSync(yarnLockFilePath)) {
        fs.rmSync(yarnLockFilePath);
    }
    */

    execSync("yarn install", { cwd });
});

console.log("=== Linking common dependencies ===");

const total = commonThirdPartyDeps.length;
let current = 0;

commonThirdPartyDeps.forEach(commonThirdPartyDep => {
    current++;

    console.log(`${current}/${total} ${commonThirdPartyDep}`);

    const localInstallPath = pathJoin(
        ...[
            projectDirPath,
            "node_modules",
            ...(commonThirdPartyDep.startsWith("@")
                ? commonThirdPartyDep.split("/")
                : [commonThirdPartyDep])
        ]
    );

    execYarnLink({ cwd: localInstallPath });

    testAppNames.forEach(testAppName =>
        execYarnLink({
            cwd: getTestAppPath(testAppName),
            targetModuleName: commonThirdPartyDep
        })
    );
});

console.log("=== Linking in house dependencies ===");

execYarnLink({ cwd: pathJoin(projectDirPath, "dist") });

testAppNames.forEach(testAppName =>
    execYarnLink({
        cwd: getTestAppPath(testAppName),
        targetModuleName: JSON.parse(
            fs.readFileSync(pathJoin(projectDirPath, "package.json")).toString("utf8")
        )["name"]
    })
);
