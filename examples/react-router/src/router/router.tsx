/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import { enforceLogin } from "../oidc";
const ProtectedPage = lazy(() => import("../pages/ProtectedPage"));
const PublicPage = lazy(() => import("../pages/PublicPage"));

export const router = createBrowserRouter([
    {
        path: "/",
        Component: Layout,
        children: [
            {
                path: "protected",
                loader: async ({ request }) => {
                    await enforceLogin(request.url);

                    return null;
                },
                element: (
                    <Suspense>
                        <ProtectedPage />
                    </Suspense>
                )
            },
            {
                index: true,
                element: (
                    <Suspense>
                        <PublicPage />
                    </Suspense>
                )
            }
        ]
    }
]);
