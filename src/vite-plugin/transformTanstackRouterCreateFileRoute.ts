import { MagicString } from "../vendor/build-runtime/magic-string";
import { babelParser, babelTraverse, babelTypes as t } from "../vendor/build-runtime/babel";

const DISABLE_SSR_SPECIFIER = "__disableSsrIfLoginEnforced";
const DISABLE_SSR_SOURCE = "oidc-spa/react-tanstack-start";
const CREATE_FILE_ROUTE_IDENTIFIER = "createFileRoute";

type TransformParams = {
    code: string;
    id: string;
};

type TransformResult = {
    code: string;
    map: any;
};

export function transformCreateFileRoute(params: TransformParams): TransformResult | null {
    const { code, id } = params;
    const cleanId = sanitizeId(id);

    if (!isCandidateFile(cleanId)) {
        return null;
    }

    let ast: ReturnType<typeof babelParser.parse>;
    try {
        ast = babelParser.parse(code, {
            sourceType: "module",
            plugins: ["typescript", "jsx"]
        });
    } catch {
        return null;
    }

    const magicString = new MagicString(code);
    let hasCreateFileRouteImport = false;
    let hasEnableImport = false;
    let requiresEnableImport = false;
    let lastImportEnd: number | undefined;
    let mutated = false;

    babelTraverse(ast, {
        ImportDeclaration(path) {
            const sourceValue = path.node.source.value;
            if (typeof sourceValue !== "string") {
                return;
            }

            const end = path.node.end ?? undefined;
            if (typeof end === "number") {
                lastImportEnd = lastImportEnd === undefined ? end : Math.max(lastImportEnd, end);
            }

            if (sourceValue === "@tanstack/react-router") {
                if (
                    path.node.specifiers.some(
                        specifier =>
                            t.isImportSpecifier(specifier) &&
                            t.isIdentifier(specifier.imported, { name: CREATE_FILE_ROUTE_IDENTIFIER })
                    )
                ) {
                    hasCreateFileRouteImport = true;
                }
            }

            if (sourceValue === DISABLE_SSR_SOURCE) {
                if (
                    path.node.specifiers.some(
                        specifier =>
                            t.isImportSpecifier(specifier) &&
                            t.isIdentifier(specifier.imported, { name: DISABLE_SSR_SPECIFIER })
                    )
                ) {
                    hasEnableImport = true;
                }
            }
        },
        CallExpression(path) {
            const callee = path.get("callee");
            if (!callee.isCallExpression()) {
                return;
            }

            const innerCallee = callee.get("callee");
            if (!innerCallee.isIdentifier({ name: CREATE_FILE_ROUTE_IDENTIFIER })) {
                return;
            }

            const args = path.get("arguments");
            if (args.length === 0) {
                return;
            }

            const configArg = args[0];
            if (!configArg.isObjectExpression()) {
                return;
            }

            const configNode = configArg.node;
            let localMutated = false;

            if (objectContainsLoaderOrBeforeLoad(configNode)) {
                const start = configNode.start ?? undefined;
                const end = configNode.end ?? undefined;

                if (typeof start === "number" && typeof end === "number") {
                    magicString.appendLeft(start, `${DISABLE_SSR_SPECIFIER}(`);
                    magicString.appendRight(end, ")");
                    requiresEnableImport = true;
                    localMutated = true;
                }
            }

            if (localMutated) {
                mutated = true;
            }
        }
    });

    if (!mutated || !hasCreateFileRouteImport) {
        return null;
    }

    const importStatements: string[] = [];

    if (requiresEnableImport && !hasEnableImport) {
        importStatements.push(`import { ${DISABLE_SSR_SPECIFIER} } from "${DISABLE_SSR_SOURCE}";`);
    }

    if (importStatements.length > 0) {
        const insertionPoint = lastImportEnd ?? 0;
        const prefix = insertionPoint === 0 ? "" : "\n";
        const suffix = "\n";
        magicString.appendLeft(insertionPoint, `${prefix}${importStatements.join("\n")}${suffix}`);
    }

    return {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true, source: cleanId })
    };
}

function objectContainsLoaderOrBeforeLoad(node: t.ObjectExpression): boolean {
    return node.properties.some(prop => {
        if (!t.isObjectProperty(prop)) {
            return false;
        }

        const key = prop.key;
        if (t.isIdentifier(key)) {
            return key.name === "loader" || key.name === "beforeLoad";
        }

        if (t.isStringLiteral(key)) {
            return key.value === "loader" || key.value === "beforeLoad";
        }

        return false;
    });
}

function isCandidateFile(id: string): boolean {
    if (id.includes("node_modules")) {
        return false;
    }
    return /\.(?:ts|tsx|js|jsx)$/.test(id);
}

function sanitizeId(id: string): string {
    const queryIndex = id.indexOf("?");
    if (queryIndex === -1) {
        return id;
    }
    return id.slice(0, queryIndex);
}
