import { getUserEnvironmentInfo } from "../tools/getUserEnvironmentInfo";

const LOCAL_STORAGE_KEY = "oidc-spa_966975_diagnostic";
const appInstanceId = Math.random().toString(36).slice(2);

type LogEntry = {
    appInstanceId: string;
    time: number;
    message: string;
};

function log(message: string) {
    const logEntry: LogEntry = {
        appInstanceId,
        time: Date.now(),
        message
    };

    const value = localStorage.getItem(LOCAL_STORAGE_KEY);

    const value_parsed: LogEntry[] = value === null ? [] : JSON.parse(value);

    if (value_parsed.length === 100) {
        value_parsed.shift();
    }

    value_parsed.push(logEntry);

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(value_parsed));
}

function report() {
    const logEntries: LogEntry[] = (() => {
        const value = localStorage.getItem(LOCAL_STORAGE_KEY);

        if (value === null) {
            return [];
        }

        return JSON.parse(value);
    })();

    localStorage.removeItem(LOCAL_STORAGE_KEY);

    const report = [
        getUserEnvironmentInfo(),
        ...logEntries.map(
            ({ appInstanceId, time, message }) => `${appInstanceId} (${time}): ${message}`
        ),
        getOidcLocalStorageDump()
    ].join("\n");

    const key_report = `${LOCAL_STORAGE_KEY}_report_b64`;

    localStorage.setItem(key_report, btoa(report));

    console.warn(
        [
            "If you see this message there's been unexpected behavior in oidc-spa",
            "It is a hard to reproduce case, could you please open an issue on https://github.com/keycloakify/oidc-spa",
            `and include the value of \`localStorage["${key_report}"]\` in the message?`,
            "Alternatively, you can send an email at joseph.garrone@protonmail.com",
            "Thanks in advance for helping me figure this out"
        ].join(" ")
    );
}

export const debug966975 = {
    log,
    report
};

function getOidcLocalStorageDump(): string {
    const entries: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("oidc.")) {
            const value = localStorage.getItem(key);
            entries.push(`${key} = ${value}`);
        }
    }

    return entries.join("\n");
}
