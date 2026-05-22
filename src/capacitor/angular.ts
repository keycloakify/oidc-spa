import { AbstractOidcService, type ParamsOfProvide } from "../angular";
import { type EnvironmentProviders, inject, InjectionToken } from "@angular/core";
import {
    type ActivatedRouteSnapshot,
    type CanActivateFn,
    type RouterStateSnapshot
} from "@angular/router";
import { CapacitorNavigator, type CapacitorCallbackUrlPolicy } from "./CapacitorNavigator";
import { Capacitor } from "@capacitor/core";
import { Oidc } from "../core/Oidc";
import type { BaseNavigatorWarning } from "../core/BaseNavigator";

export const CAPACITOR_NAVIGATOR_WARNING_HANDLER = new InjectionToken<
    (warning: BaseNavigatorWarning) => void
>("oidc-spa.capacitor.navigator-warning-handler");

export const CAPACITOR_NAVIGATOR = new InjectionToken<CapacitorNavigator>(
    "oidc-spa.capacitor.navigator"
);

export const CAPACITOR_CALLBACK_URL_POLICY = new InjectionToken<CapacitorCallbackUrlPolicy>(
    "oidc-spa.capacitor.callback-url-policy"
);
export const CAPACITOR_BROWSER_FINISHED_GRACE_PERIOD_MS = new InjectionToken<number>(
    "oidc-spa.capacitor.browser-finished-grace-period-ms"
);
export const CAPACITOR_IS_NATIVE_APP = new InjectionToken<boolean>("oidc-spa.capacitor.isNativeApp");

export type ParamsOfCapacitorProvide = ParamsOfProvide & {
    callbackUrlPolicy?: CapacitorCallbackUrlPolicy;
    browserFinishedGracePeriodMs?: number;
};

/**
 * Capacitor-specific Angular integration for oidc-spa.
 *
 * For production use, review your token persistence strategy based on your
 * security requirements. If persisted tokens need stronger protection,
 * prefer a secure storage or biometric-gated wrapper over plain
 * Preferences-backed token storage.
 */
export abstract class CapacitorOidcService<
    T extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_OidcCoreSpec
> extends AbstractOidcService<T> {
    static provide(params: ParamsOfCapacitorProvide): EnvironmentProviders {
        const {
            callbackUrlPolicy = "tolerant",
            browserFinishedGracePeriodMs = CapacitorNavigator.DEFAULT_BROWSER_FINISHED_GRACE_PERIOD_MS,
            nativeSessionRestoreMode: nativeSessionRestoreMode_params,
            ...baseParams
        } = params;

        const effectiveIsNativeApp = baseParams.isNativeApp ?? Capacitor.isNativePlatform();
        const onNavigatorWarning = baseParams.onNavigatorWarning ?? (() => {});
        const nativeSessionRestoreMode =
            nativeSessionRestoreMode_params ??
            (effectiveIsNativeApp ? "prefer-local-restore" : "full-page-redirect");

        const effectiveNavigator = effectiveIsNativeApp
            ? baseParams.navigator ??
              new CapacitorNavigator({
                  callbackUrlPolicy,
                  browserFinishedGracePeriodMs
              })
            : undefined;

        return super.provide(
            {
                ...baseParams,
                isNativeApp: effectiveIsNativeApp,
                nativeSessionRestoreMode,
                navigator: effectiveNavigator,
                onNavigatorWarning
            },
            [
                { provide: CAPACITOR_NAVIGATOR, useValue: effectiveNavigator },
                { provide: CAPACITOR_NAVIGATOR_WARNING_HANDLER, useValue: onNavigatorWarning },
                { provide: CAPACITOR_CALLBACK_URL_POLICY, useValue: callbackUrlPolicy },
                {
                    provide: CAPACITOR_BROWSER_FINISHED_GRACE_PERIOD_MS,
                    useValue: browserFinishedGracePeriodMs
                },
                { provide: CAPACITOR_IS_NATIVE_APP, useValue: effectiveIsNativeApp }
            ]
        );
    }

    static override get enforceLoginGuard(): CanActivateFn {
        const canActivateFn: CanActivateFn = (
            route: ActivatedRouteSnapshot,
            state: RouterStateSnapshot
        ) => {
            const isNativeApp = inject(CAPACITOR_IS_NATIVE_APP);
            const instance = inject(this);

            if (!isNativeApp) {
                return super.enforceLoginGuard(route, state);
            }

            return (async () => {
                await instance.prInitialized;

                if (instance.isUserLoggedIn) {
                    return true;
                }

                const redirectUrl = state.url;

                void instance
                    .login({
                        redirectUrl
                    })
                    .catch(error => {
                        setTimeout(() => {
                            throw error;
                        }, 0);
                    });

                return false;
            })();
        };
        return canActivateFn;
    }
}
