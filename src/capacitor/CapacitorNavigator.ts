import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import type { AsyncStorage, IWindow } from "../vendor/frontend/oidc-client-ts";
import { hasOidcRedirectResponse } from "../core/parseOidcRedirectUrl";
import { BaseNavigator, type BaseNavigatorWarning } from "../core/BaseNavigator";
import { initializeExternalRedirectUrl, setExternalRedirectUrl } from "../core/externalRedirectUrl";

export type CapacitorCallbackUrlPolicy = "strict" | "tolerant";

export type NativeAuthorizationRequest = Readonly<{
    configId: string;
    authorizationUrl: string;
    state: string;
}>;

type CapacitorNavigatorParams = {
    callbackUrlPolicy?: CapacitorCallbackUrlPolicy;
    browserFinishedGracePeriodMs?: number;
    /** Awaited for sign-in only; rejection prevents Browser.open. */
    beforeBrowserOpen?: (request: NativeAuthorizationRequest) => Promise<void>;
    /** Enable only with a token adapter that validates the accepted callback handoff. */
    persistAcceptedLaunchCallbackToTokenStorage?: boolean;
};

export class CapacitorNavigator extends BaseNavigator {
    static readonly DEFAULT_BROWSER_FINISHED_GRACE_PERIOD_MS = 1_000;
    static readonly MIN_BROWSER_FINISHED_GRACE_PERIOD_MS = 100;
    static readonly MAX_BROWSER_FINISHED_GRACE_PERIOD_MS = 10_000;

    readonly #callbackUrlPolicy: CapacitorCallbackUrlPolicy;
    readonly #browserFinishedGracePeriodMs: number;
    readonly #beforeBrowserOpen: CapacitorNavigatorParams["beforeBrowserOpen"];
    readonly #persistAcceptedLaunchCallbackToTokenStorage: boolean;

    #listenerRemove: (() => void) | undefined;
    #browserFinishedListenerRemove: (() => void) | undefined;
    #browserFinishedTimeoutId: ReturnType<typeof setTimeout> | undefined;
    readonly #authFlowAbortedListeners = new Set<() => void>();
    #prHasAcceptedLaunchCallback: Promise<boolean> | undefined;
    #isValidForCurrentFlow: ((url: string) => Promise<boolean>) | undefined;
    #callbackQueue: Promise<void> = Promise.resolve();
    #hasCommittedCallback = false;

