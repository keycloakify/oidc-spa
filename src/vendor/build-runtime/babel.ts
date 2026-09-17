export * as babelParser from "@babel/parser";
import babelGenerate_import from "@babel/generator";
// Babel's CommonJS entrypoints expose their callable export under `default`.
// Native ESM and bundlers do not unwrap these imports in the same way.
export const babelGenerate: typeof babelGenerate_import =
    typeof babelGenerate_import === "function"
        ? babelGenerate_import
        : (babelGenerate_import as { default: typeof babelGenerate_import }).default;
export * as babelTypes from "@babel/types";
import babelTraverse_import from "@babel/traverse";
export const babelTraverse: typeof babelTraverse_import =
    typeof babelTraverse_import === "function"
        ? babelTraverse_import
        : (babelTraverse_import as { default: typeof babelTraverse_import }).default;
export type { NodePath } from "@babel/traverse";
