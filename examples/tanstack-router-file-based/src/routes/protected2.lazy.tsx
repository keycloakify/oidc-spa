import { createLazyFileRoute } from "@tanstack/react-router";
import { useOidc, withLoginEnforced } from "../oidc";

export const Route = createLazyFileRoute("/protected2")({
    // NOTE: Here we use withLoginEnforced instead of before: enforceLogin
    // because we are in a lazy route and lazy routes do not have loaders.
    component: withLoginEnforced(Page)
});

function Page() {
    const { decodedIdToken } = useOidc({ assert: "user logged in" });

    return <h3>Hello {decodedIdToken.name}, this is a lazy route where authentication is enforced</h3>;
}
