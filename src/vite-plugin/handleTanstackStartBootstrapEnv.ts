import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { PluginContext } from "rollup";
import type { ResolvedConfig, ViteDevServer } from "vite";
import { babelParser, babelTraverse, type NodePath } from "../vendor/build-runtime/babel";

/**
 * Keep this runtime policy in sync with ParamsOfBootstrap. The companion type
 * test deliberately imports the type and checks every property name.
 */
export const tanstackStartBootstrapEnvPolicy = {
    real: {
        mode: "public",
        issuerUri: "public",
        debugLogs: "public",
        server: {
            accessTokenValidationMethod: "public",
            expectedAccessTokenAudience: "public",
            clientId: "public",
            clientSecret: "redact"
        },
        client: {
            clientId: "public",
            warnUserSecondsBeforeAutoLogout: "public",
            idleSessionLifetimeInSeconds: "public",
            scopes: "public",
            transformUrlBeforeRedirect: "public",
            extraQueryParams: "public",
            extraTokenParams: "public",
            sessionRestorationMethod: "public",
            __unsafe_clientSecret: "public",
            __metadata: "public",
            __unsafe_useIdTokenAsAccessToken: "public",
            autoLogoutParams: "public",
            disableDPoP: "public"
        }
    },
    mock: {
        mode: "public",
        issuerUri_mock: "public",
        accessToken_mock: "public",
        server: {
            accessTokenClaims_mock: "public"
        },
        client: {
            clientId_mock: "public",
            idTokenClaims_mock: "public",
            isUserInitiallyLoggedIn: "public"
        }
    }
} as const;

