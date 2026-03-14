import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

let result: string | undefined = undefined;
const thisDirPath = path.dirname(fileURLToPath(import.meta.url));

export function getThisCodebaseRootDirPath(): string {
    if (result !== undefined) {
        return result;
    }

    return (result = getNearestPackageJsonDirPath(thisDirPath));
}

export function getNearestPackageJsonDirPath(dirPath: string): string {
    if (fs.existsSync(path.join(dirPath, "package.json"))) {
        return dirPath;
    }
    return getNearestPackageJsonDirPath(path.join(dirPath, ".."));
}
