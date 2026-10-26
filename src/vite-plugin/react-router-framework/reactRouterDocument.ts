import { parse, type DefaultTreeAdapterMap } from "../../vendor/build-runtime/parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
const SCRIPT_TYPE = "application/x-oidc-spa-pending";
const TYPE_ATTRIBUTE = "data-oidc-spa-type";
const REL_ATTRIBUTE = "data-oidc-spa-rel";

/** Keep the document bytes intact except for script/preload start tags and our bootstrap. */
export function protectReactRouterDocument(html: string, bootstrapUrl: string): string {
    const document = parse(html, { sourceCodeLocationInfo: true });
    const edits: { start: number; end: number; text: string }[] = [];
    let head: Element | undefined;
    let nonce: string | undefined;
    let hasRouterBootstrap = false;

    function visit(node: Node): void {
        if (!("tagName" in node)) {
            if ("childNodes" in node) node.childNodes.forEach(visit);
            return;
        }
        if (node.tagName === "head") head = node;
        const attributes = new Map(node.attrs.map(({ name, value }) => [name, value]));
        // These can execute without a script element, before a module bootstrap starts.
        // Refuse an unsafe shell instead of silently claiming an initialization boundary.
        if (
            node.attrs.some(
                ({ name, value }) =>
                    name.startsWith("on") ||
                    (["href", "src", "action", "formaction"].includes(name) &&
                        /^javascript:/i.test(value.replace(/[\u0000-\u0020]/g, "")))
            )
        ) {
            throw new Error(
                "oidc-spa: Executable HTML attributes in the React Router shell cannot run before early initialization. Move them into the initialized application."
            );
        }
        if (
            ["iframe", "frame", "object", "embed"].includes(node.tagName) &&
            node.attrs.some(({ name }) => ["src", "srcdoc", "data"].includes(name))
        ) {
            throw new Error(
                "oidc-spa: Active embedded documents in the React Router shell must be rendered inside the initialized application."
            );
        }
        if (attributes.has(TYPE_ATTRIBUTE) || attributes.has(REL_ATTRIBUTE)) {
            throw new Error("oidc-spa: React Router document was protected more than once.");
        }
        const location = node.sourceCodeLocation;
        if (node.tagName === "script" && location?.startTag) {
            const type = attributes.get("type")?.trim().toLowerCase().split(";")[0] ?? "";
            // JSON, import maps, and other data blocks must retain their native types.
            if (
                ["", "module", "text/jscript", "text/livescript"].includes(type) ||
                /^(?:text|application)\/(?:x-)?(?:java|ecma)script(?:1\.[0-5])?$/.test(type)
            ) {
                if (node.namespaceURI !== "http://www.w3.org/1999/xhtml") {
                    throw new Error(
                        "oidc-spa: Script elements in foreign namespaces are not supported in the React Router shell."
                    );
                }
                const text = html.slice(location.startTag.endOffset, location.endTag?.startOffset);
                if (text.includes("window.__reactRouterRouteModules")) hasRouterBootstrap = true;
                nonce ??= attributes.get("nonce");
                const originalType = attributes.get("type");
                const attrs = node.attrs.filter(({ name }) => name !== "type");
                attrs.push({ name: "type", value: SCRIPT_TYPE });
                attrs.push({ name: TYPE_ATTRIBUTE, value: originalType ?? "~" });
                edits.push({
                    start: location.startTag.startOffset,
                    end: location.startTag.endOffset,
                    text: `<script${attrs
                        .map(({ name, value }) => ` ${name}="${escapeAttribute(value)}"`)
                        .join("")}>`
                });
            }
        }
        if (node.tagName === "link" && location?.startTag) {
            const rel = attributes.get("rel") ?? "";
            // Avoid fetching the application graph in a callback iframe as well as avoiding evaluation.
            if (
                rel.toLowerCase().split(/\s+/).includes("modulepreload") ||
                (rel.toLowerCase().split(/\s+/).includes("preload") &&
                    ["script", "worker"].includes(attributes.get("as")?.toLowerCase() ?? ""))
            ) {
                const attrs = node.attrs.filter(({ name }) => name !== "rel");
                attrs.push({ name: REL_ATTRIBUTE, value: rel });
                edits.push({
                    start: location.startTag.startOffset,
                    end: location.startTag.endOffset,
                    text: `<link${attrs
                        .map(({ name, value }) => ` ${name}="${escapeAttribute(value)}"`)
                        .join("")}>`
                });
            }
        }
        node.childNodes.forEach(visit);
        // Template contents are intentionally inert; leave them alone.
    }
    visit(document);
    if (!hasRouterBootstrap || head?.sourceCodeLocation?.startTag === undefined) {
        throw new Error(
            "oidc-spa: Unrecognized React Router document bootstrap. Cannot guarantee early initialization."
        );
    }
    const insertAt = head.sourceCodeLocation.startTag.endOffset;
    edits.push({
        start: insertAt,
        end: insertAt,
        text: `<script type="module" src="${escapeAttribute(bootstrapUrl)}"${
            nonce === undefined ? "" : ` nonce="${escapeAttribute(nonce)}"`
        }></script>`
    });
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        html = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
    }
    return html;
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export async function protectReactRouterResponse(
    response: Response,
    bootstrapUrl: string
): Promise<Response> {
    if (
        !response.headers.get("Content-Type")?.toLowerCase().includes("text/html") ||
        response.body === null
    ) {
        return response;
    }
    const html = protectReactRouterDocument(await response.text(), bootstrapUrl);
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    headers.delete("ETag");
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

/** Serialized into a client virtual module. No imports or closure state are allowed here. */
export function resumeReactRouterDocument(): void {
    async function resume() {
        for (const link of document.querySelectorAll<HTMLLinkElement>("link[data-oidc-spa-rel]")) {
            link.rel = link.getAttribute("data-oidc-spa-rel")!;
            link.removeAttribute("data-oidc-spa-rel");
        }
        for (const original of document.querySelectorAll<HTMLScriptElement>(
            "script[data-oidc-spa-type]"
        )) {
            const script = document.createElement("script");
            for (const { name, value } of original.attributes) {
                if (name !== "type" && name !== "data-oidc-spa-type") script.setAttribute(name, value);
            }
            const type = original.getAttribute("data-oidc-spa-type")!;
            if (type !== "~") script.type = type;
            if (original.nonce) script.nonce = original.nonce;
            script.textContent = original.textContent;
            if (script.src && !original.hasAttribute("async")) script.async = false;
            // Inline modules do not fire a load event. Like the HTML parser, let modules
            // run asynchronously while the following classic hydration-stream scripts run.
            const loaded =
                script.src &&
                !script.noModule &&
                type.trim().toLowerCase() !== "module" &&
                !original.hasAttribute("async") &&
                !original.hasAttribute("defer")
                    ? new Promise<void>((resolve, reject) => {
                          script.addEventListener("load", () => resolve(), { once: true });
                          script.addEventListener(
                              "error",
                              () =>
                                  reject(new Error("oidc-spa: Could not resume React Router document.")),
                              { once: true }
                          );
                      })
                    : undefined;
            original.replaceWith(script);
            if (loaded) await loaded;
        }
    }
    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                void resume();
            },
            { once: true }
        );
    } else {
        void resume();
    }
}
