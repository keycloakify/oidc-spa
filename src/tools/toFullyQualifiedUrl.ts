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

    url = url.replace(/\/$/, "");

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
