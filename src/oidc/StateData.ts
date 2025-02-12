import { typeGuard, assert } from "../vendor/frontend/tsafe";
import { fnv1aHash } from "../tools/fnv1aHash";

export type StateData = StateData.IFrame | StateData.Redirect;

export namespace StateData {
    type Common = {
        configHash: string;
    };

    export type IFrame = Common & {
        context: "iframe";
    };

    export type Redirect = Common & {
        context: "redirect";
        redirectUrl: string;
        extraQueryParams: Record<string, string>;
        hasBeenProcessedByCallback: boolean;
    };
}

const STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX = "fa93b2c1c1d12b1c";

export function generateStateQueryParamValue(): string {
    return `${STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX}${fnv1aHash(`${Math.random()}`)}`;
}

export function getIsStatQueryParamValue(params: { maybeStateQueryParamValue: string }): boolean {
    const { maybeStateQueryParamValue } = params;

    return maybeStateQueryParamValue.startsWith(STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX);
}

export const STATE_STORE_KEY_PREFIX = "oidc.";

export function getKey(params: { stateQueryParamValue: string }) {
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

    assert(obj !== undefined);
    assert(obj.data.context === "redirect");

    obj.data.hasBeenProcessedByCallback = true;

    setStateStore({ stateQueryParamValue, obj });
}
