import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { type KeycloakIssuerUriParsed, parseKeycloakIssuerUri } from "./keycloakIssuerUriParsed";

export type KeycloakUtils = {
    issuerUriParsed: KeycloakIssuerUriParsed;
    adminConsoleUrl: string;
    adminConsoleUrl_master: string;
    getAccountUrl: (params: { clientId: string; validRedirectUri: string; locale?: string }) => string;
    fetchUserProfile: (params: { accessToken: string }) => Promise<KeycloakProfile>;
    fetchUserInfo: (params: { accessToken: string }) => Promise<UserInfo>;
    transformUrlBeforeRedirectForRegister: (authorizationUrl: string) => string;
};

export type KeycloakProfile = KeycloakProfile.AttributeValuesMap & {
    attributes: Record<string, unknown>;
    userProfileMetadata: {
        attributes: KeycloakProfile.Attribute[];
        groups: KeycloakProfile.Group[];
    };
};

export namespace KeycloakProfile {
    export type AttributeValuesMap = {
        id: string;
        [attributeName: string]: unknown;

        // Attributes usually present
        username?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        enabled?: boolean;
        emailVerified?: boolean;
        totp?: boolean;
    };

    export type Attribute = {
        name: string;
        displayName?: string;
        required: boolean;
        group?: {
            annotations: Record<string, string>;
            html5DataAnnotations: Record<string, string>;
            displayHeader?: string;
            name: string;
            displayDescription?: string;
        };
        html5DataAnnotations?: {
            kcNumberFormat?: string;
            kcNumberUnFormat?: string;
        };
        readOnly: boolean;
        validators: Validators;
        annotations: {
            inputType?: string;
            inputTypeSize?: `${number}` | number;
            inputOptionsFromValidation?: string;
            inputOptionLabels?: Record<string, string | undefined>;
            inputOptionLabelsI18nPrefix?: string;
            inputTypeCols?: `${number}` | number;
            inputTypeRows?: `${number}` | number;
            inputTypeMaxlength?: `${number}` | number;
            inputHelperTextBefore?: string;
            inputHelperTextAfter?: string;
            inputTypePlaceholder?: string;
            inputTypePattern?: string;
            inputTypeMinlength?: `${number}` | number;
            inputTypeMax?: string;
            inputTypeMin?: string;
            inputTypeStep?: string;
        };
        multivalued?: boolean;
        autocomplete?:
            | "on"
            | "off"
            | "name"
            | "honorific-prefix"
            | "given-name"
            | "additional-name"
            | "family-name"
            | "honorific-suffix"
            | "nickname"
            | "email"
            | "username"
            | "new-password"
            | "current-password"
            | "one-time-code"
            | "organization-title"
            | "organization"
            | "street-address"
            | "address-line1"
            | "address-line2"
            | "address-line3"
            | "address-level4"
            | "address-level3"
            | "address-level2"
            | "address-level1"
            | "country"
            | "country-name"
            | "postal-code"
            | "cc-name"
            | "cc-given-name"
            | "cc-additional-name"
            | "cc-family-name"
            | "cc-number"
            | "cc-exp"
            | "cc-exp-month"
            | "cc-exp-year"
            | "cc-csc"
            | "cc-type"
            | "transaction-currency"
            | "transaction-amount"
            | "language"
            | "bday"
            | "bday-day"
            | "bday-month"
            | "bday-year"
            | "sex"
            | "tel"
            | "tel-country-code"
            | "tel-national"
            | "tel-area-code"
            | "tel-local"
            | "tel-extension"
            | "impp"
            | "url"
            | "photo";
    };
    export type Group = {
        name: string;
        displayHeader: string;
        displayDescription: string;
    };
    export type Validators = {
        length?: Validators.DoIgnoreEmpty & Validators.Range;
        integer?: Validators.DoIgnoreEmpty & Validators.Range;
        email?: Validators.DoIgnoreEmpty;
        pattern?: Validators.DoIgnoreEmpty & Validators.ErrorMessage & { pattern: string };
        options?: Validators.Options;
        multivalued?: Validators.DoIgnoreEmpty & Validators.Range;
        // NOTE: Following are the validators for which we don't implement client side validation yet
        // or for which the validation can't be performed on the client side.
        double?: Validators.DoIgnoreEmpty & Validators.Range;
        "up-immutable-attribute"?: {};
        "up-attribute-required-by-metadata-value"?: {};
        "up-username-has-value"?: {};
        "up-duplicate-username"?: {};
        "up-username-mutation"?: {};
        "up-email-exists-as-username"?: {};
        "up-blank-attribute-value"?: Validators.ErrorMessage & { "fail-on-null": boolean };
        "up-duplicate-email"?: {};
        "local-date"?: Validators.DoIgnoreEmpty;
        "person-name-prohibited-characters"?: Validators.DoIgnoreEmpty & Validators.ErrorMessage;
        uri?: Validators.DoIgnoreEmpty;
        "username-prohibited-characters"?: Validators.DoIgnoreEmpty & Validators.ErrorMessage;
    };

