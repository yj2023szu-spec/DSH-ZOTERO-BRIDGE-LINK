/* global Zotero, Services, Components, ChromeUtils */

var ZoteroLink;
var bootLogFilePath = null;

function joinPath(dir, name) {
  try {
    if (typeof PathUtils !== "undefined" && PathUtils.join) {
      return PathUtils.join(dir, name);
    }
  } catch (e) {
    /* fall through */
  }
  var base = String(dir || "").replace(/[\\/]+$/, "");
  var separator = base.indexOf("\\") !== -1 ? "\\" : "/";
  return base + separator + name;
}

function bootLogPath() {
  if (bootLogFilePath) return bootLogFilePath;
  try {
    if (Zotero.Profile && Zotero.Profile.dir) {
      bootLogFilePath = joinPath(Zotero.Profile.dir, "zoterolink-boot.log");
      return bootLogFilePath;
    }
  } catch (e) {
    /* ignore */
  }
  try {
    if (Zotero.DataDirectory && Zotero.DataDirectory.dir) {
      bootLogFilePath = joinPath(Zotero.DataDirectory.dir, "zoterolink-boot.log");
      return bootLogFilePath;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

async function bootLog(message) {
  var line = "[" + new Date().toISOString() + "] " + message + "\n";
  var path = bootLogPath();
  if (!path) return;
  var io = null;
  try {
    if (typeof IOUtils !== "undefined") io = IOUtils;
  } catch (e) {
    io = null;
  }
  if (!io) {
    try {
      io = ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs").IOUtils;
    } catch (e) {
      io = null;
    }
  }
  if (io && io.writeUTF8) {
    try {
      var previous = "";
      try {
        previous = await io.readUTF8(path);
      } catch (e) {
        previous = "";
      }
      await io.writeUTF8(path, previous + line);
      return;
    } catch (e) {
      /* fall through */
    }
  }
  try {
    if (Zotero.File && Zotero.File.putContentsAsync) {
      await Zotero.File.putContentsAsync(path, line, "utf-8");
    }
  } catch (e) {
    /* give up */
  }
}

function log(message) {
  try {
    Zotero.debug("[zotero-link] " + message);
  } catch (e) {
    /* ignore */
  }
}

function install() {
  log("install");
}

function uninstall() {
  log("uninstall");
}

async function startup({ id, version, rootURI }) {
  await bootLog("startup begin version=" + version + " rootURI=" + rootURI);
  try {
    // Do not await Zotero.initializationPromise here: Plugins.init() runs before
    // that promise resolves, so awaiting it would deadlock plugin startup.
    await bootLog("not waiting for initializationPromise (plugin init runs before it)");
    await bootLog("loading content/zoterolink.js");
    var loaded = false;
    var loadError = null;
    try {
      Services.scriptloader.loadSubScript(rootURI + "content/zoterolink.js");
      loaded = true;
    } catch (e) {
      loadError = e;
      await bootLog("plain loadSubScript failed: " + e + " | " + (e && e.stack));
    }
    if (!loaded) {
      try {
        Services.scriptloader.loadSubScriptWithOptions(rootURI + "content/zoterolink.js", { charset: "utf-8" });
        loaded = true;
      } catch (e) {
        loadError = e;
        await bootLog("loadSubScriptWithOptions failed: " + e + " | " + (e && e.stack));
      }
    }
    await bootLog(
      "script loaded=" + loaded + " typeofZoteroLink=" + typeof ZoteroLink + " namespaced=" + (Zotero.ZoteroLink ? "yes" : "no") + (loadError ? " lastError=" + loadError : "")
    );
    var api = ZoteroLink || Zotero.ZoteroLink;
    if (!api) {
      throw new Error("zoterolink.js did not publish ZoteroLink");
    }
    Zotero.ZoteroLink = api;
    ZoteroLink = api;
    await bootLog("calling api.startup");
    await api.startup({ rootURI, version, id });
    await bootLog("api.startup finished");
  } catch (e) {
    await bootLog("startup failed: " + e + " | " + (e && e.stack));
    log("startup failed: " + e + "\n" + (e && e.stack));
  }
}

function shutdown(data, reason) {
  try {
    var api = ZoteroLink || Zotero.ZoteroLink;
    if (api) {
      api.shutdown(reason);
    }
    delete Zotero.ZoteroLink;
  } catch (e) {
    log("shutdown failed: " + e);
  }
  ZoteroLink = undefined;
}
