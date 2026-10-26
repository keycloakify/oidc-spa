import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { OidcInitializationGate } from "@/lib/oidc";
import { AutoLogoutWarningOverlay } from "@/components/AutoLogoutWarningOverlay";
import { AppHeader } from "@/components/AppHeader";

export const metadata: Metadata = {
    title: "oidc-spa + Next.js",
    description: "A minimal Next.js example with oidc-spa and tRPC."
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <OidcInitializationGate>
                    <AppHeader />
                    <main>{children}</main>
                    <AutoLogoutWarningOverlay />
                </OidcInitializationGate>
            </body>
        </html>
    );
}
