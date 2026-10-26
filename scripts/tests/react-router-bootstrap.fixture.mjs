import { cp, mkdtemp, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Isolated fixtures use installed framework dependencies and the built SDK.
// No example sources, environment variables, data, or build output are modified.
export async function createReactRouterFixture({ apiOnly, base = "/demo/", port = 0 }) {
    const repo = fileURLToPath(new URL("../../", import.meta.url));
    const example = join(repo, "examples/react-router-framework");
    const root = await mkdtemp(join(tmpdir(), "oidc-rr-bootstrap-"));
    await mkdir(join(root, "node_modules"));
    for (const name of await readdir(join(example, "node_modules"))) {
        if (name.startsWith(".") || name === "oidc-spa") continue;
        await symlink(join(example, "node_modules", name), join(root, "node_modules", name));
    }
    await cp(join(repo, "dist"), join(root, "node_modules/oidc-spa"), { recursive: true });
    await mkdir(join(root, "ui/routes"), { recursive: true });
    await mkdir(join(root, "public"));
    const files = {
        "package.json": JSON.stringify({
            type: "module",
            private: true,
            dependencies: { "@react-router/node": "8.5.0", isbot: "5.2.2" }
        }),
        "vite.config.ts": `
import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";
export default defineConfig({ base:${JSON.stringify(
            base
        )},server:{host:"127.0.0.1",port:${port},strictPort:true},
    plugins:[reactRouter(),oidcSpa({browserRuntimeFreeze:{enabled:true},DPoP:{enabled:true,mode:"auto"}})] });`,
        "react-router.config.ts": `export default {appDirectory:"ui", basename:${JSON.stringify(
            base
        )},ssr:${apiOnly ? '"unstable_api-only"' : "false"}};`,
        "tsconfig.json": JSON.stringify({
            compilerOptions: {
                jsx: "react-jsx",
                module: "ESNext",
                moduleResolution: "Bundler",
                target: "ES2022",
                types: ["vite/client"]
            }
        }),
        "ui/routes.ts": `import {index,route} from "@react-router/dev/routes"; export default [index("routes/home.tsx"),route("todo","routes/todo.tsx")];`,
        "ui/oidc.ts": `import {oidcSpa} from "oidc-spa/react-spa";
export const {OidcInitializationGate,getOidc}=oidcSpa.withUser(()=>({name:"fixture"})).withRuntimeConfigs({mode:"mock",isUserInitiallyLoggedIn:true}).createUtils();`,
        "ui/dependency.ts": `if(typeof window!=="undefined"){
const protectedRuntime=Object.getOwnPropertyDescriptor(window,"fetch")?.configurable===false;
(window.__canaries??=[]).push("dependency:"+(protectedRuntime?"protected":"EARLY"));
if(parent!==window)parent.postMessage("unexpected-app-evaluation",location.origin);
if(!protectedRuntime)throw new Error("Application dependency evaluated before oidcEarlyInit");}`,
        "ui/entry.server.tsx": `import {ServerRouter} from "react-router";
import {renderToReadableStream} from "react-dom/server";
export const streamTimeout=5000;
export default async function(request,status,headers,context){
const body=await renderToReadableStream(<ServerRouter context={context} url={request.url}/>,{nonce:"fixture-nonce",signal:request.signal});
await body.allReady;
headers.set("Content-Type","text/html");
headers.set("Content-Security-Policy","script-src 'nonce-fixture-nonce' 'strict-dynamic'; object-src 'none'");
headers.append("Set-Cookie","fixture-a=1; Path=/");headers.append("Set-Cookie","fixture-b=2; Path=/");
return new Response(body,{status,headers});}`,
        "ui/root.tsx": `import "./dependency";
import {Links,Meta,Outlet,Scripts,useLoaderData} from "react-router";
import {OidcInitializationGate} from "./oidc";
if(typeof window!=="undefined") window.__canaries.push("root:"+(Object.getOwnPropertyDescriptor(window,"fetch")?.configurable===false?"protected":"EARLY"));
${
    apiOnly
        ? `export const middleware=[async({request},next)=>{
if(!request.headers.get("Authorization"))throw new Response("Root middleware requires authentication",{status:401});return next();}];
export async function loader({request}){if(!request.headers.get("Authorization"))throw new Response("Root loader requires authentication",{status:401});return {rootValue:"authenticated root data"};}`
        : `export async function loader(){return {rootValue:"public build-time root data"};}`
}
export function Layout({children}){return <html><head><Meta/><Links/>
<script nonce="fixture-nonce" suppressHydrationWarning dangerouslySetInnerHTML={{__html:'(window.__canaries??=[]).push("inline:"+(Object.getOwnPropertyDescriptor(window,"fetch")?.configurable===false?"protected":"EARLY"));if(parent!==window)parent.postMessage("unexpected-app-evaluation",location.origin);'}}/>
</head><body>{children}<Scripts nonce="fixture-nonce"/></body></html>;}
export default function Root(){const data=useLoaderData();return <OidcInitializationGate><h1>Bootstrap fixture</h1><p id="root-data">{data?.rootValue}</p><output id="initialization-order">{window.__canaries.join(", ")}</output><Outlet/></OidcInitializationGate>;}
export function HydrateFallback(){return null;}
export function ErrorBoundary({error}){return <p role="alert">{String(error.status||error.message||error)}</p>;}`,
        "ui/routes/home.tsx": `export default function Home(){return <p>Home</p>;}`,
        "ui/routes/todo.tsx": `${
            apiOnly
                ? `export async function loader({request}){if(!request.headers.get("Authorization"))throw new Response("Unauthorized",{status:401});return {value:"authenticated todo data"};}
export async function action({request}){if(!request.headers.get("Authorization"))throw new Response("Unauthorized",{status:401});return {saved:(await request.formData()).get("todo")};}`
                : ""
        }
export async function clientLoader(args){${
            apiOnly ? "return args.serverLoader();" : 'return {value:"SPA browser data"};'
        }}
export default function Todo({loaderData}){return <p id="todo-data">{loaderData.value}</p>;}`,
        "ui/entry.client.tsx": `import {hydrateRoot} from "react-dom/client";
import {HydratedRouter} from "react-router/dom";
import {getOidc} from "./oidc";
hydrateRoot(document,<HydratedRouter unstable_fetch={async(request,context)=>{
if(context.type==="manifest")return fetch(request);
const oidc=await getOidc();const headers=new Headers(request.headers);
if(oidc.isUserLoggedIn)headers.set("Authorization","Bearer "+await oidc.getAccessToken());
return fetch(new Request(request,{headers}));}}/>);`,
        "serve.mjs": `import {createServer} from "node:http";import {readFile} from "node:fs/promises";import {resolve,extname} from "node:path";
const base=${JSON.stringify(base)};
const api=${
            apiOnly
                ? `(await import("@react-router/node")).createRequestListener({build:await import("./build/server/index.js"),mode:"production"})`
                : "undefined"
        };
const root=resolve("build/client");
createServer(async(req,res)=>{try{
const path=new URL(req.url,"http://localhost").pathname;
if(api&&(path.endsWith(".data")||path===base+"__manifest"))return api(req,res);
const relative=path.startsWith(base)?path.slice(base.length):path;
let file=resolve(root,"."+"/"+decodeURIComponent(relative));
if(!file.startsWith(root+"/"))file=root+"/index.html";
let body;try{body=await readFile(file);}catch{file=root+"/index.html";body=await readFile(file);}
const extension=extname(file);res.setHeader("Content-Type",extension===".js"?"text/javascript":extension===".css"?"text/css":"text/html");
if(extension===".html")res.setHeader("Content-Security-Policy","script-src 'nonce-fixture-nonce' 'strict-dynamic'; object-src 'none'");
res.end(body);
}catch(error){res.statusCode=500;res.end(String(error));}}).listen(Number(process.env.PORT),process.env.HOST||"127.0.0.1",()=>console.log("fixture ready"));`,
        "public/callback-harness.html": `<!doctype html><html><body><h1>Callback iframe test</h1><output id="result">waiting</output><script nonce="fixture-nonce">
const state="b2lkYy1zcGEu"+"x".repeat(20);
localStorage.setItem("oidc."+state,JSON.stringify({data:{context:"iframe",configId:"fixture"}}));
let posted=false,loaded=false,failed=false;
const frame=document.createElement("iframe");
function update(){document.querySelector("#result").textContent=failed?"FAIL: application evaluated in callback iframe":posted&&loaded?"PASS: callback posted; application not evaluated":"waiting";}
addEventListener("message",event=>{if(event.source!==frame.contentWindow)return;
if(event.data==="unexpected-app-evaluation")failed=true;
if(typeof event.data==="string"&&event.data.startsWith("oidc-spa:cross-window-messaging:"))posted=true;
update();});
frame.onload=()=>{loaded=true;update();};
frame.src=${JSON.stringify(base)}+"todo?code=fixture&state="+state;
document.body.append(frame);
</script></body></html>`
    };
    if (!apiOnly) delete files["ui/entry.client.tsx"];
    for (const [name, text] of Object.entries(files)) await writeFile(join(root, name), text);
    return root;
}
