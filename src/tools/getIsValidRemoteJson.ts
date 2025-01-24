export function getIsValidRemoteJson(url: string): Promise<boolean> {
    return fetch(url).then(
        async response => {
            if (!response.ok) {
                return false;
            }

            try {
                await response.json();
            } catch {
                return false;
            }

            return true;
        },
        () => false
    );
}
