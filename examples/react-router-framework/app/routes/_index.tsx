import type { Route } from "./+types/_index";
import reactLogo from "../assets/react.svg";
import viteLogo from "../assets/vite.svg";

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
            <h4>This is a page that do not requires the user to be authenticated</h4>
        </>
    );
}
