export type StateData = {
    hasBeenProcessedByCallback: boolean;
} & (
    | {
          isSilentSso: false;
          redirectUrl: string;
          extraQueryParams: Record<string, string>;
      }
    | {
          isSilentSso: true;
      }
);

export const STATE_STORE_KEY_PREFIX = "oidc.";

function getIsStateData(value: any): value is StateData {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    if (typeof value.hasBeenProcessedByCallback !== "boolean") {
        return false;
    }

    if (value.isSilentSso === true) {
        return true;
    } else if (value.isSilentSso === false) {
        if (typeof value.redirectUrl !== "string") {
            return false;
        }
        if (typeof value.extraQueryParams !== "object" || value.extraQueryParams === null) {
            return false;
        }
        for (const val of Object.values(value.extraQueryParams)) {
            if (typeof val !== "string") {
                return false;
            }
        }
        return true;
    }

    return false;
}

export function getStateData(params: {
    configHash: string;
    isCallbackContext: boolean;
}): StateData | undefined {
    const { configHash, isCallbackContext } = params;

    const KEY = `${STATE_STORE_KEY_PREFIX}${configHash}`;

    const lsItem = sessionStorage.getItem(KEY);

    if (lsItem === null) {
        return undefined;
    }

    const obj = JSON.parse(lsItem);

    const { data } = obj;

    if (!getIsStateData(data)) {
        return undefined;
    }

    if (isCallbackContext) {
        if (data.hasBeenProcessedByCallback) {
            return undefined;
        }

        data.hasBeenProcessedByCallback = true;

        sessionStorage.setItem(KEY, JSON.stringify(obj));
    }

    return data;
}
