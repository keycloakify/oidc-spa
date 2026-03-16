import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OidcInitializationGate } from "@/lib/oidc";
import { AutoLogoutWarningOverlay } from "@/components/auto-logout-warning-overlay";
import { DemoShell } from "@/components/demo-shell";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"]
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"]
});

export default function RootLayout({
    children
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <OidcInitializationGate>
                    <DemoShell>{children}</DemoShell>
                    <AutoLogoutWarningOverlay />
                </OidcInitializationGate>
            </body>
        </html>
    );
}
