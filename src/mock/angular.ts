import {
    EnvironmentProviders,
    inject,
    makeEnvironmentProviders,
    provideAppInitializer
} from "@angular/core";
import { OidcService as OidcServiceBase } from "../angular/oidc.service";
import type { ParamsOfCreateMockOidc } from "./oidc";
import { getBaseHref } from "../tools/getBaseHref";

export function provideOidc<T_DecodedIdToken extends Record<string, unknown>>(
    params: Omit<ParamsOfCreateMockOidc<T_DecodedIdToken, boolean>, "homeUrl">,
    angularAdapterSpecificOptions: {
        OidcService: typeof OidcServiceBase<T_DecodedIdToken>;
    }
): EnvironmentProviders {
    const OidcService = angularAdapterSpecificOptions?.OidcService ?? OidcServiceBase;

    return makeEnvironmentProviders([
        OidcService as any,
        provideAppInitializer(async () => {
            const service = inject(OidcService);

            const prOidc = (async () => {
                const { createMockOidc } = await import("./oidc");

                return createMockOidc({
                    homeUrl: getBaseHref(),
                    ...params
                });
            })();

            service.__initialize({
                prOidcOrInitializationError: prOidc
            });

            await service.prInitialized;
        })
    ]);
}
