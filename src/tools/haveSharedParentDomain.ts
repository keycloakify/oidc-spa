export function getHaveSharedParentDomain(params: { url1: string; url2: string }): boolean {
    const { url1, url2 } = params;

    const url1Domain = new URL(url1).hostname;
    const url2Domain = new URL(url2).hostname;

    const getLevel2Domain = (url: string): string => {
        const parts = url.split(".");
        return parts.slice(parts.length - 2).join(".");
    };

    return getLevel2Domain(url1Domain) === getLevel2Domain(url2Domain);
}
