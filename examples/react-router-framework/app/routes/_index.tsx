import { Suspense } from "react";
import type { Route } from "./+types/_index";
import reactLogo from "../assets/react.svg";
import viteLogo from "../assets/vite.svg";
import { useOidc } from "~/oidc";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "New React Router App" },
        { name: "description", content: "Welcome to React Router!" }
    ];
}

export default function Home() {
    return (
        <>
            <div>
                <a href="https://vitejs.dev" target="_blank">
                    <img src={viteLogo} className="logo" alt="Vite logo" />
                </a>
                <a href="https://react.dev" target="_blank">
                    <img src={reactLogo} className="logo react" alt="React logo" />
                </a>
            </div>
            <Suspense fallback={<>&nbsp;</>}>
                <Greeting />
            </Suspense>
        </>
    );
}

function Greeting() {
    const { isUserLoggedIn, decodedIdToken } = useOidc();

    return (
        <span className="opacity-0 animate-[fadeIn_0.2s_ease-in_forwards]">
            {isUserLoggedIn ? `Welcome back ${decodedIdToken.name}` : `Hello anonymous visitor!`}
        </span>
    );
}
