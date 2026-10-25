import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".env")) {
    copyFileSync(".env.sample", ".env");
}
