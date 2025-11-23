export function getIsDomain(hostname: string): boolean {
    // Reject IPv4
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        return false;
    }

    // Reject IPv6
    if (hostname.includes(":")) {
        return false;
    }

    // Must contain at least one dot (e.g., "example.com")
    if (!hostname.includes(".")) {
        return false;
    }

    return true;
}
