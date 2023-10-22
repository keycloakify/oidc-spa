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

    const [baseUrl, locationSearch = ""] = url.split("?");

    const values: Record<string, string> = {};

    const { newLocationSearch } = (() => {
        let newLocationSearch = locationSearch
            .replace(/^\?/, "")
            .split("&")
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

export function retrieveQueryParamFromUrl(params: {
    url: string;
    name: string;
}): { wasPresent: false } | { wasPresent: true; newUrl: string; value: string } {
    const { url, name } = params;

    const { newUrl, values } = retrieveAllQueryParamStartingWithPrefixFromUrl({
        url,
        "prefix": name,
        "doLeavePrefixInResults": true
    });

    return name in values
        ? {
              "wasPresent": true,
              newUrl,
              "value": values[name]
          }
        : {
              "wasPresent": false
          };
}
