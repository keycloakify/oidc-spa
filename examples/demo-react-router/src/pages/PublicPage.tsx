import { Link } from "react-router-dom";

export function PublicPage() {
    return (
        <>
            <h1>Public Page</h1>
            <Link to="/protected">Link to protected route</Link>
        </>
    );
}
