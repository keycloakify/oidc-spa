import { createBrowserRouter, type LoaderFunctionArgs } from "react-router-dom";
import { Layout } from "./Layout";
import { ProtectedPage } from "../pages/ProtectedPage";
import { PublicPage } from "../pages/PublicPage";
import { getOidc } from "oidc";

export const router = createBrowserRouter([
    {
        path: "/",
        Component: Layout,
        children: [
            {
                path: "protected",
                Component: ProtectedPage,
                loader: protectedRouteLoader
            },
            {
                index: true,
                Component: PublicPage
            }
        ]
    }
]);

async function protectedRouteLoader({ request }: LoaderFunctionArgs) {
    const oidc = await getOidc();

    if (oidc.isUserLoggedIn) {
        return null;
    }

    await oidc.login({
        // The loader function is invoked by react-router before the browser URL is updated to the target protected route URL.
        // Therefore, we need to specify where the user should be redirected after the login process completes.
        redirectUrl: request.url,

        // Explanation:
        // The 'doesCurrentHrefRequiresAuth' parameter informs oidc-spa whether it is acceptable to redirect the user to the current URL
        // if the user abandons the authentication process. This is crucial to prevent the user from being immediately redirected
        // back to the login page when pressing the back button from the login pages.
        // If the user navigated directly to the protected route (e.g., by clicking a link to your application from an external site),
        // then the current URL requires authentication.
        // Conversely, if the user navigated from an unprotected route within your application to the protected route,
        // then the current URL does not require authentication.
        doesCurrentHrefRequiresAuth: window.location.href === request.url
    });

    // Never here, the login method redirects the user to the identity provider.
}
