/**
 * Free Food Map: share a few mailing lists with the map, straight from your own bmail.
 *
 * Deployed as a web app that runs as whoever opens it. They tick which mailing lists to share; an hourly
 * trigger in their account then sends each new email whose List-Id matches a ticked list (subject, sender,
 * date, text) to Supabase's submit_email. Nothing else leaves their account. Setup: README.md.
 */
const LOOKBACK = 'newer_than:2d';
const SCAN = 100;        // recent messages checked for mailing lists on the setup page
const MAX_LISTS = 20;
const MAX_TEXT = 20000;
const KEEP_SENT = 200;   // message ids remembered so an email isn't sent twice

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Setup')
    .setTitle('Free Food Map: share your lists')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** For the setup page: lists already shared, and mailing lists in the last month of mail (most frequent first). */
function status() {
  const counts = {};
  const res = Gmail.Users.Messages.list('me', { q: 'newer_than:30d -in:sent', maxResults: SCAN });
  for (const m of res.messages || []) {
    const msg = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['List-Id'] });
    const id = listId(header(msg, 'List-Id'));
    if (id) counts[id] = (counts[id] || 0) + 1;
  }
  return { shared: sharedLists(), seen: Object.keys(counts).sort((a, b) => counts[b] - counts[a]) };
}

/** Save the ticked lists, (re)create this person's hourly trigger, and share the last 2 days right away. */
function save(lists) {
  lists = [...new Set((lists || []).map(listId).filter(Boolean))].slice(0, MAX_LISTS);
  PropertiesService.getUserProperties().setProperty('lists', JSON.stringify(lists));
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  if (!lists.length) return 0;
  ScriptApp.newTrigger('sync').timeBased().everyHours(1).create();
  return sync();
}

/** Hourly: send new emails from the shared lists to the map. Returns how many were sent. */
function sync() {
  const lists = sharedLists();
  if (!lists.length) return 0;
  const cfg = PropertiesService.getScriptProperties().getProperties();
  const user = PropertiesService.getUserProperties();
  const sent = JSON.parse(user.getProperty('sent') || '[]');
  const q = `(${lists.map(l => 'list:' + l).join(' OR ')}) ${LOOKBACK}`;
  let count = 0;
  try {
    for (const m of Gmail.Users.Messages.list('me', { q, maxResults: 50 }).messages || []) {
      if (sent.includes(m.id)) continue;
      const msg = Gmail.Users.Messages.get('me', m.id, { format: 'full' });
      if (!lists.includes(listId(header(msg, 'List-Id')))) continue;  // only exact matches ever leave the account
      const resp = UrlFetchApp.fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/submit_email`, {
        method: 'post',
        contentType: 'application/json',
        headers: { apikey: cfg.SUPABASE_PUBLISHABLE_KEY },
        payload: JSON.stringify({
          p_key: cfg.SUBMIT_KEY,
          p_id: header(msg, 'Message-ID') || m.id,  // same for everyone on the list, so it's stored once
          p_text: toText(msg),
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
  } finally {
    user.setProperty('sent', JSON.stringify(sent.slice(-KEEP_SENT)));
  }
  return count;
}

function sharedLists() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty('lists') || '[]');
}

function header(msg, name) {
  const h = (msg.payload.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

/** "MET 2030 <met-2030.lists.berkeley.edu>" or "met-2030@lists.berkeley.edu" -> "met-2030.lists.berkeley.edu" */
function listId(value) {
  const m = /<([^>]+)>/.exec(value || '');
  const id = (m ? m[1] : value || '').trim().toLowerCase().replace('@', '.');
  return /^[a-z0-9][a-z0-9._-]*\.[a-z]{2,}$/.test(id) ? id : '';
}

/** Same layout as pipeline/sources/gmail.py, so extraction treats both alike. */
function toText(msg) {
  const plain = [], html = [];
  (function walk(p) {
    const data = p.body && p.body.data;
    if (data && p.mimeType === 'text/plain') plain.push(decode(data));
    else if (data && p.mimeType === 'text/html') html.push(decode(data));
    (p.parts || []).forEach(walk);
  })(msg.payload);
  return [
    `Subject: ${header(msg, 'Subject')}`,
    `From: ${header(msg, 'From')}`,
    `Date: ${header(msg, 'Date')}`,
    `List: ${header(msg, 'List-Id')}`,
    '',
    (plain.join('\n') || stripHtml(html.join('\n'))).trim(),
  ].join('\n').slice(0, MAX_TEXT);
}

// The advanced Gmail service usually returns body data as bytes, sometimes as a base64url string.
function decode(data) {
  const bytes = typeof data === 'string' ? Utilities.base64DecodeWebSafe(data) : data;
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

function stripHtml(html) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n');
}
