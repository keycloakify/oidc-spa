export function getUserEnvironmentInfo(): string {
    function safeGet<T>(getter: () => T, fallback: string = "Unknown"): string {
        try {
            const value = getter();
            return value != null ? String(value) : fallback;
        } catch {
            return fallback;
        }
    }

    const ua = safeGet(() => navigator.userAgent);
    const platform = safeGet(() => navigator.platform);
    const language = safeGet(() => navigator.language || (navigator as any).userLanguage);
    const screenSize = safeGet(() => `${screen.width}x${screen.height}`);
    const timezone = safeGet(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

    const browser: string = (() => {
        if (ua.includes("Firefox/")) return "Firefox";
        if (ua.includes("Edg/")) return "Edge";
        if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
        if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
        if (ua.includes("OPR/") || ua.includes("Opera/")) return "Opera";
        return "Unknown";
    })();

    const os: string = (() => {
        if (platform.startsWith("Win")) return "Windows";
        if (platform.startsWith("Mac")) return "macOS";
        if (platform.startsWith("Linux")) return "Linux";
        if (/Android/.test(ua)) return "Android";
        if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
        return "Unknown";
    })();

    return `Browser: ${browser}
OS: ${os}
Platform: ${platform}
Language: ${language}
Screen: ${screenSize}
Timezone: ${timezone}
User Agent: ${ua}`;
}
