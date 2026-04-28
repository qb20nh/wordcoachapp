import { FiltersEngine, Request } from "@ghostery/adblocker";
import fs from "node:fs/promises";
import path from "node:path";

const FILTER_LISTS = [
  "https://ublockorigin.github.io/uAssets/filters/filters.txt",
  "https://ublockorigin.github.io/uAssets/filters/privacy.txt",
  "https://ublockorigin.github.io/uAssets/filters/unbreak.txt",
  "https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt",
  "https://ublockorigin.github.io/uAssets/thirdparties/easylist.txt",
  "https://ublockorigin.github.io/uAssets/thirdparties/easyprivacy.txt",
  "https://cdn.jsdelivr.net/npm/@list-kr/filterslists@latest/dist/filterslist-uBlockOrigin-classic.txt",
  "https://raw.githubusercontent.com/yous/YousList/master/youslist.txt"
];

const ENGINE_FILE = "engine.bin";
const METADATA_FILE = "metadata.json";
const FILTER_ENGINE_VERSION = 2;

export class AdblockService {
  constructor(baseDir) {
    this.baseDir = path.join(baseDir, "adblock");
    this.enginePath = path.join(this.baseDir, ENGINE_FILE);
    this.metadataPath = path.join(this.baseDir, METADATA_FILE);
    this.engine = null;
    this.status = {
      ready: false,
      updating: false,
      updated_at: null,
      list_count: FILTER_LISTS.length,
      error: null
    };
    this.updatePromise = null;
    this.cacheStale = false;
  }

  snapshot() {
    return { ...this.status, ready: Boolean(this.engine), list_count: FILTER_LISTS.length };
  }

  async loadCached() {
    await fs.mkdir(this.baseDir, { recursive: true });
    try {
      const [serialized, metadata] = await Promise.all([
        fs.readFile(this.enginePath),
        readJson(this.metadataPath, {})
      ]);
      if (metadata.version !== FILTER_ENGINE_VERSION || !sameUrls(metadata.urls, FILTER_LISTS)) {
        this.cacheStale = true;
      }
      this.engine = FiltersEngine.deserialize(new Uint8Array(serialized));
      this.status = {
        ready: true,
        updating: false,
        updated_at: Number(metadata.updated_at) || null,
        list_count: FILTER_LISTS.length,
        error: this.cacheStale ? "Filter cache stale; update needed" : null
      };
    } catch (error) {
      this.status.error = shortError(error);
    }
  }

  ensureReady() {
    if ((this.engine && !this.cacheStale) || this.updatePromise) {
      return this.updatePromise || Promise.resolve(this.snapshot());
    }
    return this.updateFilters();
  }

  updateFilters() {
    if (this.updatePromise) {
      return this.updatePromise;
    }
    this.updatePromise = this.fetchAndBuild()
      .catch((error) => {
        this.status = {
          ...this.status,
          ready: Boolean(this.engine),
          updating: false,
          error: shortError(error)
        };
        return this.snapshot();
      })
      .finally(() => {
        this.updatePromise = null;
      });
    return this.updatePromise;
  }

  cosmeticCss(features) {
    if (!this.engine || !features?.url) {
      return "";
    }
    const request = Request.fromRawDetails({
      url: features.url,
      type: "main_frame"
    });
    const result = this.engine.getCosmeticsFilters({
      url: request.url,
      hostname: request.hostname,
      domain: request.domain,
      classes: cleanFeatureList(features.classes),
      hrefs: cleanFeatureList(features.hrefs),
      ids: cleanFeatureList(features.ids),
      getInjectionRules: false,
      getExtendedRules: false,
      hidingStyle: "display:none!important;"
    });
    return result.styles || "";
  }

  requestBlocked(details) {
    if (!this.engine || !details?.url) {
      return false;
    }
    const result = this.engine.match(
      Request.fromRawDetails({
        requestId: String(details.id || ""),
        tabId: Number(details.webContentsId) || 0,
        url: details.url,
        sourceUrl: details.referrer || details.initiator || "",
        type: details.resourceType || "other",
        _originalRequestDetails: details
      })
    );
    return result.match === true;
  }

  async fetchAndBuild() {
    this.status = {
      ...this.status,
      updating: true,
      error: null
    };
    const results = await Promise.allSettled(FILTER_LISTS.map(fetchList));
    const lists = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    if (lists.length === 0) {
      throw new Error("All filter downloads failed");
    }
    const failures = results.length - lists.length;
    const engine = FiltersEngine.parse(lists.join("\n"));
    const updatedAt = Date.now();
    await fs.mkdir(this.baseDir, { recursive: true });
    await Promise.all([
      fs.writeFile(this.enginePath, Buffer.from(engine.serialize())),
      writeJson(this.metadataPath, {
        version: FILTER_ENGINE_VERSION,
        updated_at: updatedAt,
        list_count: FILTER_LISTS.length,
        urls: FILTER_LISTS
      })
    ]);
    this.engine = engine;
    this.cacheStale = false;
    this.status = {
      ready: true,
      updating: false,
      updated_at: updatedAt,
      list_count: FILTER_LISTS.length,
      error: failures > 0 ? `${failures} filter list(s) failed; using ${lists.length}` : null
    };
    return this.snapshot();
  }
}

async function fetchList(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WordCoachApp/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`Filter download failed ${response.status}: ${url}`);
  }
  return `! ${url}\n${await response.text()}`;
}

function sameUrls(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function cleanFeatureList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 8000);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shortError(error) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}