/** The manifest contains names only; values are read by the server at request time. */
export function createHandleTanstackStartBootstrapEnv(params: { resolvedConfig: ResolvedConfig }) {
    const { resolvedConfig } = params;
    const virtualId = "virtual:oidc-spa/tanstack-start-public-env";
    const resolvedId = `\0${virtualId}`;
    const adapterId = "oidc-spa/react-tanstack-start";
    let scanPromise:
        | Promise<{
              publicEnvNames: string[];
              toRedactEnvNames: string[];
          }>
        | undefined;
    let resolveFromServerEnvironment: Pick<PluginContext, "resolve">["resolve"] | undefined;

    const isSourceFile = (id: string) => /\.[cm]?[jt]sx?$/.test(id) && !/\.d\.[cm]?ts$/.test(id);

    const scan = async (context: Pick<PluginContext, "resolve" | "addWatchFile">) => {
        type Source = {
            program: NodePath;
            imports: Map<string, string>;
        };
        const sources = new Map<string, Source>();
        const excludedDirectories = new Set([
            "node_modules",
            "dist",
            "build",
            "coverage",
            "public",
            path.resolve(resolvedConfig.root, resolvedConfig.build.outDir),
            path.resolve(resolvedConfig.cacheDir)
        ]);

        // Scan before generating the virtual module, including lazy routes. Collecting
        // names in transform() would make authorization depend on module load order.
        const discover = async (directory: string): Promise<string[]> => {
            context.addWatchFile(directory);
            const entries = await fs.readdir(directory, { withFileTypes: true });
            const files = await Promise.all(
                entries.map(async entry => {
                    const id = path.join(directory, entry.name);
                    if (
                        entry.name.startsWith(".") ||
                        excludedDirectories.has(entry.name) ||
                        excludedDirectories.has(id)
                    ) {
                        return [];
                    }
                    if (entry.isDirectory()) return discover(id);
                    return entry.isFile() && isSourceFile(id) ? [id] : [];
                })
            );
            return files.flat();
        };

        const pending = await discover(resolvedConfig.root);
        for (let i = 0; i < pending.length; i++) {
            const id = pending[i];
            if (sources.has(id)) continue;
            context.addWatchFile(id);
            const code = await fs.readFile(id, "utf8");
            const ast = babelParser.parse(code, {
                sourceType: "unambiguous",
                plugins: [
                    "typescript",
                    ...(/\.[cm]?ts$/.test(id) ? [] : ["jsx" as const]),
                    "decorators-legacy"
                ]
            });
            let program!: NodePath;
            babelTraverse(ast, {
                Program(p) {
                    program = p;
                    p.stop();
                }
            });
            const source: Source = { program, imports: new Map() };
            sources.set(id, source);
            for (const statement of program.get("body") as NodePath[]) {
                if (
                    !statement.isImportDeclaration() &&
                    !statement.isExportNamedDeclaration() &&
                    !statement.isExportAllDeclaration()
                )
                    continue;
                const specifier = statement.node.source?.value;
                if (!specifier || specifier === adapterId) continue;
                const resolved = await context.resolve(specifier, id, { skipSelf: true });
                if (!resolved || resolved.external) continue;
                const dependencyId = resolved.id.split("?")[0];
                if (
                    !path.isAbsolute(dependencyId) ||
                    dependencyId.includes(`${path.sep}node_modules${path.sep}`) ||
                    !isSourceFile(dependencyId)
                )
                    continue;
                source.imports.set(specifier, dependencyId);
                pending.push(dependencyId);
            }
        }

        const names = new Set<string>();
        const toRedactEnvNames = new Set<string>();
        const envNameByExpression = new Map<object, string>();
        const envNameByBinding = new Map<object, string>();
        const redactedPropertyNames = new Set(
            Object.entries(tanstackStartBootstrapEnvPolicy.real.server)
                .filter(([, policy]) => policy === "redact")
                .map(([propertyName]) => propertyName)
        );
        const fail: (id: string, p: NodePath, reason: string) => never = (id, p, reason) => {
            const loc = p.node.loc?.start;
            throw new Error(
                `oidc-spa: Cannot determine public bootstrap environment variables in ${id}${
                    loc ? `:${loc.line}:${loc.column + 1}` : ""
                }. ${reason}`
            );
        };
        const propertyName = (p: NodePath): string | undefined => {
            if (!p.isMemberExpression() && !p.isOptionalMemberExpression() && !p.isObjectProperty())
                return undefined;
            const key = (p.isObjectProperty() ? p.get("key") : p.get("property")) as NodePath;
            if (key.isStringLiteral()) return key.node.value;
            if (!p.node.computed && key.isIdentifier()) return key.node.name;
            return undefined;
        };
        const unwrap = (p: NodePath): NodePath => {
            while (
                p.isTSAsExpression() ||
                p.isTSSatisfiesExpression() ||
                p.isTSNonNullExpression() ||
                p.isParenthesizedExpression()
            )
                p = p.get("expression") as NodePath;
            return p;
        };
        type Origin = "namespace" | "builder" | "utils" | "bootstrap";
        const memberOrigin = (
            origin: Origin | undefined,
            name: string | undefined
        ): Origin | undefined => {
            if (origin === "namespace" && name === "oidcSpa") return "builder";
            if (origin === "utils" && name === "bootstrapOidc") return "bootstrap";
            return undefined;
        };
        const exportedOrigin = (id: string, name: string, seen: Set<object>): Origin | undefined => {
            if (id === adapterId) return name === "oidcSpa" ? "builder" : undefined;
            const source = sources.get(id);
            if (!source) return undefined;
            for (const statement of source.program.get("body") as NodePath[]) {
                if (seen.has(statement.node)) continue;
                if (statement.isExportDefaultDeclaration() && name === "default")
                    return origin(statement.get("declaration"), id, seen);
                if (statement.isExportAllDeclaration()) {
                    const result = exportedOrigin(
                        source.imports.get(statement.node.source.value) ?? "",
                        name,
                        new Set([...seen, statement.node])
                    );
                    if (result) return result;
                }
                if (!statement.isExportNamedDeclaration()) continue;
                const declaration = statement.get("declaration");
                if (
                    declaration.node &&
                    source.program.scope.getBinding(name)?.path.findParent(p => p === statement)
                ) {
                    return bindingOrigin(source.program.scope.getBinding(name)!.path, name, id, seen);
                }
                for (const specifier of statement.get("specifiers")) {
                    if (!specifier.isExportSpecifier()) continue;
                    const exported = specifier.node.exported;
                    if ((exported.type === "Identifier" ? exported.name : exported.value) !== name)
                        continue;
                    if (!statement.node.source) return origin(specifier.get("local"), id, seen);
                    return exportedOrigin(
                        statement.node.source.value === adapterId
                            ? adapterId
                            : source.imports.get(statement.node.source.value) ?? "",
                        specifier.node.local.name,
                        new Set([...seen, statement.node])
                    );
                }
            }
            return undefined;
        };
        const bindingOrigin = (
            p: NodePath,
            name: string,
            id: string,
            seen: Set<object>
        ): Origin | undefined => {
            if (seen.has(p.node)) return undefined;
            seen = new Set([...seen, p.node]);
            if (
                p.isImportSpecifier() ||
                p.isImportDefaultSpecifier() ||
                p.isImportNamespaceSpecifier()
            ) {
                const declaration = p.parentPath;
                if (!declaration?.isImportDeclaration()) return undefined;
                const specifier = declaration.node.source.value;
                if (p.isImportNamespaceSpecifier())
                    return specifier === adapterId ? "namespace" : undefined;
                const imported = p.isImportSpecifier() ? p.node.imported : undefined;
                return exportedOrigin(
                    specifier === adapterId ? adapterId : sources.get(id)?.imports.get(specifier) ?? "",
                    imported
                        ? imported.type === "Identifier"
                            ? imported.name
                            : imported.value
                        : "default",
                    seen
                );
            }
            if (!p.isVariableDeclarator()) return undefined;
            const valueOrigin = origin(p.get("init") as NodePath, id, seen);
            const pattern = p.get("id");
            if (pattern.isIdentifier()) return valueOrigin;
            if (!pattern.isObjectPattern()) return undefined;
            for (const property of pattern.get("properties")) {
                if (property.isObjectProperty() && property.get("value").isIdentifier({ name }))
                    return memberOrigin(valueOrigin, propertyName(property));
            }
            return undefined;
        };
        const origin = (input: NodePath, id: string, seen = new Set<object>()): Origin | undefined => {
            const p = unwrap(input);
            if (!p.node) return undefined;
            if (p.isIdentifier()) {
                const binding = p.scope.getBinding(p.node.name);
                return binding?.constant
                    ? bindingOrigin(binding.path, p.node.name, id, seen)
                    : undefined;
            }
            if (p.isMemberExpression() || p.isOptionalMemberExpression())
                return memberOrigin(origin(p.get("object") as NodePath, id, seen), propertyName(p));
            if (!p.isCallExpression()) return undefined;
            const callee = p.get("callee");
            if (!callee.isMemberExpression() || origin(callee.get("object"), id, seen) !== "builder")
                return undefined;
            const method = propertyName(callee);
            if (method === "createUtils") return "utils";
            if (["withAutoLogin", "withClientUser", "withServerUser"].includes(method ?? ""))
                return "builder";
            return undefined;
        };

        for (const [id, source] of sources) {
            source.program.traverse({
                CallExpression(call) {
                    if (origin(call.get("callee"), id) !== "bootstrap") return;
                    let callback: NodePath = call.get("arguments")[0];
                    if (!callback) fail(id, call, "bootstrapOidc requires an argument.");
                    callback = unwrap(callback);
                    const seenCallbacks = new Set<object>();
                    while (callback.isIdentifier()) {
                        const binding = callback.scope.getBinding(callback.node.name);
                        if (!binding?.constant || seenCallbacks.has(binding.path.node)) break;
                        seenCallbacks.add(binding.path.node);
                        if (binding.path.isFunctionDeclaration()) {
                            callback = binding.path;
                            break;
                        }
                        if (!binding.path.isVariableDeclarator()) break;
                        callback = unwrap(binding.path.get("init") as NodePath);
                    }
                    // Direct configuration objects do not receive the env proxy.
                    if (callback.isObjectExpression()) return;
                    if (!callback.isFunction())
                        fail(
                            id,
                            callback,
                            "Use an inline callback or a locally declared callback so its environment accesses can be analyzed."
                        );
                    if (callback.node.async || callback.node.generator)
                        fail(id, callback, "The bootstrap callback must be synchronous.");

                    type ValueKind = "argument" | "process" | "env";
                    const visited = new Set<object>();
                    const followPattern = (pattern: NodePath, kind: ValueKind): void => {
                        if (pattern.isIdentifier()) {
                            const binding = pattern.scope.getBinding(pattern.node.name);
                            if (!binding || !binding.constant)
                                fail(id, pattern, "Do not reassign the bootstrap environment bindings.");
                            if (visited.has(binding)) return;
                            visited.add(binding);
                            binding.referencePaths.forEach(reference =>
                                followReference(reference, kind)
                            );
                            return;
                        }
                        if (!pattern.isObjectPattern())
                            fail(
                                id,
                                pattern,
                                "Use named properties when destructuring the bootstrap environment; rest and default bindings are unsupported."
                            );
                        for (const property of pattern.get("properties")) {
                            if (!property.isObjectProperty())
                                fail(id, property, "Do not spread the bootstrap environment.");
                            const name = propertyName(property);
                            if (name === undefined)
                                fail(
                                    id,
                                    property,
                                    "Environment variable names must be literal properties."
                                );
                            if (kind === "env") {
                                names.add(name);
                                const value = property.get("value");
                                if (value.isIdentifier()) {
                                    const binding = value.scope.getBinding(value.node.name);
                                    if (binding !== undefined) {
                                        envNameByBinding.set(binding, name);
                                    }
                                }
                                continue;
                            }
                            if (name !== (kind === "argument" ? "process" : "env"))
                                fail(
                                    id,
                                    property,
                                    "Only process.env is available in the bootstrap environment."
                                );
                            followPattern(
                                property.get("value"),
                                kind === "argument" ? "process" : "env"
                            );
                        }
                    };
                    const followReference = (reference: NodePath, kind: ValueKind): void => {
                        let parent = reference.parentPath;
                        while (
                            parent &&
                            (parent.isTSAsExpression() ||
                                parent.isTSSatisfiesExpression() ||
                                parent.isTSNonNullExpression() ||
                                parent.isParenthesizedExpression())
                        ) {
                            reference = parent;
                            parent = reference.parentPath;
                        }
                        if (!parent) return;
                        if (parent.isMemberExpression() || parent.isOptionalMemberExpression()) {
                            if (parent.get("object") !== reference)
                                fail(
                                    id,
                                    reference,
                                    "The bootstrap environment cannot be used as a property key."
                                );
                            const name = propertyName(parent);
                            if (name === undefined)
                                fail(
                                    id,
                                    parent,
                                    'Use process.env.NAME or process.env["NAME"]; computed environment variable names cannot be authorized safely.'
                                );
                            if (kind === "env") {
                                const use = parent.parentPath;
                                if (
                                    (use?.isAssignmentExpression() && use.get("left") === parent) ||
                                    use?.isUpdateExpression() ||
                                    use?.isUnaryExpression({ operator: "delete" })
                                )
                                    fail(id, parent, "Do not mutate the bootstrap environment.");
                                names.add(name);
                                envNameByExpression.set(parent.node, name);
                                return;
                            }
                            if (name !== (kind === "argument" ? "process" : "env"))
                                fail(
                                    id,
                                    parent,
                                    "Only process.env is available in the bootstrap environment."
                                );
                            followReference(parent, kind === "argument" ? "process" : "env");
                            return;
                        }
                        if (parent.isVariableDeclarator() && parent.get("init") === reference) {
                            followPattern(parent.get("id"), kind);
                            return;
                        }
                        if (
                            kind === "env" &&
                            parent.isBinaryExpression({ operator: "in" }) &&
                            parent.get("right") === reference
                        ) {
                            const name = parent.get("left");
                            if (!name.isStringLiteral())
                                fail(
                                    id,
                                    name,
                                    "Use a string literal for environment membership checks."
                                );
                            names.add(name.node.value);
                            return;
                        }
                        if (parent.isTSTypeQuery()) return;
                        fail(
                            id,
                            reference,
                            "Do not pass, spread, or return the bootstrap environment object. Read its literal named variables inside the callback instead."
                        );
                    };
                    const parameter = callback.get("params")[0];
                    if (parameter) followPattern(parameter, "argument");

                    const getEnvNamesFromExpression = (input: NodePath): Set<string> => {
                        const result = new Set<string>();
                        const visited = new Set<object>();

                        const visit = (input: NodePath) => {
                            const p = unwrap(input);

                            if (!p.node || visited.has(p.node)) {
                                return;
                            }
                            visited.add(p.node);

                            const envName = envNameByExpression.get(p.node);
                            if (envName !== undefined) {
                                result.add(envName);
                            }

                            if (p.isIdentifier()) {
                                const binding = p.scope.getBinding(p.node.name);

                                if (binding !== undefined) {
                                    const envName = envNameByBinding.get(binding);
                                    if (envName !== undefined) {
                                        result.add(envName);
                                    }

                                    if (binding.path.isVariableDeclarator()) {
                                        const init = binding.path.get("init") as NodePath;
                                        if (init.node !== null) {
                                            visit(init);
                                        }
                                    }
                                }
                            }

                            p.traverse({
                                MemberExpression(member) {
                                    const envName = envNameByExpression.get(member.node);
                                    if (envName !== undefined) {
                                        result.add(envName);
                                    }
                                },
                                OptionalMemberExpression(member) {
                                    const envName = envNameByExpression.get(member.node);
                                    if (envName !== undefined) {
                                        result.add(envName);
                                    }
                                },
                                Identifier(identifier) {
                                    if (identifier === p) {
                                        return;
                                    }
                                    visit(identifier);
                                }
                            });
                        };

                        visit(input);

                        return result;
                    };

                    callback.traverse({
                        ObjectProperty(property) {
                            const name = propertyName(property);
                            if (name === undefined || !redactedPropertyNames.has(name)) {
                                return;
                            }

                            for (const envName of getEnvNamesFromExpression(property.get("value"))) {
                                toRedactEnvNames.add(envName);
                            }
                        }
                    });
                }
            });
        }
        return {
            publicEnvNames: [...names].filter(name => !toRedactEnvNames.has(name)).sort(),
            toRedactEnvNames: [...toRedactEnvNames].sort()
        };
    };

    return {
        resolveId: (id: string) => (id === virtualId ? resolvedId : null),
        load: async (
            id: string,
            context: Pick<PluginContext, "resolve" | "addWatchFile"> & {
                environment?: { name?: string };
            }
        ) => {
            if (id !== resolvedId) return null;
            // The manifest is imported by both the client and the server function.
            // During dev, resolving imports through the client environment registers
            // bare dependencies with Vite's optimizer before its initial crawl. Use
            // the server environment's resolver instead: it follows the same Vite
            // resolver hooks without affecting client dependency optimization.
            if (context.environment?.name === "client" && resolvedConfig.command === "serve") {
                if (!resolveFromServerEnvironment) {
                    throw new Error(
                        "oidc-spa: The TanStack Start server resolver is unavailable while generating the public environment manifest."
                    );
                }
                // Vite's context methods live on its prototype and depend on `this`.
                context = {
                    addWatchFile: context.addWatchFile.bind(context),
                    resolve: resolveFromServerEnvironment
                };
            }
            const { publicEnvNames, toRedactEnvNames } = await (scanPromise ??= scan(context));
            return [
                `export const publicEnvNames = new Set(${JSON.stringify(publicEnvNames)});`,
                `export const toRedactEnvNames = new Set(${JSON.stringify(toRedactEnvNames)});`,
                ""
            ].join("\n");
        },
        configureServer: (server: ViteDevServer) => {
            const serverEnvironment = Object.values(server.environments).find(
                environment => environment.config?.consumer === "server"
            );
            if (serverEnvironment) {
                resolveFromServerEnvironment = async (specifier, importer) =>
                    (await serverEnvironment.pluginContainer.resolveId(specifier, importer)) as Awaited<
                        ReturnType<PluginContext["resolve"]>
                    >;
            }
            const onSourceChange = (id: string) => {
                if (!isSourceFile(id) || id.includes(`${path.sep}node_modules${path.sep}`)) return;
                scanPromise = undefined;
                // The virtual module has no real filename for Vite to invalidate.
                // Revoke removed names as well as discovering newly added names.
                for (const environment of Object.values(server.environments)) {
                    const module = environment.moduleGraph.getModuleById(resolvedId);
                    if (!module) continue;
                    environment.moduleGraph.invalidateModule(module);
                    environment.hot.send({ type: "full-reload" });
                }
            };
            server.watcher
                .on("add", onSourceChange)
                .on("change", onSourceChange)
                .on("unlink", onSourceChange);
            server.httpServer?.once("close", () => {
                server.watcher
                    .off("add", onSourceChange)
                    .off("change", onSourceChange)
                    .off("unlink", onSourceChange);
            });
        }
    };
}
