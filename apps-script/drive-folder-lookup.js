// 70mai Overnight Monitor — Google Drive folder links (Google Apps Script)
//
// Runs inside YOUR Google account (script.google.com) and answers one question:
// "which Google Drive folder is  70mai Overnight / <night> / <serial> ?"
// The monitor page asks it when a fault happens, so the Lark message can carry the
// folder's own drive.google.com link. The same address also works as a normal link:
// opened in a browser, it shows a one-click page that opens that folder. (Google runs
// web-app pages inside a frame that may only leave on a click, so no automatic redirect.)
//
// Setup: https://anwar-dasher.github.io/70mai-monitor/apps-script/
//   1. script.google.com → New project → replace the sample with this file → Save.
//   2. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy.
//   3. Copy the Web app URL (ends in /exec) and open the monitor once with ?gdrive=<that URL>.
//
// It only ever returns folder IDs. A folder ID gives nobody access to the files —
// opening the folder still needs the viewer's own Google Drive permission.

var ROOT_FOLDER_NAME = '70mai Overnight';
var ROOT_FOLDER_ID = ''; // optional: the folder's ID (from its Drive address) if you have several folders with that name

var NIGHT_RE = /^night_\d{4}-\d{2}-\d{2}_\d{4}$/;
var SERIAL_RE = /^[A-Za-z0-9_-]{3,60}$/;
var CACHE_SECS = 6 * 3600; // a folder keeps its ID for life, so remembering it is safe

// Web app entry point.  ?night=…&serial=…          → one-click page to that unit's folder
//                       ?night=…&serial=…&json=1   → {ok, night, unit} for the monitor page
//                       (no parameters)             → status page, to check the setup works
function doGet(e) {
  var p = (e && e.parameter) || {};
  var night = String(p.night || '');
  var serial = String(p.serial || '');
  var asJson = String(p.json || '') === '1';

  if (!night && !serial) return statusPage();

  if (!NIGHT_RE.test(night) || (serial && !SERIAL_RE.test(serial))) {
    return asJson ? json({ ok: false, error: 'bad night or serial' })
                  : page('Bad link', '<p>This link is missing the night or the serial number.</p>');
  }

  var found;
  try {
    found = lookup(night, serial);
  } catch (err) {
    var msg = String(err && err.message || err);
    // The JSON goes to anyone who calls the address: a coded reason, not Drive's own message
    return asJson ? json({ ok: false, error: /No folder named/.test(msg) ? 'root-folder-missing' : 'lookup-failed' })
                  : page('Could not search Google Drive', '<p>' + esc(msg) + '</p>');
  }

  if (asJson) return json({ ok: true, night: found.night, unit: found.unit });

  // Clicked link: open the most specific folder that already exists in Drive
  if (found.unit) return openPage(found.unit.url, serial);
  if (!serial && found.night) return openPage(found.night.url, night);
  if (found.night) {
    return page(serial + ' — folder not in Google Drive yet',
      '<p>The folder for this unit is created on the bench laptop when monitoring starts and reaches ' +
      'Google Drive a few minutes later, once the laptop has uploaded it. Try again shortly.</p>' +
      '<p><a href="' + esc(found.night.url) + '" target="_top">Open the night folder ' + esc(night) + '</a></p>');
  }
  return page(night + ' — not in Google Drive yet',
    '<p>This night has not reached Google Drive yet. Check that Google Drive for desktop is running ' +
    'and signed in on the bench laptop.</p>' +
    '<p><a href="' + esc(found.root.url) + '" target="_top">Open ' + esc(ROOT_FOLDER_NAME) + '</a></p>');
}

// --- Drive lookups -----------------------------------------------------------------

function lookup(night, serial) {
  var cache = CacheService.getScriptCache();
  var root = rootFolder(cache);
  var nightFolder = childFolder(root, night, cache, 'n:' + night);
  var unitFolder = (nightFolder && serial) ? childFolder(nightFolder, serial, cache, 'u:' + night + '/' + serial) : null;
  return { root: info(root), night: info(nightFolder), unit: info(unitFolder) };
}

function rootFolder(cache) {
  if (ROOT_FOLDER_ID) return DriveApp.getFolderById(ROOT_FOLDER_ID);
  var id = cache.get('root');
  if (id) {
    try {
      var cached = DriveApp.getFolderById(id);
      if (!cached.isTrashed()) return cached;
    } catch (e) { /* gone since it was cached: search again */ }
  }
  // Prefer a folder directly in My Drive; fall back to anywhere this account can see
  var it = DriveApp.getRootFolder().getFoldersByName(ROOT_FOLDER_NAME);
  if (!it.hasNext()) it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (!it.hasNext()) throw new Error('No folder named "' + ROOT_FOLDER_NAME + '" in this Google Drive');
  var root = it.next();
  cache.put('root', root.getId(), CACHE_SECS);
  return root;
}

function childFolder(parent, name, cache, key) {
  var id = cache.get(key);
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* removed since it was cached: search again */ }
  }
  var it = parent.getFoldersByName(name);
  while (it.hasNext()) {
    var c = it.next();
    if (c.isTrashed()) continue;
    cache.put(key, c.getId(), CACHE_SECS);
    return c;
  }
  return null;
}

function info(f) {
  return f ? { id: f.getId(), name: f.getName(), url: 'https://drive.google.com/drive/folders/' + f.getId() } : null;
}

// --- Responses ---------------------------------------------------------------------

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function openPage(url, label) {
  // Google shows web-app pages inside a frame that may only navigate the browser on a
  // click (allow-top-navigation-by-user-activation), so there is no automatic redirect:
  // this is a one-click page. target="_top" takes the whole tab to Drive.
  var html = shell('Open ' + label,
    '<p>Google Drive folder for <b>' + esc(label) + '</b></p>' +
    '<p><a href="' + esc(url) + '" target="_top" autofocus style="display:inline-block;background:#2563eb;color:#fff;' +
    'text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Open in Google Drive</a></p>');
  return HtmlService.createHtmlOutput(html).setTitle('Open ' + label);
}

function page(title, body) {
  return HtmlService.createHtmlOutput(shell(title, '<h2>' + esc(title) + '</h2>' + body)).setTitle(title);
}

function statusPage() {
  var body;
  try {
    var root = rootFolder(CacheService.getScriptCache());
    body = '<h2>70mai Drive links — working</h2>' +
      '<p>Folder: <a href="https://drive.google.com/drive/folders/' + esc(root.getId()) + '" target="_top">' + esc(root.getName()) + '</a></p>' +
      '<p>Next: open the monitor once with <code>?gdrive=</code> followed by this page\'s address, ' +
      'as described on the setup page.</p>';
  } catch (err) {
    body = '<h2>70mai Drive links — not working yet</h2><p>' + esc(String(err && err.message || err)) + '</p>' +
      '<p>Create a folder named <b>' + esc(ROOT_FOLDER_NAME) + '</b> in My Drive (or set ROOT_FOLDER_ID in the script).</p>';
  }
  return HtmlService.createHtmlOutput(shell('70mai Drive links', body)).setTitle('70mai Drive links');
}

function shell(title, body) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base target="_top"><title>' + esc(title) + '</title></head>' +
    '<body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#1f2937">' +
    body + '</body></html>';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
