import type { Route } from "./+types/about";

export function meta({}: Route.MetaArgs) {
    return [{ title: "About Us" }, { name: "description", content: "About Us" }];
}

export default function About() {
    return <p>ABOUT</p>;
}
