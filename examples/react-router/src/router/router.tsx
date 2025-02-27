/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./Layout";
const ProtectedPage = lazy(() => import("../pages/ProtectedPage"));
const PublicPage = lazy(() => import("../pages/PublicPage"));

export const router = createBrowserRouter([
    {
        path: "/",
        Component: Layout,
        children: [
            {
                path: "protected",
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
