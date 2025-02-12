let cache: boolean | undefined = undefined;

export function getIsDev(): boolean {
    if (cache !== undefined) {
        return cache;
    }

    const isDev = (() => {
        if (/https?:\/\/localhost/.test(window.location.href)) {
            return true;
        }

        if (
            typeof process === "object" &&
            process !== null &&
            process.env instanceof Object &&
            process.env.NODE_ENV !== "production"
        ) {
            return true;
        }

        if (document.querySelector('script[type="module"][src="/@vite/client"]') !== null) {
            return true;
        }

        return false;
    })();

    return (cache = isDev);
}
