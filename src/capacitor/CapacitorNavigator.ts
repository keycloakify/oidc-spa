import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import type { AsyncStorage, IWindow } from "../vendor/frontend/oidc-client-ts";
import { hasOidcRedirectResponse } from "../core/parseOidcRedirectUrl";
import { BaseNavigator, type BaseNavigatorWarning } from "../core/BaseNavigator";
import { initializeExternalRedirectUrl, setExternalRedirectUrl } from "../core/externalRedirectUrl";

export type CapacitorCallbackUrlPolicy = "strict" | "tolerant";

type CapacitorNavigatorParams = {
    callbackUrlPolicy?: CapacitorCallbackUrlPolicy;
    browserFinishedGracePeriodMs?: number;
};

export class CapacitorNavigator extends BaseNavigator {
    static readonly DEFAULT_BROWSER_FINISHED_GRACE_PERIOD_MS = 1_000;
    static readonly MIN_BROWSER_FINISHED_GRACE_PERIOD_MS = 100;
    static readonly MAX_BROWSER_FINISHED_GRACE_PERIOD_MS = 10_000;

    readonly #callbackUrlPolicy: CapacitorCallbackUrlPolicy;
    readonly #browserFinishedGracePeriodMs: number;

    #listenerRemove: (() => void) | undefined;
    #browserFinishedListenerRemove: (() => void) | undefined;
    #browserFinishedTimeoutId: ReturnType<typeof setTimeout> | undefined;

    constructor(params: CapacitorNavigatorParams = {}) {
        super();

        const {
            callbackUrlPolicy = "tolerant",
            browserFinishedGracePeriodMs = CapacitorNavigator.DEFAULT_BROWSER_FINISHED_GRACE_PERIOD_MS
        } = params;

        this.#callbackUrlPolicy = callbackUrlPolicy;
        this.#browserFinishedGracePeriodMs = Math.max(
            CapacitorNavigator.MIN_BROWSER_FINISHED_GRACE_PERIOD_MS,
            Math.min(
                CapacitorNavigator.MAX_BROWSER_FINISHED_GRACE_PERIOD_MS,
                browserFinishedGracePeriodMs
            )
        );
    }

    #emitWarning(params: { code: string; message: string; error?: unknown }): void {
        const { code, message, error } = params;

        const errorDetails = (() => {
            if (!(error instanceof Error)) {
                return {};
            }

            return {
                errorName: error.name,
                errorMessage: error.message
            };
        })();

        const configId = this.configId ?? "unknown";

        this.onWarning?.({
            code,
            message,
            configId,
            ...errorDetails
        });

        console.warn(`oidc-spa: ${message}`);
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
        const { source, receivedUrl } = params;

        const expectedIdentity = this.#getCallbackIdentity({ url: this.callbackUrl ?? "" });
        const actualIdentity = this.#getCallbackIdentity({ url: receivedUrl });

        this.#emitWarning({
            code: "CAPACITOR_CALLBACK_URL_BLOCKED",
            message: [
                "Blocked native callback URL because it does not match the configured callback URL.",
                `Source: ${source}.`,
                `Expected: ${expectedIdentity ?? "invalid"}.`,
                `Received: ${actualIdentity ?? "invalid"}.`
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
        tokenStorageAdapter: AsyncStorage;
        configId: string;
        callbackUrl?: string;
        onWarning?: (warning: BaseNavigatorWarning) => void;
        onAuthFlowAborted?: () => void;
    }): void {
        reinitialize_guard: {
            if (this.configId === undefined && this.tokenStorageAdapter === undefined) {
                break reinitialize_guard;
            }

            if (
                this.configId !== params.configId ||
                this.tokenStorageAdapter !== params.tokenStorageAdapter ||
                this.callbackUrl !== params.callbackUrl ||
                this.onWarning !== params.onWarning ||
                this.onAuthFlowAborted !== params.onAuthFlowAborted
            ) {
                throw new Error(
                    "oidc-spa: Attempted to reinitialize the same CapacitorNavigator instance with different initialization parameters. Create a new navigator instance per OIDC instance."
                );
            }

            return;
        }

        super.initialize(params);

        const { configId, tokenStorageAdapter } = this.#getRequiredInitialization();

        initializeExternalRedirectUrl({
            configId,
            prExternalRedirectUrl: App.getLaunchUrl().then(result => {
                const url = result?.url;

                if (url === undefined || !hasOidcRedirectResponse(url).hasAuthResponseInUrl) {
                    return undefined;
                }

                if (!this.#isAllowedCallbackOrWarn({ source: "launch", url })) {
                    return undefined;
                }

                return url;
            }),
            tokenStorageAdapter,
            onWarning: warning => {
                this.onWarning?.(warning);
            }
        });
    }

    #cleanupListener(): void {
        this.#listenerRemove?.();
        this.#listenerRemove = undefined;
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
        this.#cleanupListener();
        this.#cleanupBrowserFinishedListenerRemove();
        this.#clearBrowserFinishedTimeout();

        this.#listenerRemove = (
            await App.addListener("appUrlOpen", async event => {
                if (!hasOidcRedirectResponse(event.url).hasAuthResponseInUrl) {
                    return;
                }

                if (!this.#isAllowedCallbackOrWarn({ source: "appUrlOpen", url: event.url })) {
                    return;
                }

                this.#clearBrowserFinishedTimeout();
                this.#cleanupBrowserFinishedListenerRemove();
                this.#cleanupListener();

                const { configId, tokenStorageAdapter } = this.#getRequiredInitialization();

                await setExternalRedirectUrl({
                    configId,
                    url: event.url,
                    tokenStorageAdapter
                });

                await this.#closeBrowserIfNotAndroid();

                window.location.reload();
            })
        ).remove;

        return {
            navigate: async ({ url }) => {
                this.#clearBrowserFinishedTimeout();
                this.#cleanupBrowserFinishedListenerRemove();
                this.#browserFinishedListenerRemove = (
                    await Browser.addListener("browserFinished", async () => {
                        this.#cleanupBrowserFinishedListenerRemove();
                        this.#clearBrowserFinishedTimeout();
                        this.#browserFinishedTimeoutId = setTimeout(() => {
                            this.#browserFinishedTimeoutId = undefined;
                            this.onAuthFlowAborted?.();
                        }, this.#browserFinishedGracePeriodMs);
                    })
                ).remove;

                await Browser.open({ url });

                return { url };
            },
            close: () => {
                this.#clearBrowserFinishedTimeout();
                void this.#closeBrowserIfNotAndroid();
                this.#cleanupListener();
                this.#cleanupBrowserFinishedListenerRemove();
            }
        };
    }

    async callback(url: string, _params?: unknown): Promise<void> {
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

        this.#clearBrowserFinishedTimeout();
        this.#cleanupBrowserFinishedListenerRemove();
        this.#cleanupListener();

        const { configId, tokenStorageAdapter } = this.#getRequiredInitialization();

        await setExternalRedirectUrl({
            configId,
            url,
            tokenStorageAdapter
        });

        await this.#closeBrowserIfNotAndroid();

        window.location.reload();
    }
}
