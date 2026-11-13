import type { Plugin, ResolvedConfig } from "vite";
import type { OidcSpaVitePluginParams } from "./vite-plugin";

type HookHandler<Hook> = Hook extends { handler: infer Handler } ? Handler : Hook;
type HookName = "resolveId" | "load" | "transform" | "buildStart" | "configureServer" | "generateBundle";

// Use Vite's function signatures, including each hook's `this` context.
export type Handlers = {
    [Name in HookName]?: HookHandler<NonNullable<Plugin[Name]>>;
};

export type HandlerFactoryParams = {
    oidcSpaVitePluginParams: OidcSpaVitePluginParams;
    resolvedConfig: ResolvedConfig;
};
