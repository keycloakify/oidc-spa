"use client";

import type { ReactNode } from "react";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "@/lib/oidc";

export function AccountPage() {
    const { user, issuerUri, clientId, validRedirectUri, goToAuthServer, backFromAuthServer } = useOidc({
        assert: "user logged in"
    });
    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    return (
        <section className="space-y-6">
            <h1 className="text-2xl font-semibold text-white">Account</h1>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xs shadow-slate-950/40">
                <dl className="grid gap-2 text-sm text-slate-400">
                    <InfoRow label="Name">{user.displayName}</InfoRow>
                    {user.email && <InfoRow label="Email">{user.email}</InfoRow>}
                </dl>

                {keycloakUtils && (
                    <>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                className="inline-flex items-center rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500"
                                onClick={() =>
                                    goToAuthServer({
                                        extraQueryParams: { kc_action: "UPDATE_PASSWORD" }
                                    })
                                }
                            >
                                Change password
                            </button>
                            <button
                                className="inline-flex items-center rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500"
                                onClick={() =>
                                    goToAuthServer({
                                        extraQueryParams: { kc_action: "UPDATE_PROFILE" }
                                    })
                                }
                            >
                                Update profile
                            </button>
                            <button
                                className="inline-flex items-center rounded-full border border-rose-400/60 px-4 py-2 text-sm font-semibold text-rose-200 transition-colors hover:border-rose-300 hover:text-rose-100"
                                onClick={() =>
                                    goToAuthServer({
                                        extraQueryParams: { kc_action: "delete_account" }
                                    })
                                }
                            >
                                Delete account
                            </button>
                        </div>

                        {backFromAuthServer?.extraQueryParams.kc_action && (
                            <p className="mt-4 text-sm text-slate-400">
                                Result for {backFromAuthServer.extraQueryParams.kc_action}:{" "}
                                <span className="font-medium text-white">
                                    {backFromAuthServer.result.kc_action_status}
                                </span>
                            </p>
                        )}
                    </>
                )}
            </div>
            {keycloakUtils && (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                    <a
                        className="inline-flex items-center text-slate-200 underline decoration-slate-700 underline-offset-4 transition-colors hover:decoration-slate-400"
                        href={keycloakUtils.getAccountUrl({
                            clientId,
                            validRedirectUri,
                            locale: undefined
                        })}
                        rel="noreferrer"
                        target="_blank"
                    >
                        Open the Keycloak account console
                    </a>
                </div>
            )}
        </section>
    );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-400">{label}</dt>
            <dd className="font-medium text-white">{children}</dd>
        </div>
    );
}
