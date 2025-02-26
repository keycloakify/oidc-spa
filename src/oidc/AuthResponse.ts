export type AuthResponse = {
    state: string;
    [key: string]: string | undefined;
};

export function getIsAuthResponse(data: any): data is AuthResponse {
    return (
        data instanceof Object &&
        "state" in data &&
        typeof data.state === "string" &&
        Object.values(data).every(value => value === undefined || typeof value === "string")
    );
}

export function authResponseToUrl(authResponse: AuthResponse): string {
    const authResponseUrl = new URL("https://dummy.com");

    for (const [name, value] of Object.entries(authResponse)) {
        if (value === undefined) {
            continue;
        }
        authResponseUrl.searchParams.set(name, value);
    }

    return authResponseUrl.href;
}
