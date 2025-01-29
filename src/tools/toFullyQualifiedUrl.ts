export function toFullyQualifiedUrl(params: { urlish: string; doAssertNoQueryParams: boolean }) {
    const { urlish, doAssertNoQueryParams } = params;

    let url: string;

    if (urlish.startsWith("http")) {
        url = urlish;
    } else {
        let path = urlish;

        if (!path.startsWith("/")) {
            path = `/${path}`;
        }

        url = `${window.location.origin}${path}`;
    }

    {
        const urlObj = new URL(url);

        urlObj.pathname = urlObj.pathname
            // Make sure there is no double slash like in `https://example.com//foo//bar`
            .replace(/\/\//g, "/");

        url = urlObj.href;
    }

    // make sure no trailing slash
    if (url.endsWith("/")) {
        url = url.slice(0, -1);
    }

    throw_if_query_params: {
        if (!doAssertNoQueryParams) {
            break throw_if_query_params;
        }

        if (new URL(url).searchParams.size === 0) {
            break throw_if_query_params;
        }

        throw new Error(`The ${urlish} URL should not have query parameters`);
    }

    return url;
}
