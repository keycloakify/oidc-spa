const state = "b2lkYy1zcGEuabcdefghijklmnopqrst";

export async function runEarlyInitCallbackScenario(params: {
    actualPath: string;
    oidcCallbackUrl?: string;
    BASE_URL: string;
    queryBeforeResponse?: string;
}) {
    const { actualPath, oidcCallbackUrl, BASE_URL, queryBeforeResponse = "" } = params;
    const callbackUrl = `https://example.test${actualPath}?${queryBeforeResponse}state=${state}&code=abc`;
    const navigation: string[] = [];

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            document: {},
            location: new URL(callbackUrl),
            addEventListener: () => {}
        }
    });
    Object.defineProperty(globalThis, "history", {
        configurable: true,
        value: { replaceState: (_state: unknown, _title: string, url: string) => navigation.push(url) }
    });
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) =>
                key === `oidc.${state}`
                    ? JSON.stringify({
                          data: {
                              context: "redirect",
                              action: "login",
                              configId: "test",
                              rootRelativeRedirectUrl: "/app/after-login",
                              rootRelativeRedirectUrl_consentRequiredCase: "/app/",
                              extraQueryParams: {},
                              oidcCallbackUrl
                          }
                      })
                    : null
        }
    });

    class TestMessageEvent {
        get data() {
            return undefined;
        }
        get origin() {
            return "https://example.test";
        }
    }
    Object.defineProperty(globalThis, "MessageEvent", {
        configurable: true,
        value: TestMessageEvent
    });

    const { oidcEarlyInit } = await import("../../src/core/earlyInit");
    const { shouldLoadApp } = oidcEarlyInit({ BASE_URL });

    return { shouldLoadApp, navigation };
}
