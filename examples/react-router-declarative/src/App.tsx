import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";
import { AppHeader } from "./components/AppHeader";
import Home from "./pages/Home";
import InactivityLogout from "./pages/InactivityLogout";
import NotFound from "./pages/NotFound";
import { AuthenticatedLayout } from "./pages/protected/AuthenticatedLayout";

const TodoListTrpc = lazy(() => import("./pages/protected/TodoListTrpc"));
const TodoListApi = lazy(() => import("./pages/protected/TodoListApi"));
const TodoListAdmin = lazy(() => import("./pages/protected/TodoListAdmin"));
const Account = lazy(() => import("./pages/protected/Account"));

export function App() {
    return (
        <>
            <AppHeader />
            <main>
                <Suspense fallback={<p>Loading...</p>}>
                    <Routes>
                        <Route index element={<Home />} />
                        <Route path="inactivity-logout" element={<InactivityLogout />} />
                        <Route element={<AuthenticatedLayout />}>
                            <Route path="todo-list-trpc" element={<TodoListTrpc />} />
                            <Route path="todo-list-api" element={<TodoListApi />} />
                            <Route path="todo-list-admin" element={<TodoListAdmin />} />
                            <Route path="account" element={<Account />} />
                        </Route>
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Suspense>
            </main>
        </>
    );
}
