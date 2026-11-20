import { test } from "node:test";
import assert from "node:assert/strict";
import { getAreSameSite } from "../../src/tools/sameSite";

for (const [name, url1, url2, expected] of [
    [
        "SSPCloud subdomains at different depths",
        "https://datalab.sspcloud.fr",
        "https://auth.lab.sspcloud.fr",
        true
    ],
    ["parent domain and subdomain", "https://example.com", "https://auth.example.com", true],
    [
        "ports, paths and queries do not affect the site",
        "https://app.example.com:3000/app?x=1",
        "https://auth.example.com:8443/authorize?x=2",
        true
    ],
    ["different schemes on the same host", "http://example.com", "https://example.com", false],
    ["different root domains", "https://app.example.com", "https://auth.other.com", false],
    ["different top-level domains", "https://app.example.com", "https://auth.example.fr", false],
    ["hostname case normalization", "https://APP.EXAMPLE.COM", "https://auth.example.com", true],
    ["IDNA normalization", "https://app.bücher.de", "https://auth.xn--bcher-kva.de", true],
    ["same localhost with different ports", "http://localhost:3000", "http://localhost:8080", true],
    ["different single-label hosts", "http://app", "http://auth", false],
    ["localhost and its subdomain", "http://localhost", "http://auth.localhost", false],
    ["same IPv4 address with different ports", "http://127.0.0.1:3000", "http://127.0.0.1:8080", true],
    ["canonical IPv4 address", "http://127.1", "http://127.0.0.1", true],
    ["different IPv4 addresses sharing final octets", "http://127.0.0.1", "http://192.168.0.1", false],
    ["IPv4 address and domain", "http://127.0.0.1", "http://auth.example.com", false],
    ["canonical IPv6 address", "http://[0:0:0:0:0:0:0:1]:3000", "http://[::1]:8080", true],
    ["different IPv6 addresses", "http://[::1]", "http://[::2]", false],
    ["trailing dots on both hosts", "https://app.example.com.", "https://auth.example.com.", true],
    [
        "different domains with trailing dots",
        "https://app.example.com.",
        "https://auth.other.com.",
        false
    ],
    ["trailing dot on only one host", "https://example.com", "https://example.com.", false],
    // Deliberate false positives: resolving these boundaries requires the PSL.
    ["multi-label public suffix", "https://app.foo.co.uk", "https://auth.bar.co.uk", true],
    ["private public suffix", "https://alice.github.io", "https://bob.github.io", true]
] as const) {
    test(`same-site approximation: ${name}`, () => {
        assert.equal(getAreSameSite({ url1, url2 }), expected);
        assert.equal(getAreSameSite({ url1: url2, url2: url1 }), expected);
    });
}
