/**
 * Approximates schemeful same-site for HTTP(S) URLs without the Public Suffix List.
 * False means definitely cross-site; true can be a false positive for public
 * suffixes such as co.uk or github.io. Ports and paths do not affect the site.
 */
export function getAreSameSite(params: { url1: string; url2: string }): boolean {
    const url1 = new URL(params.url1);
    const url2 = new URL(params.url2);

    if (url1.protocol !== url2.protocol) {
        return false;
    }

    const hostname1 = url1.hostname;
    const hostname2 = url2.hostname;

    if (hostname1 === hostname2) {
        return true;
    }

    // URL normalizes IPv4 addresses and encloses IPv6 addresses in brackets.
    const isIpAddress = (hostname: string): boolean =>
        hostname.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);

    if (isIpAddress(hostname1) || isIpAddress(hostname2)) {
        return false;
    }

    // Keep trailing dots: example.com and example.com. are different sites.
    const getDomainCandidate = (hostname: string): string =>
        hostname
            .split(".")
            .slice(hostname.endsWith(".") ? -3 : -2)
            .join(".");

    // A registrable domain has at least two labels. Without the PSL, treating
    // matching final labels as same-site intentionally permits false positives.
    return getDomainCandidate(hostname1) === getDomainCandidate(hostname2);
}
