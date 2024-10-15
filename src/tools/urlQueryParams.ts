export function addQueryParamToUrl(params: { url: string; name: string; value: string }): {
    newUrl: string;
} {
    const { url, name, value } = params;

    let newUrl = url;

    const result = retrieveQueryParamFromUrl({
        url,
        name
    });

    if (result.wasPresent) {
        newUrl = result.newUrl;
    }

    newUrl += `${
        newUrl.includes("?") ? "&" : newUrl.endsWith("?") ? "" : "?"
    }${name}=${encodeURIComponent(value)}`;

    return { newUrl };
}

export function retrieveAllQueryParamStartingWithPrefixFromUrl<
    Prefix extends string,
    DoLeave extends boolean
>(params: {
    url: string;
    prefix: Prefix;
    doLeavePrefixInResults: DoLeave;
}): { newUrl: string; values: Record<DoLeave extends true ? `${Prefix}${string}` : string, string> } {
    const { url, prefix, doLeavePrefixInResults } = params;

    const { baseUrl, locationSearch } = (() => {
        const [baseUrl, ...rest] = url.split("?");

        return {
            baseUrl,
            "locationSearch": rest.join("?").trim()
        };
    })();

    const values: Record<string, string> = {};

    const { newLocationSearch } = (() => {
        let newLocationSearch = locationSearch
            .split("&")
            .filter(part => part !== "")
            .map(part => part.split("=") as [string, string])
            .filter(([key, value_i]) =>
                !key.startsWith(prefix)
                    ? true
                    : ((values[doLeavePrefixInResults ? key : key.substring(prefix.length)] =
                          decodeURIComponent(value_i)),
                      false)
            )
            .map(entry => entry.join("="))
            .join("&");
        newLocationSearch = newLocationSearch === "" ? "" : `?${newLocationSearch}`;

        return { newLocationSearch };
    })();

    return {
        "newUrl": `${baseUrl}${newLocationSearch}`,
        values
    };
}

export function retrieveAllQueryParamFromUrl(params: { url: string }): {
    newUrl: string;
    values: Record<string, string>;
} {
    return retrieveAllQueryParamStartingWithPrefixFromUrl({
        "url": params.url,
        "prefix": "",
        "doLeavePrefixInResults": true
    });
}

export function retrieveQueryParamFromUrl(params: {
    url: string;
    name: string;
}): { wasPresent: false } | { wasPresent: true; newUrl: string; value: string } {
    const { url, name } = params;

    let { newUrl, values } = retrieveAllQueryParamStartingWithPrefixFromUrl({
        url,
        "prefix": name,
        "doLeavePrefixInResults": true
    });

    if (!(name in values)) {
        return { "wasPresent": false };
    }

    const { [name]: value, ...rest } = values;

    Object.entries(rest).forEach(
        ([name, value]) =>
            (newUrl = addQueryParamToUrl({
                name,
                "url": newUrl,
                value
            }).newUrl)
    );

    return {
        "wasPresent": true,
        newUrl,
        "value": values[name]
    };
}
