/**
 * Free Food Map: share a few mailing lists with the map, straight from your own bmail.
 *
 * Deployed as a web app that runs as whoever opens it. They tick which mailing lists to share; an hourly
 * trigger in their account then sends each new email whose List-Id matches a ticked list (subject, sender,
 * date, text) to Supabase's submit_email. Nothing else leaves their account. Setup: README.md.
 * Submit and Stop reload the page (a form back to doGet) rather than use google.script.run, which fails with
 * "HTTP 401" for people signed into more than one Google account. Functions ending in _ are private.
 */
const LOOKBACK = 'newer_than:2d';
const SCAN = 50;         // messages checked per search on the setup page (Gmail caps API calls per minute)
const CACHE_S = 600;     // the setup page's scan is reused for 10 minutes, so reloading doesn't rescan
const MAX_LISTS = 20;
const MAX_TEXT = 20000;
const KEEP_SENT = 200;   // message ids remembered so an email isn't sent twice
// Lists with emails matching this in the last month are recommended (pre-ticked on the first visit) if they're
// Berkeley lists or sent from a berkeley.edu address (department newsletters often go out via Mailchimp etc.).
const BERKELEY = /@(?:[\w-]+\.)*berkeley\.edu\b/i;
const REPLY = /^\s*re\s*(\[\d+\])?\s*:/i;  // "Re: ..." replies are never sent
const FOOD_Q = '(food OR pizza OR lunch OR dinner OR breakfast OR brunch OR snacks OR refreshments OR boba OR ' +
               'catered OR dessert OR "ice cream" OR cookies OR donuts OR bagels OR tacos OR bbq)';

/** The setup page; Submit (?mode=save&list=…&extra=…) and Stop (?mode=stop) come back here. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  let note = '', error = '';
  if (p.mode === 'stop') {
    saveLists_([]);
    note = 'Stopped. Nothing more will be shared.';
  } else if (p.mode === 'save') {
    const lists = normalize_([].concat((e.parameters && e.parameters.list) || [], p.extra || []));
    if (!lists.length) {
      error = 'Tick at least one list, or use Stop sharing.';
    } else {
      saveLists_(lists);
      try {
        note = `Done: sharing ${plural_(lists.length, 'list')}. ${plural_(sync(), 'recent email')} sent; new ones go every hour on their own.`;
      } catch (err) {
        error = `Submitted your ${plural_(lists.length, 'list')}, but sending failed (${err.message}). It retries every hour.`;
      }
    }
  }
  const t = HtmlService.createTemplateFromFile('Setup');
  t.data = JSON.stringify({ ...status_(), note, error, url: ScriptApp.getService().getUrl() })
    .replace(/</g, '\\u003c');  // safe inside <script> even if an email subject contains "</script>"
  return t.evaluate()
    .setTitle('Free Food Map: share your lists')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * For the setup page: the lists already shared, and every mailing list seen in the last month with a name,
 * a recent subject and counts. Recommended (Berkeley lists or senders that mentioned food) first. partial: Gmail's
 * per-minute limit cut the scan short, so the page suggests reloading in a minute.
 */
function status_() {
  const cache = CacheService.getUserCache();
  const hit = cache.get('scan');
  const scan = hit ? JSON.parse(hit) : scan_();
  if (!hit && !scan.partial) cache.put('scan', JSON.stringify(scan), CACHE_S);
  return { shared: sharedLists_(), ...scan };
}

function scan_() {
  const lists = {}, done = new Set();
  let partial = false;
  try {
    for (const [q, food] of [[`newer_than:30d -in:sent ${FOOD_Q}`, true], ['newer_than:30d -in:sent', false]]) {
      for (const m of Gmail.Users.Messages.list('me', { q, maxResults: SCAN }).messages || []) {
        if (done.has(m.id)) continue;
        done.add(m.id);
        const msg = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['List-Id', 'Subject', 'From'] });
        const raw = header_(msg, 'List-Id'), id = listId_(raw);
        if (!id) continue;
        const l = lists[id] = lists[id] || { id, name: listName_(raw, id), sample: header_(msg, 'Subject'), emails: 0, food: 0 };
        l.emails++;
        if (food) l.food++;
        if (BERKELEY.test(header_(msg, 'From'))) l.berkeley = true;
      }
    }
  } catch (e) {
    if (!isQuota_(e)) throw e;
    partial = true;  // show what we found so far
  }
  const all = Object.values(lists).map(l => ({ ...l, recommended: l.food > 0 && (l.berkeley || /\.berkeley\.edu$/.test(l.id)) }));
  all.sort((a, b) => b.recommended - a.recommended || b.food - a.food || b.emails - a.emails);
  return { lists: all, partial };
}

function normalize_(lists) {
  return [...new Set(lists.map(listId_).filter(Boolean))].slice(0, MAX_LISTS);
}

