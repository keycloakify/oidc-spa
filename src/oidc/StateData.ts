export type StateData = {
    configHash: string;
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

function getIsStateData(value: any): value is StateData {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    if (typeof value.configHash !== "string") {
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

export function getStateData(params: { state: string }): StateData | undefined {
    const { state } = params;

    const lsItem = localStorage.getItem(`oidc.${state}`);

    if (lsItem === null) {
        return undefined;
    }

    const { data } = JSON.parse(lsItem).data;

    if (!getIsStateData(data)) {
        return undefined;
    }

    return data;
}
