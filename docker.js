// 目标 Docker 官方源
const registryAddr = "https://registry-1.docker.io";

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  console.log(`[Request Received] Method: ${request.method}, URL: ${request.url}`);

  // 1. 拦截 Docker 客户端的探活请求 (v2 接口)
  if (path === "/" || path === "/v2" || path === "/v2/") {
    console.log(`[Ping Handler] Responding with v2 distribution header to origin: ${url.origin}`);
    return new Response(JSON.stringify({ message: "Docker Registry Accelerator is Running" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Www-Authenticate": `Bearer realm="${url.origin}/v2/token",service="registry.docker.io"`,
        "Docker-Distribution-Api-Version": "registry/2.0"
      }
    });
  }

  // 2. 拦截获取 Token 的请求，将其重定向/反代到官方的 Auth 服务
  if (path === "/v2/token") {
    const targetUrl = new URL("https://auth.docker.io/token" + url.search);
    console.log(`[Token Request] Fetching token from official auth: ${targetUrl.toString()}`);
    try {
      const resp = await fetch(targetUrl.toString(), {
        headers: request.headers
      });
      console.log(`[Token Response] Status: ${resp.status}`);
      return resp;
    } catch (e) {
      console.error(`[Token Error] Failed to fetch token:`, e);
      return new Response(`Token Auth Error: ${e.message}`, { status: 500 });
    }
  }

  // 3. 代理镜像层(Blobs)、清单(Manifests)的实际拉取请求
  const targetUrl = new URL(path + url.search, registryAddr);
  console.log(`[Proxy Fetch] Routing request to official registry: ${targetUrl.toString()}`);
  
  // 复制请求头并修正 Host
  const headers = new Headers(request.headers);
  headers.set("Host", "registry-1.docker.io");

  try {
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: "follow" // 允许跟随重定向以获得最佳 CDN 节点
    });

    console.log(`[Proxy Response] Status: ${response.status} from registry for path: ${path}`);

    // 创建新响应，注入 Docker 版本头以骗过 Docker 客户端
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Docker-Distribution-Api-Version", "registry/2.0");

    // 修正重定向认证域名 (Www-Authenticate 挑战)，让 Docker 客户端通过代理获取 Token
    const authHeader = response.headers.get("Www-Authenticate");
    if (authHeader) {
      const modifiedAuth = authHeader.replace(
        /realm="https:\/\/auth\.docker\.io\/token"/i,
        `realm="${url.origin}/v2/token"`
      );
      newHeaders.set("Www-Authenticate", modifiedAuth);
      console.log(`[Auth Challenge Modified] ${authHeader} -> ${modifiedAuth}`);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (err) {
    console.error(`[Proxy Error] Error pulling registry path ${path}:`, err);
    return new Response(`Registry Proxy Error: ${err.message}`, { status: 500 });
  }
}

// 腾讯边缘计算的入口监听器
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});
