export type OidcUserInfo = {
    sub: string;

    name?: string;
    given_name?: string;
    family_name?: string;
    middle_name?: string;
    nickname?: string;
    preferred_username?: string;

    profile?: string;
    picture?: string;
    website?: string;

    email?: string;
    email_verified?: boolean;

    gender?: string;
    birthdate?: string;

    zoneinfo?: string;
    locale?: string;

    phone_number?: string;
    phone_number_verified?: boolean;

    address?: {
        formatted?: string;
        street_address?: string;
        locality?: string;
        region?: string;
        postal_code?: string;
        country?: string;
    };

    updated_at?: number;

    // UserInfo may contain additional provider-specific claims.
    [claim: string]: unknown;
};
