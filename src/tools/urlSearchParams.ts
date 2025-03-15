function getAllSearchParams_encoded(url: string): Record<string, string> {
    let search: string | undefined;

    {
        const [url_withoutHash] = url.split("#");

        search = url_withoutHash.split("?")[1];
    }

    if (search === undefined) {
        return {};
    }

    return Object.fromEntries(
        search.split("&").map(part => {
            const [name, value_encoded] = part.split("=");

            return [name, value_encoded];
        })
    );
}

function addOrUpdateOrRemoveSearchParam_encoded(params: {
    url: string;
    name: string;
    value_encoded: string | undefined;
}): string {
    const { url, name, value_encoded } = params;

    const value_encodedByName = getAllSearchParams_encoded(url);

    if (value_encoded === undefined) {
        delete value_encodedByName[name];
    } else {
        value_encodedByName[name] = value_encoded;
    }

    let search: string;

    update_search: {
        if (Object.keys(value_encodedByName).length === 0) {
            search = "";
            break update_search;
        } else {
            search =
                "?" +
                Object.entries(value_encodedByName)
                    .map(([name, value_encoded]) => `${name}=${value_encoded}`)
                    .join("&");
        }
    }

    const [url_withoutHash, hash] = url.split("#");

    const [url_withoutHash_withoutSearch] = url_withoutHash.split("?");

    return `${url_withoutHash_withoutSearch}${search}${hash ? "#" + hash : ""}`;
}

export function addOrUpdateSearchParam(params: {
    url: string;
    name: string;
    value: string;
    encodeMethod: "encodeURIComponent" | "www-form";
}): string {
    const { url, name, value, encodeMethod } = params;

    let value_encoded = encodeURIComponent(value);

    if (encodeMethod === "www-form") {
        value_encoded.replace(/%20/g, "+");
    }

    return addOrUpdateOrRemoveSearchParam_encoded({
        url,
        name,
        value_encoded
    });
}

function decodeSearchParamValue(value_encoded: string): string {
    return decodeURIComponent(value_encoded.replace(/\+/g, "%20"));
}

export function getSearchParam(params: { url: string; name: string }):
    | {
          wasPresent: true;
          value: string;
          url_withoutTheParam: string;
      }
    | {
          wasPresent: false;
          value?: never;
          url_withoutTheParam?: never;
      } {
    const { url, name } = params;

    const encodedValueByName = getAllSearchParams_encoded(url);

    const value_encoded = encodedValueByName[name];

    if (value_encoded === undefined) {
        return {
            wasPresent: false
        };
    }

    const url_withoutTheParam = addOrUpdateOrRemoveSearchParam_encoded({
        url,
        name,
        value_encoded: undefined
    });

    return {
        wasPresent: true,
        value: decodeSearchParamValue(value_encoded),
        url_withoutTheParam
    };
}

export function getAllSearchParams(url: string): Record<string, string> {
    const encodedValueByName = getAllSearchParams_encoded(url);

    return Object.fromEntries(
        Object.entries(encodedValueByName).map(([name, value_encoded]) => [
            name,
            decodeSearchParamValue(value_encoded)
        ])
    );
}
