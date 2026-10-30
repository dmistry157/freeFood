/**
 * Free Food Map: share a few mailing lists with the map, straight from your own bmail.
 *
 * Deployed as a web app that runs as whoever opens it. They tick which mailing lists to share; an hourly
 * trigger in their account then sends each new email whose List-Id matches a ticked list (subject, sender,
 * date, text) to Supabase's submit_email. Nothing else leaves their account. Setup: README.md.
 * Functions ending in _ are private: the page (google.script.run) can only call doGet, status, save, sync.
 */
const LOOKBACK = 'newer_than:2d';
const SCAN = 100;        // messages checked per search on the setup page
const MAX_LISTS = 20;
const MAX_TEXT = 20000;
const KEEP_SENT = 200;   // message ids remembered so an email isn't sent twice
// Berkeley lists with emails matching this in the last month are recommended (pre-ticked on the first visit).
const FOOD_Q = '(food OR pizza OR lunch OR dinner OR breakfast OR brunch OR snacks OR refreshments OR boba OR ' +
               'catered OR dessert OR "ice cream" OR cookies OR donuts OR bagels OR tacos OR bbq)';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Setup')
    .setTitle('Free Food Map: share your lists')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * For the setup page: the lists already shared, and every mailing list seen in the last month with a name,
 * a recent subject and counts. Recommended (Berkeley lists that mentioned food) first.
 */
function status() {
  const lists = {}, done = new Set();
  for (const [q, food] of [[`newer_than:30d -in:sent ${FOOD_Q}`, true], ['newer_than:30d -in:sent', false]]) {
    for (const m of Gmail.Users.Messages.list('me', { q, maxResults: SCAN }).messages || []) {
      if (done.has(m.id)) continue;
      done.add(m.id);
      const msg = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['List-Id', 'Subject'] });
      const raw = header_(msg, 'List-Id'), id = listId_(raw);
      if (!id) continue;
      const l = lists[id] = lists[id] || { id, name: listName_(raw, id), sample: header_(msg, 'Subject'), emails: 0, food: 0 };
      l.emails++;
      if (food) l.food++;
    }
  }
  const all = Object.values(lists).map(l => ({ ...l, recommended: l.food > 0 && /\.berkeley\.edu$/.test(l.id) }));
  all.sort((a, b) => b.recommended - a.recommended || b.food - a.food || b.emails - a.emails);
  return { shared: sharedLists_(), lists: all };
}

/** Save the ticked lists, (re)create this person's hourly trigger, and share the last 2 days right away. */
function save(lists) {
  lists = [...new Set((lists || []).map(listId_).filter(Boolean))].slice(0, MAX_LISTS);
  PropertiesService.getUserProperties().setProperty('lists', JSON.stringify(lists));
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  if (!lists.length) return 0;
  ScriptApp.newTrigger('sync').timeBased().everyHours(1).create();
  return sync();
}

/** Hourly: send new emails from the shared lists to the map. Returns how many were sent. */
function sync() {
  const lists = sharedLists_();
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
      if (!lists.includes(listId_(header_(msg, 'List-Id')))) continue;  // only exact matches ever leave the account
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
  } finally {
    user.setProperty('sent', JSON.stringify(sent.slice(-KEEP_SENT)));
  }
  return count;
}

function sharedLists_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty('lists') || '[]');
}

function header_(msg, name) {
  const h = (msg.payload.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

/** "MET 2030 <met-2030.lists.berkeley.edu>" or "met-2030@lists.berkeley.edu" -> "met-2030.lists.berkeley.edu" */
function listId_(value) {
  const m = /<([^>]+)>/.exec(value || '');
  const id = (m ? m[1] : value || '').trim().toLowerCase().replace('@', '.');
  return /^[a-z0-9][a-z0-9._-]*\.[a-z]{2,}$/.test(id) ? id : '';
}

/** '"MET 2030" <met-2030.lists.berkeley.edu>' -> 'MET 2030'; '<met-2030.lists.berkeley.edu>' -> 'met-2030' */
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
