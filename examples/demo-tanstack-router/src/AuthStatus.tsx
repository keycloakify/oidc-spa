import { useUser } from 'oidc';
import { useOidc } from 'oidc-spa/react'

export function AuthStatus() {
  const { oidc } = useOidc()
  if (!oidc.isUserLoggedIn) {
    return (
      <>
        <p>
          You're not logged in.
        </p>

        <button
          onClick={() =>
            oidc.login({
              doesCurrentHrefRequiresAuth: false
            })
          }
        >
          Login
        </button>

      </>
    );
  }

  return <AppLoggedIn logout={() => oidc.logout({ redirectTo: "home" })}
  />
}


function AppLoggedIn(props: { logout: () => Promise<never> }) {
  const { logout } = props;

  const { user } = useUser();

  return (
    <>
      <p>Hello {user.preferred_username}</p>
      <button onClick={logout}>Log out</button>
    </>
  );
}