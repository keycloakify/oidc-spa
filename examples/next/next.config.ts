import type { NextConfig } from "next";
import { withOidcSpa } from "oidc-spa/nextjs-plugin";

const nextConfig: NextConfig = {};

export default withOidcSpa(nextConfig, {
    browserRuntimeFreeze: { enabled: true },
    DPoP: { enabled: true, mode: "auto" }
});
