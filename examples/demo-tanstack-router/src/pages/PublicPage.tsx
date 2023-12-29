import { Link } from "@tanstack/react-router";

export function PublicPage() {
  return <>
    <h1>Public Page</h1>
    <Link to="/protected" >
      Link to protected route
    </Link>
  </>;
}
