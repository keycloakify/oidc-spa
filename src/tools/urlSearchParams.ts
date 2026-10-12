function getAllSearchParams_encoded(url: string): Record<string, string[]> {
    let search: string | undefined;

    {
        const [url_withoutHash] = url.split("#");

        const searchStart = url_withoutHash.indexOf("?");

        search = searchStart === -1 ? undefined : url_withoutHash.slice(searchStart + 1);
    }

    if (search === undefined) {
        return {};
    }

    const values_encodedByName = new Map<string, string[]>();

    for (const part of search.split("&")) {
        if (part === "") {
            continue;
        }

        const separator = part.indexOf("=");
        const name = separator === -1 ? part : part.slice(0, separator);
        const value_encoded = separator === -1 ? "" : part.slice(separator + 1);
        const values_encoded = values_encodedByName.get(name);

        if (values_encoded === undefined) {
            values_encodedByName.set(name, [value_encoded]);
        } else {
            values_encoded.push(value_encoded);
        }
    }

    return Object.fromEntries(values_encodedByName);
}

function addOrUpdateOrRemoveSearchParam_encoded(params: {
    url: string;
    name: string;
    values_encoded: string[];
    ifAlreadyPresent: "replace all by new values" | "add" | "throw";
}): string {
    const { url, name, values_encoded, ifAlreadyPresent } = params;

    const values_encodedByName = getAllSearchParams_encoded(url);

    if (Object.prototype.hasOwnProperty.call(values_encodedByName, name)) {
        if (ifAlreadyPresent === "throw") {
            throw new Error(`Search parameter "${name}" is already present`);
        }

        if (ifAlreadyPresent === "add") {
            values_encodedByName[name].push(...values_encoded);
        } else {
            values_encodedByName[name] = values_encoded;
        }
    } else if (values_encoded.length !== 0) {
        Object.defineProperty(values_encodedByName, name, {
            value: values_encoded,
            enumerable: true,
            configurable: true,
            writable: true
        });
    }

    const search = Object.entries(values_encodedByName)
        .flatMap(([name, values_encoded]) =>
            values_encoded.map(value_encoded => `${name}=${value_encoded}`)
        )
        .join("&");

    const hashStart = url.indexOf("#");
    const url_withoutHash = hashStart === -1 ? url : url.slice(0, hashStart);
    const hash = hashStart === -1 ? "" : url.slice(hashStart);

    const [url_withoutHash_withoutSearch] = url_withoutHash.split("?");

    return `${url_withoutHash_withoutSearch}${search ? "?" + search : ""}${hash}`;
}

export function addOrUpdateSearchParam(params: {
    url: string;
    name: string;
    values: string[];
    encodeMethod: "encodeURIComponent" | "www-form";
    ifAlreadyPresent: "replace all by new values" | "add" | "throw";
}): string {
    const { url, name, values, encodeMethod, ifAlreadyPresent } = params;

    const values_encoded = values.map(value => {
        const value_encoded = encodeURIComponent(value);

        return encodeMethod === "www-form" ? value_encoded.replace(/%20/g, "+") : value_encoded;
    });

    return addOrUpdateOrRemoveSearchParam_encoded({
        url,
        name,
        values_encoded,
        ifAlreadyPresent
    });
}

function decodeSearchParamValue(value_encoded: string): string {
    return decodeURIComponent(value_encoded.replace(/\+/g, "%20"));
}

export function getSearchParam(params: { url: string; name: string }):
    | {
          wasPresent: true;
          values: string[];
          url_withoutTheParam: string;
      }
    | {
          wasPresent: false;
          values?: never;
          url_withoutTheParam?: never;
      } {
    const { url, name } = params;

    const values_encodedByName = getAllSearchParams_encoded(url);

    if (!Object.prototype.hasOwnProperty.call(values_encodedByName, name)) {
        return {
            wasPresent: false
        };
    }

    const url_withoutTheParam = addOrUpdateOrRemoveSearchParam_encoded({
        url,
        name,
        values_encoded: [],
        ifAlreadyPresent: "replace all by new values"
    });

    return {
        wasPresent: true,
        values: values_encodedByName[name].map(decodeSearchParamValue),
        url_withoutTheParam
    };
}

export function getAllSearchParams(url: string): Record<string, string[]> {
    const values_encodedByName = getAllSearchParams_encoded(url);

    return Object.fromEntries(
        Object.entries(values_encodedByName).map(([name, values_encoded]) => [
            name,
            values_encoded.map(decodeSearchParamValue)
        ])
    );
}
