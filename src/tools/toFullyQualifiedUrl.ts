export function toFullyQualifiedUrl(urlish: string) {
    let url: string;

    if (urlish.startsWith("http")) {
        url = urlish;
    } else {
        let path = urlish;

        if (!path.startsWith("/")) {
            path = `/${path}`;
        }

        url = `${window.location.origin}${path}`;
    }

    url = url.replace(/\/$/, "");

    return url;
}
