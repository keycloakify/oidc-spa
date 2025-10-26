import { Suspense } from "react";
import { useOidc } from "~/oidc";

/** See: https://docs.oidc-spa.dev/auto-logout */
export function AutoLogoutWarningOverlay() {
    return (
        <Suspense>
            <AutoLogoutWarningOverlay_actual />
        </Suspense>
    );
}

function AutoLogoutWarningOverlay_actual() {
    const { autoLogoutState } = useOidc();

    if (!autoLogoutState.shouldDisplayWarning) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur">
            <div
                role="alertdialog"
                aria-live="assertive"
                aria-modal="true"
                className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-xl shadow-black/30"
            >
                <p className="text-sm font-medium text-slate-400">Are you still there?</p>
                <p className="mt-2 text-lg font-semibold text-white">
                    You will be logged out in {autoLogoutState.secondsLeftBeforeAutoLogout}s
                </p>
            </div>
        </div>
    );
}