/** Store this person's lists and (re)create their hourly trigger; no lists = stop sharing. */
function saveLists_(lists) {
  PropertiesService.getUserProperties().setProperty('lists', JSON.stringify(lists));
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  if (lists.length) ScriptApp.newTrigger('sync').timeBased().everyHours(1).create();
}

function plural_(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Hourly: send new emails from the shared lists to the map. Returns how many were sent. */
function sync() {
  const lists = sharedLists_();
  if (!lists.length) return 0;
  const cfg = config_();
  const user = PropertiesService.getUserProperties();
  const sent = JSON.parse(user.getProperty('sent') || '[]');
  const q = `(${lists.map(l => 'list:' + l).join(' OR ')}) ${LOOKBACK}`;
  let count = 0;
  try {
    for (const m of Gmail.Users.Messages.list('me', { q, maxResults: 50 }).messages || []) {
      if (sent.includes(m.id)) continue;
      const msg = Gmail.Users.Messages.get('me', m.id, { format: 'full' });
      if (!lists.includes(listId_(header_(msg, 'List-Id')))) continue;  // only exact matches ever leave the account
      if (REPLY.test(header_(msg, 'Subject'))) {  // a discussion on the list, not an announcement: keep it private
        sent.push(m.id);
        continue;
      }
      const resp = UrlFetchApp.fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/submit_email`, {
        method: 'post',
        contentType: 'application/json',
        headers: { apikey: cfg.SUPABASE_PUBLISHABLE_KEY },
        payload: JSON.stringify({
          p_key: cfg.SUBMIT_KEY,
          p_id: header_(msg, 'Message-ID') || m.id,  // same for everyone on the list, so it's stored once
          p_text: toText_(msg),
          p_posted_at: new Date(Number(msg.internalDate)).toISOString(),
        }),
        muteHttpExceptions: true,
      });
      if (resp.getResponseCode() !== 200) {
        throw new Error(`submit_email ${resp.getResponseCode()}: ${resp.getContentText().slice(0, 300)}`);
      }
      sent.push(m.id);
      count++;
    }
  } catch (e) {
    if (!isQuota_(e)) throw e;  // Gmail's per-minute limit: the rest goes next hour
  } finally {
    user.setProperty('sent', JSON.stringify(sent.slice(-KEEP_SENT)));
  }
  return count;
}

/** Script Properties (README step 2), trimmed; names a missing one instead of failing with "Header:null". */
function config_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const cfg = {}, missing = [];
  for (const k of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUBMIT_KEY']) {
    cfg[k] = String(all[k] || '').trim();
    if (!cfg[k]) missing.push(k);
  }
  if (missing.length) {
    throw new Error(`setup incomplete: Script Properties is missing ${missing.join(', ')}` +
                    (Object.keys(all).length ? ` (it has ${Object.keys(all).join(', ')})` : ''));
  }
  cfg.SUPABASE_URL = cfg.SUPABASE_URL.replace(/\/+$/, '');
  return cfg;
}

function isQuota_(e) {
  return /quota exceeded|rate limit|too many/i.test(String(e && e.message || e));
}

function sharedLists_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty('lists') || '[]');
}

function header_(msg, name) {
  const h = (msg.payload.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

/** "EECS Undergrad <eecs-ugrad.lists.berkeley.edu>" or "eecs-ugrad@lists.berkeley.edu" -> "eecs-ugrad.lists.berkeley.edu" */
function listId_(value) {
  const m = /<([^>]+)>/.exec(value || '');
  const id = (m ? m[1] : value || '').trim().toLowerCase().replace('@', '.');
  return /^[a-z0-9][a-z0-9._-]*\.[a-z]{2,}$/.test(id) ? id : '';
}

/** '"EECS Undergrad" <eecs-ugrad.lists.berkeley.edu>' -> 'EECS Undergrad'; '<eecs-ugrad.lists...>' -> 'eecs-ugrad' */
function listName_(value, id) {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(value || '');
  return m ? m[1].trim() : id.split('.')[0];
}

/** Same layout as pipeline/sources/gmail.py, so extraction treats both alike. */
function toText_(msg) {
  const plain = [], html = [];
  (function walk(p) {
    const data = p.body && p.body.data;
    if (data && p.mimeType === 'text/plain') plain.push(decode_(data));
    else if (data && p.mimeType === 'text/html') html.push(decode_(data));
    (p.parts || []).forEach(walk);
  })(msg.payload);
  return [
    `Subject: ${header_(msg, 'Subject')}`,
    `From: ${header_(msg, 'From')}`,
    `Date: ${header_(msg, 'Date')}`,
    `List: ${header_(msg, 'List-Id')}`,
    '',
    (plain.join('\n') || stripHtml_(html.join('\n'))).trim(),
  ].join('\n').slice(0, MAX_TEXT);
}

// The advanced Gmail service usually returns body data as bytes, sometimes as a base64url string.
function decode_(data) {
  const bytes = typeof data === 'string' ? Utilities.base64DecodeWebSafe(data) : data;
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

function stripHtml_(html) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n');
}
