// Loaded by AXA's service worker. Keep the issuer in sync with .env.
const trustedDomains = {
    default: {
        oidcDomains: [/^https:\/\/phasetwo\.oidc-spa\.dev\/realms\/demo-realm(?:\/|$)/],
        accessTokenDomains: [
            new RegExp(`^${self.location.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api(?:/|$)`)
        ],
        showAccessToken: false,
        setAccessTokenToNavigateRequests: false,
        allowMultiTabLogin: true,
        // AXA 7.29.8 includes query strings in DPoP htu (see README).
        demonstratingProofOfPossession: false
    }
};
