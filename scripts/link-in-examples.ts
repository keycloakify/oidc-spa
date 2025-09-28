/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { execSync } from "child_process";
import { join as pathJoin, relative as pathRelative } from "path";
import * as fs from "fs";

const projectDirPath = pathJoin(__dirname, "..");

const commonThirdPartyDeps = (() => {
    const namespaceModuleNames: string[] = ["@angular"];
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
    "tanstack-router",
    "tanstack-router-file-based",
    "multi-providers",
    "react-router-framework",
    "angular",
    "angular-kitchensink"
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
