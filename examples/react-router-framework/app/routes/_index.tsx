import { useOidc } from "../oidc.client";

import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "New React Router App" },
        { name: "description", content: "Welcome to React Router!" }
    ];
}

export default function Home() {
    const { logout } = useOidc();

    const handleLogout = () => {
        logout({ redirectTo: "current page" });
    };

    return (
        <>
            <p>HOME</p>
            <button onClick={handleLogout}>Click to: Log Out</button>
        </>
    );
}
