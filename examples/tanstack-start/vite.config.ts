import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// When true, prerender public pages and a SPA shell at build time, then serve
// documents through the CDN. The server handles only APIs and server functions.
// When false, render documents on the server for each request.
const SPA_MODE = true;

export default defineConfig(({ command }) => ({
    server: {
        port: 3000,
        strictPort: true,
        // Auth0: We use https://app.localhost instead of the default
        // http://localhost to avoid having to grant consent on every reload.
        host: "app.localhost"
    },
    resolve: {
        tsconfigPaths: true
    },
    plugins: [
        tanstackStart({
            srcDirectory: "src",
            ...(!SPA_MODE
                ? undefined
                : {
                      spa: {
                          // Render public pages on demand in development; emit a static shell for builds.
                          enabled: command === "build",
                          // A distinct build request avoids deduplicating the shell with the home.
                          // It still matches the root route; Start's shell header omits page content.
                          maskPath: "/?__spa_shell"
                      },
                      prerender: {
                          enabled: true
                      }
                  })
        }),
        viteReact(),
        nitro({
            ...(!SPA_MODE
                ? undefined
                : {
                      modules: [
                          nitro => {
                              if (nitro.options.preset !== "vercel") {
                                  return;
                              }
                              // This Nitro preset defaults to SSR for paths without static files.
                              // Keep its asset/filesystem routing; use the SPA shell for documents
                              // and keep the runtime available for APIs and server functions.
                              nitro.hooks.hook("compiled", async () => {
                                  const configPath = join(nitro.options.output.dir, "config.json");
                                  const config = JSON.parse(await readFile(configPath, "utf8"));
                                  const fallback = config.routes.at(-1);
                                  if (fallback?.src !== "/(.*)" || !fallback.dest) {
                                      throw new Error("Unexpected Nitro Vercel fallback route");
                                  }
                                  fallback.src = "^/(?:api|_serverFn)(?:/.*)?$";
                                  config.routes.push({
                                      src: "/(.*)",
                                      methods: ["GET", "HEAD"],
                                      dest: "/_shell.html"
                                  });
                                  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
                              });
                          }
                      ],
                      vercel: {
                          config: {
                              version: 3,
                              routes: [
                                  {
                                      src: "/(.*)",
                                      headers: { "cache-control": "no-cache" },
                                      continue: true
                                  },
                                  {
                                      src: "^/(?:api|_serverFn)(?:/.*)?$",
                                      headers: { "cache-control": "no-store" },
                                      continue: true
                                  },
                                  // Keep the callback URL intact for oidcEarlyInit, but serve the shell
                                  // instead of the home page's prerendered HTML.
                                  {
                                      src: "^/$",
                                      // @ts-expect-error: Nitro's route types omit `has`, which is supported by Vercel's Build Output API.
                                      has: [{ type: "query", key: "state" }],
                                      methods: ["GET", "HEAD"],
                                      dest: "/_shell.html"
                                  }
                              ]
                          }
                      }
                  })
        }),
        oidcSpa({
            browserRuntimeFreeze: {
                enabled: true
                //excludes: [ "fetch", "XMLHttpRequest"]
            },
            DPoP: {
                enabled: true,
                mode: "auto"
            }
        })
    ],
    ...(!SPA_MODE
        ? undefined
        : {
              preview: {
                  // Start uses Vite preview to generate the HTML during the build.
                  host: "127.0.0.1"
              }
          })
}));
