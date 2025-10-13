export function getBaseHref() {
    const baseEl = document.querySelector<HTMLBaseElement>("base[href]");
    if (!baseEl) {
        throw new Error('No <base href="..."> element found in the DOM');
    }
    return baseEl.getAttribute("href") ?? "/";
}
