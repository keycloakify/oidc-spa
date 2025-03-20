import { fetchWithAuth } from "../oidc.client";
import { API_URL } from "./API_URL";

type Todo = {
    id: string;
    text: string;
    isDone: boolean;
};

export async function getTodos(): Promise<Todo[]> {
    const response = await fetchWithAuth(`${API_URL}/api/todos`);

    if (!response.ok) {
        throw new Error("Failed to fetch todos");
    }

    return response.json();
}
