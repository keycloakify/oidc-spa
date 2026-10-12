import type { CreateUser } from "oidc-spa/core";
import { decodeJwt } from "oidc-spa/decode-jwt";
import { isKeycloak } from "oidc-spa/keycloak";
import { z } from "zod";
import avatarFallbackSvgUrl from "~/assets/img/avatarFallback.svg";

// The application consumes this model, independently of the provider's token shape.
export type User = {
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    canSeeKeycloakAdminNavigation: boolean;
};

export const createUser: CreateUser<User> = ({ decodedIdToken, accessToken, issuerUri }) => {
    const { name, picture, email } = z
        .object({
            name: z.string(),
            picture: z.string().optional(),
            email: z.string().optional()
        })
        .parse(decodedIdToken);

    // Keycloak's realm-admin is a client role of realm-management, in the access token.
    // Other providers may issue opaque access tokens and don't expose this console.
    const canSeeKeycloakAdminNavigation = isKeycloak({ issuerUri })
        ? z
              .object({
                  resource_access: z
                      .object({
                          "realm-management": z.object({ roles: z.array(z.string()) }).optional()
                      })
                      .optional()
              })
              .parse(decodeJwt(accessToken))
              .resource_access?.["realm-management"]?.roles.includes("realm-admin") ?? false
        : false;

    return {
        displayName: name,
        email,
        avatarImgUrl: picture || avatarFallbackSvgUrl,
        canSeeKeycloakAdminNavigation
    };
};

export const user_mock: User = {
    displayName: "John Doe",
    email: undefined,
    avatarImgUrl: avatarFallbackSvgUrl,
    canSeeKeycloakAdminNavigation: true
};
