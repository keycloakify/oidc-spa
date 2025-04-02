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

export function generateStateQueryParamValue(): string {
    return `${STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX}${generateUrlSafeRandom({
        length: RANDOM_STRING_LENGTH
    })}`;
}

export function getIsStatQueryParamValue(params: { maybeStateQueryParamValue: string }): boolean {
    const { maybeStateQueryParamValue } = params;

    return (
        maybeStateQueryParamValue.startsWith(STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX) &&
        maybeStateQueryParamValue.length ===
            STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX.length + RANDOM_STRING_LENGTH
    );
}

export const STATE_STORE_KEY_PREFIX = "oidc.";

function getKey(params: { stateQueryParamValue: string }) {
    const { stateQueryParamValue } = params;

    return `${STATE_STORE_KEY_PREFIX}${stateQueryParamValue}`;
}

function getStateStore(params: { stateQueryParamValue: string }): { data: StateData } | undefined {
    const { stateQueryParamValue } = params;

    const item = localStorage.getItem(getKey({ stateQueryParamValue }));

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

function setStateStore(params: { stateQueryParamValue: string; obj: { data: StateData } }) {
    const { stateQueryParamValue, obj } = params;

    localStorage.setItem(getKey({ stateQueryParamValue }), JSON.stringify(obj));
}

export function clearStateStore(params: { stateQueryParamValue: string }) {
    const { stateQueryParamValue } = params;
    localStorage.removeItem(getKey({ stateQueryParamValue }));
}

export function getStateData(params: { stateQueryParamValue: string }): StateData | undefined {
    const { stateQueryParamValue } = params;

    const stateStore = getStateStore({ stateQueryParamValue });

    if (stateStore === undefined) {
        return undefined;
    }

    return stateStore.data;
}

export function markStateDataAsProcessedByCallback(params: { stateQueryParamValue: string }) {
    const { stateQueryParamValue } = params;

    const obj = getStateStore({ stateQueryParamValue });

    assert(obj !== undefined, "180465");
    assert(obj.data.context === "redirect", "649531");

    obj.data.hasBeenProcessedByCallback = true;

    setStateStore({ stateQueryParamValue, obj });
}
