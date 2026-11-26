import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { AutoLogoutWarningOverlay } from "@/components/AutoLogoutWarningOverlay";

export const metadata: Metadata = {
    title: "oidc-spa + Next.js",
    description: "A minimal Next.js example with oidc-spa and tRPC."
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <AppHeader />
                <main>{children}</main>
                <AutoLogoutWarningOverlay />
            </body>
        </html>
    );
}