    constructor(params: CapacitorNavigatorParams = {}) {
        super();

        const {
            callbackUrlPolicy = "tolerant",
            browserFinishedGracePeriodMs = CapacitorNavigator.DEFAULT_BROWSER_FINISHED_GRACE_PERIOD_MS,
            beforeBrowserOpen,
            persistAcceptedLaunchCallbackToTokenStorage = false
        } = params;

        this.#callbackUrlPolicy = callbackUrlPolicy;
        this.#beforeBrowserOpen = beforeBrowserOpen;
        this.#persistAcceptedLaunchCallbackToTokenStorage = persistAcceptedLaunchCallbackToTokenStorage;
        this.#browserFinishedGracePeriodMs = Math.max(
            CapacitorNavigator.MIN_BROWSER_FINISHED_GRACE_PERIOD_MS,
            Math.min(
                CapacitorNavigator.MAX_BROWSER_FINISHED_GRACE_PERIOD_MS,
                browserFinishedGracePeriodMs
            )
        );
    }

    #emitWarning(params: { code: string; message: string; error?: unknown }): void {
        const { code, message } = params;

        const configId = this.configId ?? "unknown";

        this.onWarning?.({
            code,
            message,
            configId
        });

        console.warn(`oidc-spa: ${message}`);
    }

    #emitAuthFlowAborted(): void {
        try {
            this.onAuthFlowAborted?.();
        } catch (error) {
            this.#emitWarning({
                code: "CAPACITOR_AUTH_FLOW_ABORTED_HANDLER_FAILED",
                message: "The internal auth flow aborted handler threw an error.",
                error
            });
        }

        for (const listener of this.#authFlowAbortedListeners) {
            try {
                listener();
            } catch (error) {
                this.#emitWarning({
                    code: "CAPACITOR_AUTH_FLOW_ABORTED_LISTENER_FAILED",
                    message: "An auth flow aborted listener threw an error.",
                    error
                });
            }
        }
    }

    addAuthFlowAbortedListener(listener: () => void): () => void {
        this.#authFlowAbortedListeners.add(listener);

        return () => {
            this.#authFlowAbortedListeners.delete(listener);
        };
    }

    #getCallbackIdentity(params: { url: string }): string | undefined {
        const { url } = params;

        try {
            const parsedUrl = new URL(url);

            const normalizedPathname = (() => {
                if (this.#callbackUrlPolicy === "strict") {
                    return parsedUrl.pathname;
                }

                if (parsedUrl.pathname === "" || parsedUrl.pathname === "/") {
                    return "/";
                }

                return parsedUrl.pathname.replace(/\/+$/, "");
            })();

            return `${parsedUrl.protocol}//${parsedUrl.host}${normalizedPathname}`;
        } catch {
            return undefined;
        }
    }

    #isAllowedCallbackUrl(params: { url: string }): boolean {
        const { url } = params;

        if (this.callbackUrl === undefined) {
            return true;
        }

        const expectedIdentity = this.#getCallbackIdentity({ url: this.callbackUrl });
        const actualIdentity = this.#getCallbackIdentity({ url });

        if (expectedIdentity === undefined || actualIdentity === undefined) {
            return false;
        }

        return expectedIdentity === actualIdentity;
    }

    #warnBlockedCallback(params: {
        source: "launch" | "appUrlOpen" | "callback";
        receivedUrl: string;
    }): void {
        const { source } = params;

        this.#emitWarning({
            code: "CAPACITOR_CALLBACK_URL_BLOCKED",
            message: [
                "Blocked native callback URL because it does not match the configured callback URL.",
                `Source: ${source}.`
            ].join(" ")
        });
    }

    #isAllowedCallbackOrWarn(params: {
        source: "launch" | "appUrlOpen" | "callback";
        url: string;
    }): boolean {
        const { source, url } = params;

        if (this.#isAllowedCallbackUrl({ url })) {
            return true;
        }

        this.#warnBlockedCallback({ source, receivedUrl: url });

        return false;
    }

    async #isExpectedCallback(url: string): Promise<boolean> {
        try {
            const parsedUrl = new URL(url);
            const stateCount =
                parsedUrl.searchParams.getAll("state").length +
                new URLSearchParams(parsedUrl.hash.replace(/^#/, "")).getAll("state").length;

            if (
                stateCount === 1 &&
                this.#isValidForCurrentFlow !== undefined &&
                (await this.#isValidForCurrentFlow(url))
            ) {
                return true;
            }
        } catch {
            // A failed state-store read must not accept the callback.
        }

        this.#emitWarning({
            code: "CAPACITOR_CALLBACK_STATE_REJECTED",
            message: "Blocked native callback because its OIDC state is not valid for the current flow."
        });
        return false;
    }

    #getRequiredInitialization(): { configId: string; tokenStorageAdapter: AsyncStorage } {
        if (this.configId === undefined || this.tokenStorageAdapter === undefined) {
            throw new Error(
                "oidc-spa: CapacitorNavigator has not been initialized. The navigator must be initialized by createOidc() before use."
            );
        }

        return {
            configId: this.configId,
            tokenStorageAdapter: this.tokenStorageAdapter
        };
    }

    override initialize(params: {
        storageAdapter?: AsyncStorage;
        tokenStorageAdapter: AsyncStorage;
        configId: string;
        callbackUrl?: string;
        isValidForCurrentFlow?: (url: string) => Promise<boolean>;
        onWarning?: (warning: BaseNavigatorWarning) => void;
        onAuthFlowAborted?: () => void;
    }): Promise<boolean> {
        reinitialize_guard: {
            if (this.configId === undefined && this.tokenStorageAdapter === undefined) {
                break reinitialize_guard;
            }

            if (
                this.configId !== params.configId ||
                this.storageAdapter !== params.storageAdapter ||
                this.tokenStorageAdapter !== params.tokenStorageAdapter ||
                this.callbackUrl !== params.callbackUrl ||
                this.#isValidForCurrentFlow !== params.isValidForCurrentFlow ||
                this.onWarning !== params.onWarning ||
                this.onAuthFlowAborted !== params.onAuthFlowAborted
            ) {
                throw new Error(
                    "oidc-spa: Attempted to reinitialize the same CapacitorNavigator instance with different initialization parameters. Create a new navigator instance per OIDC instance."
                );
            }

            return this.#prHasAcceptedLaunchCallback!;
        }

        super.initialize(params);
        this.#isValidForCurrentFlow = params.isValidForCurrentFlow;

        const { configId, tokenStorageAdapter } = this.#getRequiredInitialization();

        this.#prHasAcceptedLaunchCallback = initializeExternalRedirectUrl({
            configId,
            storageAdapter: this.storageAdapter,
            prExternalRedirectUrl: App.getLaunchUrl().then(async result => {
                const url = result?.url;

                if (url === undefined || !hasOidcRedirectResponse(url).hasAuthResponseInUrl) {
                    return undefined;
                }

                if (!this.#isAllowedCallbackOrWarn({ source: "launch", url })) {
                    return undefined;
                }

                if (!(await this.#isExpectedCallback(url))) {
                    return undefined;
                }

                return url;
            }),
            tokenStorageAdapter,
            persistLaunchUrl: this.#persistAcceptedLaunchCallbackToTokenStorage,
            onWarning: warning => {
                this.onWarning?.(warning);
            }
        }).then(url => url !== undefined);

        return this.#prHasAcceptedLaunchCallback;
    }

    #cleanupListener(): void {
        this.#listenerRemove?.();
        this.#listenerRemove = undefined;
    }

    #enqueueCallback(operation: () => Promise<void>): Promise<void> {
        const next = this.#callbackQueue.then(async () => {
            if (!this.#hasCommittedCallback) {
                await operation();
            }
        });
        this.#callbackQueue = next.catch(() => {});
        return next;
    }

    #cleanupBrowserFinishedListenerRemove(): void {
        this.#browserFinishedListenerRemove?.();
        this.#browserFinishedListenerRemove = undefined;
    }

    #clearBrowserFinishedTimeout(): void {
        if (this.#browserFinishedTimeoutId === undefined) {
            return;
        }

        clearTimeout(this.#browserFinishedTimeoutId);
        this.#browserFinishedTimeoutId = undefined;
    }

    async #closeBrowserIfNotAndroid(): Promise<void> {
        if ((await Capacitor.getPlatform()) !== "android") {
            await Browser.close();
        }
    }

    async prepare(_params: unknown): Promise<IWindow> {
        this.#hasCommittedCallback = false;
        this.#cleanupListener();
        this.#cleanupBrowserFinishedListenerRemove();
        this.#clearBrowserFinishedTimeout();

        this.#listenerRemove = (
            await App.addListener("appUrlOpen", event =>
                this.#enqueueCallback(async () => {
                    if (!hasOidcRedirectResponse(event.url).hasAuthResponseInUrl) {
                        return;
                    }

                    if (!this.#isAllowedCallbackOrWarn({ source: "appUrlOpen", url: event.url })) {
                        return;
                    }

                    if (!(await this.#isExpectedCallback(event.url))) {
                        return;
                    }

                    this.#clearBrowserFinishedTimeout();
                    this.#cleanupBrowserFinishedListenerRemove();
                    this.#cleanupListener();

                    const { configId, tokenStorageAdapter } = this.#getRequiredInitialization();

                    try {
                        await setExternalRedirectUrl({
                            configId,
                            url: event.url,
                            storageAdapter: this.storageAdapter,
                            tokenStorageAdapter
                        });

                        this.#hasCommittedCallback = true;

                        await this.#closeBrowserIfNotAndroid();
                    } catch {
                        this.#emitWarning({
                            code: "CAPACITOR_APP_URL_OPEN_REDIRECT_FAILED",
                            message: "Failed to complete native redirect flow from appUrlOpen handler."
                        });
                        return;
                    }

                    window.location.reload();
                })
            )
        ).remove;

        return {
            navigate: async ({ url, state, response_mode }) => {
                this.#clearBrowserFinishedTimeout();
                this.#cleanupBrowserFinishedListenerRemove();
                this.#browserFinishedListenerRemove = (
                    await Browser.addListener("browserFinished", async () => {
                        this.#cleanupBrowserFinishedListenerRemove();
                        this.#clearBrowserFinishedTimeout();
                        this.#browserFinishedTimeoutId = setTimeout(() => {
                            this.#browserFinishedTimeoutId = undefined;
                            this.#emitAuthFlowAborted();
                        }, this.#browserFinishedGracePeriodMs);
                    })
                ).remove;

                let beforeBrowserOpenPhase: "state" | "hook" | undefined;

                try {
                    // oidc-client-ts passes response_mode for sign-in and omits it for
                    // sign-out. A sign-out URL may contain an id_token_hint.
                    if (this.#beforeBrowserOpen !== undefined && response_mode !== undefined) {
                        beforeBrowserOpenPhase = "state";
                        let states: string[];

                        try {
                            states = new URL(url).searchParams.getAll("state");
                        } catch {
                            throw new Error("Native authorization request has an invalid OIDC state.");
                        }

                        if (
                            states.length !== 1 ||
                            !states[0] ||
                            typeof state !== "string" ||
                            states[0] !== state
                        ) {
                            throw new Error("Native authorization request has an invalid OIDC state.");
                        }

                        beforeBrowserOpenPhase = "hook";
                        try {
                            await this.#beforeBrowserOpen({
                                configId: this.#getRequiredInitialization().configId,
                                authorizationUrl: url,
                                state
                            });
                        } catch {
                            throw new Error("Native authorization handoff failed.");
                        }

                        beforeBrowserOpenPhase = undefined;
                    }

                    await Browser.open({ url });
                } catch (error) {
                    this.#clearBrowserFinishedTimeout();
                    this.#cleanupBrowserFinishedListenerRemove();
                    this.#cleanupListener();

                    if (beforeBrowserOpenPhase !== undefined) {
                        this.#emitWarning({
                            code:
                                beforeBrowserOpenPhase === "state"
                                    ? "CAPACITOR_AUTH_REQUEST_STATE_INVALID"
                                    : "CAPACITOR_AUTH_REQUEST_HANDOFF_FAILED",
                            message:
                                beforeBrowserOpenPhase === "state"
                                    ? "Native authorization request has an invalid OIDC state."
                                    : "Failed to persist native authorization request before opening the browser."
                        });
                    } else {
                        this.#emitWarning({
                            code: "CAPACITOR_NAVIGATE_OPEN_FAILED",
                            message: "Failed to open native browser during navigate().",
                            error
                        });
                    }

                    throw error;
                }

                return { url };
            },
            close: () => {
                this.#clearBrowserFinishedTimeout();
                this.#cleanupListener();
                this.#cleanupBrowserFinishedListenerRemove();

                void (async () => {
                    try {
                        await this.#closeBrowserIfNotAndroid();
                    } catch (error) {
                        this.#emitWarning({
                            code: "CAPACITOR_CLOSE_BROWSER_FAILED",
                            message: "Failed to close native browser during close().",
                            error
                        });
                    }
                })();
            }
        };
    }

    async callback(url: string, _params?: unknown): Promise<void> {
        return this.#enqueueCallback(async () => {
            // NOTE: This method is required by the INavigator contract.
            // In Capacitor, callback handling is normally done via
            // App.getLaunchUrl()/App.addListener("appUrlOpen", ...).
            // This implementation is a defensive compatibility fallback
            // in case navigator.callback() is invoked by upstream flows.
            if (!hasOidcRedirectResponse(url).hasAuthResponseInUrl) {
                return;
            }

            if (!this.#isAllowedCallbackOrWarn({ source: "callback", url })) {
                return;
            }

            if (!(await this.#isExpectedCallback(url))) {
                return;
            }

            this.#clearBrowserFinishedTimeout();
            this.#cleanupBrowserFinishedListenerRemove();
            this.#cleanupListener();

            const { configId, tokenStorageAdapter } = this.#getRequiredInitialization();

            try {
                await setExternalRedirectUrl({
                    configId,
                    url,
                    storageAdapter: this.storageAdapter,
                    tokenStorageAdapter
                });

                this.#hasCommittedCallback = true;

                await this.#closeBrowserIfNotAndroid();
            } catch {
                this.#emitWarning({
                    code: "CAPACITOR_CALLBACK_REDIRECT_FAILED",
                    message: "Failed to complete native redirect flow from callback()."
                });
                return;
            }

            window.location.reload();
        });
    }
}
