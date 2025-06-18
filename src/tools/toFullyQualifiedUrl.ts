type Params = {
    urlish: string;
} & (
    | {
          doAssertNoQueryParams: true;
          doOutputWithTrailingSlash: boolean;
      }
    | {
          doAssertNoQueryParams: false;
      }
);

export function toFullyQualifiedUrl(params: Params): string {
    let url: string;

    if (params.urlish.includes("://")) {
        url = params.urlish;
    } else {
        let path = params.urlish;

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

    if (params.doAssertNoQueryParams) {
        // Check if the URL has query parameters.
        // Note: `searchParams.size` can be `undefined` in some runtime environments.
        // See https://github.com/keycloakify/oidc-spa/issues/63#issue-3080503083
        if (new URL(url).searchParams.size) {
            throw new Error(`The ${params.urlish} URL should not have query parameters`);
        }

        if (params.doOutputWithTrailingSlash) {
            if (!url.endsWith("/")) {
                url = `${url}/`;
            }
        } else {
            if (url.endsWith("/")) {
                url = url.slice(0, -1);
            }
        }
    }

    return url;
}
