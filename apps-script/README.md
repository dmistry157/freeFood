# Shared lists (Apps Script)

Berkeley mail can't auto-forward, and department lists like `met-2030@lists.berkeley.edu` are hidden. So
contributors share their lists from their own bmail: they open a web app, sign in, click Allow, tick lists
and Save. An hourly trigger in **their** account then sends each new email whose `List-Id` matches a ticked
list (subject, sender, date, text) to Supabase's `submit_email`. Nothing else leaves their inbox, and the map
never holds a key to it. Emails land in `raw_items` as source `gmail_shared` and go through normal extraction.

Files: `Code.gs` (the script), `Setup.html` (the page), `appsscript.json` (read-only Gmail, triggers, web
requests; web app runs as the person opening it, Berkeley accounts only).

## One-time setup (owner, ~10 min)
1. **Supabase → SQL editor:** run `supabase/schema.sql` (safe to re-run), then make a submit key:
   `insert into submit_keys values (gen_random_uuid()::text, 'apps-script') returning key;`
2. **script.google.com**, signed in with bmail → **New project** → name it `Free Food Map`.
   - Project Settings (gear) → tick **Show "appsscript.json" manifest file in editor**.
   - Editor: replace `appsscript.json` and `Code.gs` with this folder's files. **+ → HTML**, name it `Setup`,
     paste `Setup.html`. Save.
   - Project Settings → **Script Properties**: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (same values as
     the app's `EXPO_PUBLIC_*`), and `SUBMIT_KEY` from step 1.
3. **Deploy → New deployment →** type **Web app**. Execute as: **User accessing the web app**. Who has
   access: **Anyone within UC Berkeley**. Deploy and copy the URL.
4. **Test it yourself:** open the URL, Allow, tick a list, Save. The page says how many recent emails it
   sent. Check Supabase: `select source_id, left(text, 80) from raw_items where source = 'gmail_shared';`
5. **Test with one friend.** What we can't check alone: that the hourly trigger keeps running for someone
   who isn't the script's owner. After they Save, new emails from their lists should keep arriving.

Nothing here needs the PR merged: the pipeline already reads every row in `raw_items`, so you can do all of
the above before merging. For a quick look first, Deploy → **Test deployments** gives an owner-only URL that
runs the latest saved code.

## Keys and privacy
- **Supabase secret key:** not used here at all.
- **Publishable key:** public by design (the app and website ship it).
- **Submit key:** only in Script Properties, which only the project's editors (you) can see. Contributors
  only get the web app: they can't see the code or properties, and the page can only call `doGet`, `status`,
  `save` and `sync` (the `_` helpers are private); none of them return it. If it ever leaks, the worst case
  is junk rows using Gemini quota: delete its row in `submit_keys`, make a new key, update the property.
- **Contributors' mail:** no tokens are stored anywhere; the script runs as them with read-only Gmail, and
  only emails whose `List-Id` exactly matches a ticked list are sent. Their choices live in their own user
  properties, which you can't read. Error logs hold status codes, never email content.
- **Trust:** an editor of this project could change what it sends, so don't give anyone else edit access.

## For contributors
Send the URL: "Open this, sign in with your berkeley.edu account, click Allow, tick your department's
lists, Save." Google's permission screen asks to read their email (only ticked lists are ever sent), run
while they're away (the hourly check) and connect to an outside service (the map's database). If Google
shows "this app isn't verified", it's Advanced → Go to Free Food Map. To stop: open the URL, Stop sharing.

## Changing the script
Edit it in the Apps Script editor (keep this folder in sync), then Deploy → Manage deployments → edit →
Version: **New version**, so the page picks it up. Hourly triggers run the latest saved code.