    export declare namespace Validators {
        export type DoIgnoreEmpty = {
            "ignore.empty.value"?: boolean;
        };

        export type ErrorMessage = {
            "error-message"?: string;
        };

        export type Range = {
            min?: `${number}` | number;
            max?: `${number}` | number;
        };
        export type Options = {
            options: string[];
        };
    }
}

export type UserInfo = {
    sub: string;
    [key: string]: any;
};

export function createKeycloakUtils(params: { issuerUri: string }): KeycloakUtils {
    const { issuerUri } = params;

    const issuerUriParsed = parseKeycloakIssuerUri({ issuerUri });

    const keycloakServerUrl = `${issuerUriParsed.origin}${issuerUriParsed.kcHttpRelativePath ?? ""}`;

    const getAdminConsoleUrl = (realm: string) =>
        `${keycloakServerUrl}/admin/${encodeURIComponent(realm)}/console`;

    const realmUrl = `${keycloakServerUrl}/realms/${encodeURIComponent(issuerUriParsed.realm)}`;

    return {
        issuerUriParsed,
        adminConsoleUrl: getAdminConsoleUrl(issuerUriParsed.realm),
        adminConsoleUrl_master: getAdminConsoleUrl("master"),
        getAccountUrl: ({ clientId, locale, validRedirectUri }) => {
            const accountUrlObj = new URL(
                `${keycloakServerUrl}/realms/${issuerUriParsed.realm}/account`
            );
            accountUrlObj.searchParams.set("referrer", clientId);
            accountUrlObj.searchParams.set(
                "referrer_uri",
                (() => {
                    try {
                        return toFullyQualifiedUrl({
                            urlish: validRedirectUri,
                            doAssertNoQueryParams: true,
                            doOutputWithTrailingSlash: true
                        });
                    } catch {
                        return toFullyQualifiedUrl({
                            urlish: validRedirectUri,
                            doAssertNoQueryParams: false
                        });
                    }
                })()
            );
            if (locale !== undefined) {
                accountUrlObj.searchParams.set("kc_locale", locale);
            }
            return accountUrlObj.href;
        },
        fetchUserProfile: ({ accessToken }) =>
            fetch(`${realmUrl}/account`, {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${accessToken}`
                }
            }).then(r => r.json()),
        fetchUserInfo: ({ accessToken }) =>
            fetch(`${realmUrl}/protocol/openid-connect/userinfo`, {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${accessToken}`
                }
            }).then(r => r.json()),
        transformUrlBeforeRedirectForRegister: authorizationUrl => {
            const urlObj = new URL(authorizationUrl);
            urlObj.pathname = urlObj.pathname.replace(/\/auth$/, "/registrations");
            return urlObj.href;
        }
    };
}
