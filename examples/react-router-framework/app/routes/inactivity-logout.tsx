import { useSearchParams } from "react-router";
import { z } from "zod";

export default function InactivityLogout() {
    const [searchParams] = useSearchParams();
    const returnToUrl = z.url().catch("/").parse(searchParams.get("return_url"));

    return (
        <>
            <h1>You have been logged out due to inactivity</h1>
            <p>Sign in again to pick up where you left off.</p>
            <a href={returnToUrl}>Resume to where I was</a>
        </>
    );
}
