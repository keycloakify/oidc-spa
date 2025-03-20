import { useOidc } from "../oidc.client";
import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "React-router (framework) + oidc-spa" },
        { name: "description", content: "Welcome to this example app" }
    ];
}

export default function Home() {
    const { isUserLoggedIn, decodedIdToken } = useOidc();

    return (
        <>
            <h1>Welcome {isUserLoggedIn ? decodedIdToken.name : "stranger"}!</h1>
        </>
    );
}
