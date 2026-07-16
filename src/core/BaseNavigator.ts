import type { AsyncStorage, INavigator, IWindow } from "../vendor/frontend/oidc-client-ts";

export type BaseNavigatorWarning = {
    code: string;
    message: string;
    configId: string;
    errorName?: string;
    errorMessage?: string;
};

export abstract class BaseNavigator implements INavigator {
    protected tokenStorageAdapter?: AsyncStorage;
    protected configId?: string;
    protected callbackUrl?: string;
    protected onWarning?: (warning: BaseNavigatorWarning) => void;
    protected onAuthFlowAborted?: () => void;

    initialize(params: {
        tokenStorageAdapter: AsyncStorage;
        configId: string;
        callbackUrl?: string;
        onWarning?: (warning: BaseNavigatorWarning) => void;
        onAuthFlowAborted?: () => void;
    }): void {
        this.tokenStorageAdapter = params.tokenStorageAdapter;
        this.configId = params.configId;
        this.callbackUrl = params.callbackUrl;
        this.onWarning = params.onWarning;
        this.onAuthFlowAborted = params.onAuthFlowAborted;
    }

    abstract prepare(params: unknown): Promise<IWindow>;
    abstract callback(url: string, params?: unknown): Promise<void>;
}
