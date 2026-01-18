/*
 *  Copyright 2016 Red Hat, Inc. and/or its affiliates
 *  and other contributors as indicated by the @author tags.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

/*
 * MIT License
 *
 * Copyright 2017 Brett Epps <https://github.com/eppsilon>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import type { Keycloak } from "./Keycloak";

export interface KeycloakAuthorizationPromise {
    then: (
        onGrant: (rpt: string) => void,
        onDeny?: () => void,
        onError?: (error?: unknown) => void
    ) => void;
}

export interface AuthorizationRequest {
    /**
     * An array of objects representing the resource and scopes.
     */
    permissions?: ResourcePermission[];

    /**
     * A permission ticket obtained from a resource server when using UMA authorization protocol.
     */
    ticket?: string;

    /**
     * A boolean value indicating whether the server should create permission requests to the resources
     * and scopes referenced by a permission ticket. This parameter will only take effect when used together
     * with the ticket parameter as part of a UMA authorization process.
     */
    submitRequest?: boolean;

    /**
     * Defines additional information about this authorization request in order to specify how it should be processed
     * by the server.
     */
    metadata?: AuthorizationRequestMetadata;

    /**
     * Defines whether or not this authorization request should include the current RPT. If set to true, the RPT will
     * be sent and permissions in the current RPT will be included in the new RPT. Otherwise, only the permissions referenced in this
     * authorization request will be granted in the new RPT.
     */
    incrementalAuthorization?: boolean;

    /**
     * A token sent to the authorization server to help it evaluate resource permissions.
     */
    claimToken?: string;

    /**
     * Indicates the claim token format in use.
     */
    claimTokenFormat?: string;
}

export interface AuthorizationRequestMetadata {
    /**
     * A boolean value indicating to the server if resource names should be included in the RPT's permissions.
     * If false, only the resource identifier is included.
     */
    responseIncludeResourceName?: boolean;

    /**
     * An integer N that defines a limit for the amount of permissions an RPT can have. When used together with
     * rpt parameter, only the last N requested permissions will be kept in the RPT.
     */
    responsePermissionsLimit?: number;

    /**
     * Legacy snake_case values.
     */
    response_include_resource_name?: boolean;
    response_permissions_limit?: number;
}

export interface ResourcePermission {
    /**
     * The id or name of a resource.
     */
    id: string;

    /**
     * An array of strings where each value is the name of a scope associated with the resource.
     */
    scopes?: string[];
}

export interface Uma2Configuration {
    token_endpoint: string;
    rpt_endpoint?: string;
    [key: string]: unknown;
}

/**
 * @deprecated Instead of importing 'KeycloakAuthorizationInstance' you can import 'KeycloakAuthorization' directly as a type.
 */
export type KeycloakAuthorizationInstance = KeycloakAuthorization;

class KeycloakAuthorization {
    rpt: string | null = null;
    config: Uma2Configuration | undefined;
    then: KeycloakAuthorizationPromise["then"] | undefined;

    private configPromise: Promise<Uma2Configuration> | undefined;

    constructor(private keycloak: Keycloak) {}

    /**
     * Initializes the `KeycloakAuthorization` instance.
     * @deprecated Initialization now happens automatically, calling this method is no longer required.
     */
    init(): void {
        console.warn(
            "The 'init()' method is deprecated and will be removed in a future version. Initialization now happens automatically, calling this method is no longer required."
        );
    }

    /**
     * A promise that resolves when the `KeycloakAuthorization` instance is initialized.
     * @deprecated Initialization now happens automatically, using this property is no longer required.
     */
    get ready(): Promise<void> {
        console.warn(
            "The 'ready' property is deprecated and will be removed in a future version. Initialization now happens automatically, using this property is no longer required."
        );
        return Promise.resolve();
    }

    /**
     * This method enables client applications to better integrate with resource servers protected by a Keycloak
     * policy enforcer using UMA protocol.
     *
     * The authorization request must be provided with a ticket.
     *
     * @param authorizationRequest An AuthorizationRequest instance with a valid permission ticket set.
     * @returns A promise to set functions to be invoked on grant, deny or error.
     */
    authorize(authorizationRequest: AuthorizationRequest): KeycloakAuthorizationPromise {
        this.then = async (onGrant, onDeny, onError) => {
            try {
                await this.initializeConfigIfNeeded();
            } catch (error) {
                handleError(error, onError);
                return;
            }

            if (authorizationRequest && authorizationRequest.ticket) {
                const request = new globalThis.XMLHttpRequest();

                request.open("POST", this.config!.token_endpoint, true);
                request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                request.setRequestHeader("Authorization", "Bearer " + this.keycloak.token);

                request.onreadystatechange = () => {
                    if (request.readyState === 4) {
                        const status = request.status;

                        if (status >= 200 && status < 300) {
                            const rpt = JSON.parse(request.responseText).access_token as string;
                            this.rpt = rpt;
                            onGrant(rpt);
                        } else if (status === 403) {
                            if (onDeny) {
                                onDeny();
                            } else {
                                console.error("Authorization request was denied by the server.");
                            }
                        } else {
                            if (onError) {
                                onError();
                            } else {
                                console.error("Could not obtain authorization data from server.");
                            }
                        }
                    }
                };

                let params =
                    "grant_type=urn:ietf:params:oauth:grant-type:uma-ticket&client_id=" +
                    this.keycloak.clientId +
                    "&ticket=" +
                    authorizationRequest.ticket;

                if (authorizationRequest.submitRequest !== undefined) {
                    params += "&submit_request=" + authorizationRequest.submitRequest;
                }

                const metadata = authorizationRequest.metadata;

                if (metadata) {
                    const includeName =
                        metadata.responseIncludeResourceName ?? metadata.response_include_resource_name;
                    if (includeName !== undefined) {
                        params += "&response_include_resource_name=" + includeName;
                    }

                    const permissionsLimit =
                        metadata.responsePermissionsLimit ?? metadata.response_permissions_limit;
                    if (permissionsLimit !== undefined) {
                        params += "&response_permissions_limit=" + permissionsLimit;
                    }
                }

                if (
                    this.rpt &&
                    (authorizationRequest.incrementalAuthorization === undefined ||
                        authorizationRequest.incrementalAuthorization)
                ) {
                    params += "&rpt=" + this.rpt;
                }

                request.send(params);
            }
        };

        return this as KeycloakAuthorizationPromise;
    }

