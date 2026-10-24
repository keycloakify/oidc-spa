import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".env.local")) {
    copyFileSync(".env.local.sample", ".env.local");
}
