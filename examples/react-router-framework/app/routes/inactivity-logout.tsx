import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";

export default function InactivityLogout() {
    const [searchParams] = useSearchParams();

    // NOTE: We set the value in a useEffect so that the page can be pre-rendered.
    const [returnToUrl, setReturnUrl] = useState("/");
    useEffect(() => {
        setReturnUrl(z.url().parse(searchParams.get("return_url")));
    }, []);

    return (
        <>
            <h1>You have been logged out due to inactivity</h1>
            <p>Sign in again to pick up where you left off.</p>
            <a href={returnToUrl}>Resume to where I was</a>
        </>
    );
}
