import { z } from "zod";

export default async function InactivityLogout({
    searchParams
}: {
    searchParams: Promise<{ return_url?: string | string[] }>;
}) {
    const { return_url } = await searchParams;
    const returnToUrl = z.url().catch(`${process.env.__NEXT_ROUTER_BASEPATH}/`).parse(return_url);

    return (
        <>
            <h1>You have been logged out due to inactivity</h1>
            <p>Sign in again to pick up where you left off.</p>
            <a href={returnToUrl}>Resume to where I was</a>
        </>
    );
}