    /**
     * Obtains all entitlements from a Keycloak server based on a given resourceServerId.
     *
     * @param resourceServerId The id (client id) of the resource server to obtain permissions from.
     * @param authorizationRequest An AuthorizationRequest instance.
     * @returns A promise to set functions to be invoked on grant, deny or error.
     */
    entitlement(
        resourceServerId: string,
        authorizationRequest: AuthorizationRequest = {}
    ): KeycloakAuthorizationPromise {
        this.then = async (onGrant, onDeny, onError) => {
            try {
                await this.initializeConfigIfNeeded();
            } catch (error) {
                handleError(error, onError);
                return;
            }

            const request = new globalThis.XMLHttpRequest();

            request.open("POST", this.config!.token_endpoint, true);
            request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
            request.setRequestHeader("Authorization", "Bearer " + this.keycloak.token);

            request.onreadystatechange = () => {
                if (request.readyState === 4) {
                    const status = request.status;

                    if (status >= 200 && status < 300) {
                        const rpt = JSON.parse(request.responseText).access_token as string;
                        this.rpt = rpt;
                        onGrant(rpt);
                    } else if (status === 403) {
                        if (onDeny) {
                            onDeny();
                        } else {
                            console.error("Authorization request was denied by the server.");
                        }
                    } else {
                        if (onError) {
                            onError();
                        } else {
                            console.error("Could not obtain authorization data from server.");
                        }
                    }
                }
            };

            let params =
                "grant_type=urn:ietf:params:oauth:grant-type:uma-ticket&client_id=" +
                this.keycloak.clientId;

            if (authorizationRequest.claimToken) {
                params += "&claim_token=" + authorizationRequest.claimToken;

                if (authorizationRequest.claimTokenFormat) {
                    params += "&claim_token_format=" + authorizationRequest.claimTokenFormat;
                }
            }

            params += "&audience=" + resourceServerId;

            const permissions = authorizationRequest.permissions ?? [];

            for (let i = 0; i < permissions.length; i++) {
                const resource = permissions[i];
                let permission = resource.id;

                if (resource.scopes && resource.scopes.length > 0) {
                    permission += "#";
                    for (let j = 0; j < resource.scopes.length; j++) {
                        const scope = resource.scopes[j];
                        if (permission.indexOf("#") !== permission.length - 1) {
                            permission += ",";
                        }
                        permission += scope;
                    }
                }

                params += "&permission=" + permission;
            }

            const metadata = authorizationRequest.metadata;

            if (metadata) {
                const includeName =
                    metadata.responseIncludeResourceName ?? metadata.response_include_resource_name;
                if (includeName !== undefined) {
                    params += "&response_include_resource_name=" + includeName;
                }

                const permissionsLimit =
                    metadata.responsePermissionsLimit ?? metadata.response_permissions_limit;
                if (permissionsLimit !== undefined) {
                    params += "&response_permissions_limit=" + permissionsLimit;
                }
            }

            if (this.rpt) {
                params += "&rpt=" + this.rpt;
            }

            request.send(params);
        };

        return this as KeycloakAuthorizationPromise;
    }

    private async initializeConfigIfNeeded(): Promise<Uma2Configuration> {
        if (this.config) {
            return this.config;
        }

        if (this.configPromise) {
            return await this.configPromise;
        }

        if (!this.keycloak.didInitialize) {
            throw new Error("The Keycloak instance has not been initialized yet.");
        }

        this.configPromise = loadConfig(this.keycloak.authServerUrl, this.keycloak.realm);
        this.config = await this.configPromise;
        return this.config;
    }
}

/**
 * Obtains the configuration from the server.
 * @param serverUrl The URL of the Keycloak server.
 * @param realm The realm name.
 * @returns A promise that resolves when the configuration is loaded.
 */
async function loadConfig(serverUrl: string, realm: string): Promise<Uma2Configuration> {
    const url = `${serverUrl}/realms/${encodeURIComponent(realm)}/.well-known/uma2-configuration`;

    try {
        return await fetchJSON(url);
    } catch (error) {
        throw new Error("Could not obtain configuration from server.", { cause: error as Error });
    }
}

/**
 * Fetches the JSON data from the given URL.
 * @param url The URL to fetch the data from.
 * @returns A promise that resolves when the data is loaded.
 */
async function fetchJSON(url: string): Promise<Uma2Configuration> {
    let response: Response;

    try {
        response = await fetch(url);
    } catch (error) {
        throw new Error("Server did not respond.", { cause: error as Error });
    }

    if (!response.ok) {
        throw new Error("Server responded with an invalid status.");
    }

    try {
        return (await response.json()) as Uma2Configuration;
    } catch (error) {
        throw new Error("Server responded with invalid JSON.", { cause: error as Error });
    }
}

function handleError(error: unknown, handler?: (error: unknown) => void): void {
    if (handler) {
        handler(error);
    } else {
        console.error(error);
    }
}

export default KeycloakAuthorization;
