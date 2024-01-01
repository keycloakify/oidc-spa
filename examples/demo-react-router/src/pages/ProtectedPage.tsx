import { useUser } from "oidc";

export function ProtectedPage() {
    // Here you can safely access the user object.
    // We know the user is logged in because this is a protected page.
    const { user } = useUser();

    return (
        <h4>
            Hello {user.preferred_username}
            <br />
            The page you are currently viewing can only be accessed when you are authenticated.
        </h4>
    );
}
