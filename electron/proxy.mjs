import dns from "node:dns/promises";
import net from "node:net";

const ALLOWED_SUFFIXES = [
  "google.com",
  "google.co.in",
  "accounts.google.com",
  "gstatic.com",
  "googleusercontent.com",
  "googleapis.com",
  "dictionary.com",
  "thesaurus.com",
  "sfdict.com",
  "merriam-webster.com",
  "m-w.com",
  "naver.com",
  "naver.net",
  "pstatic.net",
  "html-load.com",
  "content-loader.com",
  "d3d4gnv047l844.cloudfront.net",
  "challenges.cloudflare.com"
];
const DNS_SERVERS = ["94.140.14.14", "94.140.15.15"];
const CONNECT_OK = "HTTP/1.1 200 Connection Established\r\n\r\n";
const FORBIDDEN = "HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n";
const BAD_GATEWAY = "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n";

export function hostAllowed(host) {
  const normalized = normalizeHost(host);
  return (
    isGoogleDomain(normalized) ||
    ALLOWED_SUFFIXES.some(
      (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
    )
  );
}

export async function createProxyServer() {
  const blockedHosts = [];
  const resolver = new AdguardResolver();
  const server = net.createServer((client) => {
    handleClient(client, resolver, (host) => recordBlocked(blockedHosts, host)).catch(() => {
      client.destroy();
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Proxy failed to bind loopback TCP port.");
  }

  return {
    host: address.address,
    port: address.port,
    proxyRules: `http=${address.address}:${address.port};https=${address.address}:${address.port}`,
    addr: `${address.address}:${address.port}`,
    blockedHosts: () => [...blockedHosts],
    recordBlocked: (host) => recordBlocked(blockedHosts, host),
    warmHosts: (hosts) => warmHosts(resolver, hosts),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function warmHosts(resolver, hosts) {
  const uniqueHosts = [...new Set(hosts.map(normalizeHost).filter(hostAllowed))];
  await Promise.allSettled(uniqueHosts.map((host) => resolver.resolve(host)));
}

async function handleClient(client, resolver, recordBlockedHost) {
  const header = await readHeader(client);
  const parsed = parseProxyRequest(header);
  if (!parsed) {
    client.end(BAD_GATEWAY);
    return;
  }

  if (!hostAllowed(parsed.host)) {
    recordBlockedHost(parsed.host);
    client.end(FORBIDDEN);
    return;
  }

  const upstream = await connectResolved(resolver, parsed.host, parsed.port);
  if (!upstream) {
    client.end(BAD_GATEWAY);
    return;
  }

  client.on("error", () => upstream.destroy());
  upstream.on("error", () => client.destroy());

  if (parsed.isConnect) {
    client.write(CONNECT_OK);
  } else {
    upstream.write(parsed.rewrittenRequest);
  }

  client.pipe(upstream);
  upstream.pipe(client);
}

function readHeader(socket) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd !== -1 || buffer.length > 32 * 1024) {
        socket.off("data", onData);
        socket.off("error", reject);
        resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
    socket.once("end", () => resolve(buffer));
  });
}

function parseProxyRequest(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    return null;
  }

  const headerText = buffer.subarray(0, headerEnd).toString("utf8");
  const lines = headerText.split("\r\n");
  const [method, target, version = "HTTP/1.1"] = (lines[0] || "").split(/\s+/);
  if (!method || !target) {
    return null;
  }

  if (method.toUpperCase() === "CONNECT") {
    const [host, port] = splitHostPort(target, 443);
    if (!host || !port) {
      return null;
    }
    return { isConnect: true, host, port, rewrittenRequest: null };
  }

  let url;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") {
    return null;
  }

  const path = `${url.pathname || "/"}${url.search || ""}`;
  const headers = lines.slice(1).join("\r\n");
  const rewrittenHeader = `${method} ${path} ${version}\r\n${headers}\r\n\r\n`;
  const body = buffer.subarray(headerEnd + 4);

  return {
    isConnect: false,
    host: url.hostname,
    port: Number(url.port || 80),
    rewrittenRequest: Buffer.concat([Buffer.from(rewrittenHeader), body])
  };
}

function splitHostPort(target, defaultPort) {
  if (target.startsWith("[")) {
    const end = target.indexOf("]");
    if (end === -1) {
      return [null, null];
    }
    const host = target.slice(1, end);
    const port = target.slice(end + 1).startsWith(":")
      ? Number(target.slice(end + 2))
      : defaultPort;
    return [host, Number.isFinite(port) ? port : defaultPort];
  }

  const index = target.lastIndexOf(":");
  if (index === -1) {
    return [target, defaultPort];
  }
  const host = target.slice(0, index);
  const port = Number(target.slice(index + 1));
  return [host, Number.isFinite(port) ? port : defaultPort];
}

async function connectResolved(resolver, host, port) {
  const ips = await resolver.resolve(host);
  for (const ip of ips) {
    const socket = await connectWithTimeout(ip, port).catch(() => null);
    if (socket) {
      return socket;
    }
  }
  return null;
}

function connectWithTimeout(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("connect timeout"));
    }, 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

class AdguardResolver {
  constructor() {
    this.resolver = new dns.Resolver();
    this.resolver.setServers(DNS_SERVERS);
    this.cache = new Map();
  }

  async resolve(host) {
    const normalized = normalizeHost(host);
    if (net.isIP(normalized)) {
      return [normalized];
    }

    const cached = this.cache.get(normalized);
    if (cached && Date.now() - cached.created < 300_000) {
      return cached.ips;
    }

    const results = await Promise.allSettled([
      withTimeout(this.resolver.resolve4(normalized), 1500),
      withTimeout(this.resolver.resolve6(normalized), 1500)
    ]);
    const ips = results
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .sort((left, right) => Number(left.includes(":")) - Number(right.includes(":")));

    this.cache.set(normalized, { created: Date.now(), ips });
    return ips;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("DNS timeout")), ms))
  ]);
}

function recordBlocked(blockedHosts, host) {
  const normalized = normalizeHost(host);
  if (!normalized || blockedHosts[0] === normalized) {
    return;
  }
  blockedHosts.unshift(normalized);
  blockedHosts.splice(32);
}

function normalizeHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

function isGoogleDomain(host) {
  return /(^|\.)google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(host);
}
