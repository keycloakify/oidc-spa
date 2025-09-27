import { type CanActivateFn } from "@angular/router";
import { OidcService } from "./oidc.service";
import { inject } from "@angular/core";

export function enforceLoginGuard(Oidc: typeof OidcService = OidcService) {
    const canActivateFn = (async route => {
        const oidc = inject(Oidc);

        await oidc.enforceLogin(route);

        return true;
    }) satisfies CanActivateFn;
    return canActivateFn;
}
