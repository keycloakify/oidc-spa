import Link from "next/link";

export default function NotFound() {
    return (
        <>
            <h1>Page not found</h1>
            <p>The page you are looking for does not exist.</p>
            <Link href="/">Home</Link>
        </>
    );
}
