import { createOidc, type ParamsOfCreateOidc, OidcInitializationError } from "../core";
import { assert } from "../vendor/frontend/tsafe";
import {
    EnvironmentProviders,
    inject,
    makeEnvironmentProviders,
    provideAppInitializer
} from "@angular/core";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import { OidcService as OidcServiceBase, type DecodedIdToken } from "./oidc.service";
import { getBaseHref } from "../tools/getBaseHref";

export function provideOidc<T_DecodedIdToken extends Record<string, unknown> = DecodedIdToken>(
    params: ValueOrAsyncGetter<Omit<ParamsOfCreateOidc<T_DecodedIdToken, boolean>, "homeUrl">>,
    angularAdapterSpecificOptions?: {
        Oidc?: typeof OidcServiceBase<T_DecodedIdToken>;
        awaitInitialization?: boolean;
    }
): EnvironmentProviders {
    const paramsOrGetParams = params;

    const OidcService = angularAdapterSpecificOptions?.Oidc ?? OidcServiceBase;

    const { awaitInitialization = true } = angularAdapterSpecificOptions ?? {};

    return makeEnvironmentProviders([
        OidcService,
        provideAppInitializer(async () => {
            const service = inject(OidcService);

            const prOidcOrInitializationError = (async () => {
                const params =
                    typeof paramsOrGetParams === "function"
                        ? await paramsOrGetParams()
                        : paramsOrGetParams;

                try {
                    return createOidc({
                        homeUrl: getBaseHref(),
                        ...params
                    });
                } catch (initializationError) {
                    assert(initializationError instanceof OidcInitializationError);
                    return initializationError;
                }
            })();

            service.__initialize({
                prOidcOrInitializationError
            });

            if (awaitInitialization) {
                await service.prInitialized;
            }
        })
    ]);
}
