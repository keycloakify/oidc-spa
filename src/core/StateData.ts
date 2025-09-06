import { typeGuard, assert } from "../vendor/frontend/tsafe";
import { generateUrlSafeRandom } from "../tools/generateUrlSafeRandom";

export type StateData = StateData.IFrame | StateData.Redirect;

export namespace StateData {
    type Common = {
        configId: string;
    };

    export type IFrame = Common & {
        context: "iframe";
    };

    export type Redirect = Redirect.Login | Redirect.Logout;
    export namespace Redirect {
        type Common_Redirect = Common & {
            context: "redirect";
            redirectUrl: string;
            hasBeenProcessedByCallback: boolean;
        };

        export type Login = Common_Redirect & {
            action: "login";
            redirectUrl_consentRequiredCase: string;
            extraQueryParams: Record<string, string>;
        };

        export type Logout = Common_Redirect & {
            action: "logout";
            sessionId: string | undefined;
        };
    }
}

const STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX = "b2lkYy1zcGEu";
const RANDOM_STRING_LENGTH = 32 - STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX.length;

export function generateStateUrlParamValue(): string {
    return `${STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX}${generateUrlSafeRandom({
        length: RANDOM_STRING_LENGTH
    })}`;
}

export function getIsStatQueryParamValue(params: { maybeStateUrlParamValue: string }): boolean {
    const { maybeStateUrlParamValue } = params;

    return (
        maybeStateUrlParamValue.startsWith(STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX) &&
        maybeStateUrlParamValue.length ===
            STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX.length + RANDOM_STRING_LENGTH
    );
}

export const STATE_STORE_KEY_PREFIX = "oidc.";

function getKey(params: { stateUrlParamValue: string }) {
    const { stateUrlParamValue } = params;

    return `${STATE_STORE_KEY_PREFIX}${stateUrlParamValue}`;
}

function getStateStore(params: { stateUrlParamValue: string }): { data: StateData } | undefined {
    const { stateUrlParamValue } = params;

    const item = localStorage.getItem(getKey({ stateUrlParamValue }));

    if (item === null) {
        return undefined;
    }

    const obj = JSON.parse(item);

    assert(
        typeGuard<{ data: StateData }>(
            obj,
            obj instanceof Object && obj.data instanceof Object && typeof obj.data.context === "string"
        )
    );

    return obj;
}

function setStateStore(params: { stateUrlParamValue: string; obj: { data: StateData } }) {
    const { stateUrlParamValue, obj } = params;

    localStorage.setItem(getKey({ stateUrlParamValue }), JSON.stringify(obj));
}

export function clearStateStore(params: { stateUrlParamValue: string }) {
    const { stateUrlParamValue } = params;
    localStorage.removeItem(getKey({ stateUrlParamValue }));
}

export function getStateData(params: { stateUrlParamValue: string }): StateData | undefined {
    const { stateUrlParamValue } = params;

    const stateStore = getStateStore({ stateUrlParamValue });

    if (stateStore === undefined) {
        return undefined;
    }

    return stateStore.data;
}

export function markStateDataAsProcessedByCallback(params: { stateUrlParamValue: string }) {
    const { stateUrlParamValue } = params;

    const obj = getStateStore({ stateUrlParamValue });

    assert(obj !== undefined, "180465");
    assert(obj.data.context === "redirect", "649531");

    obj.data.hasBeenProcessedByCallback = true;

    setStateStore({ stateUrlParamValue, obj });
}
