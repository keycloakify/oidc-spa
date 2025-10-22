import { MagicString } from "../vendor/build-runtime/magic-string";
import { recast, babelParser, babelGenerate, babelTypes } from "../vendor/build-runtime/recast+babel";
import type { types } from "recast";

const ENABLE_IMPORT_SPECIFIER = "enableUnifiedClientRetryForSsrLoaders";
const ENABLE_IMPORT_SOURCE = "oidc-spa/react-tanstack-start/rfcUnifiedClientRetryForSsrLoaders";
const CREATE_FILE_ROUTE_IDENTIFIER = "createFileRoute";

type ASTNode = types.ASTNode;
type ExpressionNode = any;
type CallExpressionNode = any;
type ImportDeclarationNode = any;

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

    const magicString = new MagicString(code);
    const lineOffsets = getLineOffsets(code);

    let ast: ASTNode;

    try {
        ast = recast.parse(code, {
            parser: {
                parse: (code: string) =>
                    babelParser.parse(code, {
                        sourceType: "module",
                        plugins: ["typescript", "jsx"]
                    }),
                generator: babelGenerate,
                types: babelTypes
            },
            sourceFileName: cleanId
        }) as types.ASTNode;
    } catch (error) {
        return null;
    }

    const { hasCreateFileRouteImport, hasEnableImport, lastImportEnd } = analyseImports(
        ast,
        lineOffsets
    );

    if (!hasCreateFileRouteImport) {
        return null;
    }

    const { mutated } = wrapRouteConfigurations(ast, code, magicString, lineOffsets);

    if (!mutated) {
        return null;
    }

    if (!hasEnableImport) {
        ensureEnableImport({
            magicString,
            lastImportEnd
        });
    }

    return {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true, source: cleanId })
    };
}

function wrapRouteConfigurations(
    ast: ASTNode,
    code: string,
    magicString: MagicString,
    lineOffsets: number[]
): { mutated: boolean } {
    const { types } = recast;
    const { namedTypes: n, visit } = types;

    let mutated = false;

    visit(ast, {
        visitCallExpression(path) {
            const outerCall = path.node;

            if (!n.CallExpression.check(outerCall)) {
                return this.traverse(path);
            }

            if (!n.CallExpression.check(outerCall.callee)) {
                return this.traverse(path);
            }

            const innerCall = outerCall.callee;

            if (!isCreateFileRouteCall(innerCall)) {
                return this.traverse(path);
            }

            if (outerCall.arguments.length === 0) {
                return this.traverse(path);
            }

            const configExpression = outerCall.arguments[0] as ExpressionNode;

            if (isAlreadyWrapped(configExpression)) {
                return this.traverse(path);
            }

            const argStart = getNodeStart(configExpression, lineOffsets);
            const argEnd = getNodeEnd(configExpression, lineOffsets);

            const original = code.slice(argStart, argEnd);
            const wrapped = `${ENABLE_IMPORT_SPECIFIER}(${original})`;

            magicString.overwrite(argStart, argEnd, wrapped);
            mutated = true;

            return this.traverse(path);
        }
    });

    return { mutated };
}

function isCreateFileRouteCall(node: CallExpressionNode): boolean {
    const { types } = recast;
    const { namedTypes: n } = types;

    if (!n.Identifier.check(node.callee)) {
        return false;
    }

    return node.callee.name === CREATE_FILE_ROUTE_IDENTIFIER;
}

function isAlreadyWrapped(expression: ExpressionNode): boolean {
    const { types } = recast;
    const { namedTypes: n } = types;

    if (!n.CallExpression.check(expression)) {
        return false;
    }

    if (!n.Identifier.check(expression.callee)) {
        return false;
    }

    return expression.callee.name === ENABLE_IMPORT_SPECIFIER;
}

function analyseImports(
    ast: ASTNode,
    lineOffsets: number[]
): {
    hasCreateFileRouteImport: boolean;
    hasEnableImport: boolean;
    lastImportEnd: number | undefined;
} {
    const { types } = recast;
    const { namedTypes: n, visit } = types;

    let hasCreateFileRouteImport = false;
    let hasEnableImport = false;
    let lastImportEnd: number | undefined;

    visit(ast, {
        visitImportDeclaration(path) {
            const node = path.node;

            if (!n.Literal.check(node.source)) {
                return this.traverse(path);
            }

            const source = node.source.value;
            if (typeof source !== "string") {
                return this.traverse(path);
            }

            const importEnd = getNodeEnd(node, lineOffsets);
            lastImportEnd = lastImportEnd === undefined ? importEnd : Math.max(lastImportEnd, importEnd);

            if (source === "@tanstack/react-router") {
                if (containsNamedImport(node, CREATE_FILE_ROUTE_IDENTIFIER)) {
                    hasCreateFileRouteImport = true;
                }
            }

            if (source === ENABLE_IMPORT_SOURCE) {
                if (containsNamedImport(node, ENABLE_IMPORT_SPECIFIER)) {
                    hasEnableImport = true;
                }
            }

            return this.traverse(path);
        }
    });

    return {
        hasCreateFileRouteImport,
        hasEnableImport,
        lastImportEnd
    };
}

function containsNamedImport(node: ImportDeclarationNode, specifierName: string): boolean {
    const specifiers = (node.specifiers ?? []) as any[];

    for (const specifierRaw of specifiers) {
        const specifier = specifierRaw as any;

        if (specifier.type !== "ImportSpecifier") {
            continue;
        }

        if (specifier.imported.type === "Identifier" && specifier.imported.name === specifierName) {
            return true;
        }
    }

    return false;
}

function ensureEnableImport(params: { magicString: MagicString; lastImportEnd: number | undefined }) {
    const { magicString, lastImportEnd } = params;

    const insertionPoint = lastImportEnd ?? 0;
    const prefix = insertionPoint === 0 ? "" : "\n";

    magicString.appendLeft(
        insertionPoint,
        `${prefix}import { ${ENABLE_IMPORT_SPECIFIER} } from "${ENABLE_IMPORT_SOURCE}";\n`
    );
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

function getLineOffsets(code: string): number[] {
    const offsets: number[] = [0];

    for (let index = 0; index < code.length; index++) {
        if (code[index] === "\n") {
            offsets.push(index + 1);
        }
    }

    return offsets;
}

function getNodeStart(node: ASTNode, lineOffsets: number[]): number {
    const nodeAny = node as any;

    if (typeof nodeAny.start === "number") {
        return nodeAny.start as number;
    }

    if (Array.isArray(nodeAny.range)) {
        return nodeAny.range[0] as number;
    }

    if (nodeAny.loc) {
        return offsetFromLoc(nodeAny.loc.start, lineOffsets);
    }

    throw new Error("Unable to determine start position");
}

function getNodeEnd(node: ASTNode, lineOffsets: number[]): number {
    const nodeAny = node as any;

    if (typeof nodeAny.end === "number") {
        return nodeAny.end as number;
    }

    if (Array.isArray(nodeAny.range)) {
        return nodeAny.range[1] as number;
    }

    if (nodeAny.loc) {
        return offsetFromLoc(nodeAny.loc.end, lineOffsets);
    }

    throw new Error("Unable to determine end position");
}

function offsetFromLoc(loc: { line: number; column: number }, lineOffsets: number[]): number {
    const lineIndex = Math.max(0, loc.line - 1);
    const column = loc.column;
    const base = lineOffsets[lineIndex] ?? 0;
    return base + column;
}
