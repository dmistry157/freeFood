-- Shared-lists admin: paste each block into the Supabase SQL editor and save it as a favorite (the star),
-- so reviewing is one click. They read with the dashboard's own access; nothing here is exposed to the app.

-- 1. Health check: every row should look right (see the expected column).
select 'submit_email takes 6 arguments' as check_, exists (select 1 from pg_proc where proname = 'submit_email' and pronargs = 6)::text as value, 'true' as expected
union all select 'old 4-argument submit_email gone', (not exists (select 1 from pg_proc where proname = 'submit_email' and pronargs = 4))::text, 'true'
union all select 'approval trigger on shared_lists', exists (select 1 from pg_trigger where tgname = 'shared_lists_release')::text, 'true'
union all select 'row-level security on private tables', (select bool_and(relrowsecurity) from pg_class
  where relname in ('submit_keys', 'shared_lists', 'held_emails', 'blocked_contributors', 'raw_items'))::text, 'true'
union all select 'submit keys', (select count(*) from submit_keys)::text, '1 or more'
union all select 'lists by status', (select coalesce(string_agg(status || ': ' || n, ', '), 'none yet') from
  (select status::text, count(*) n from shared_lists group by 1 order by 1) s), 'approve the pending ones'
union all select 'emails held (lists pending)', (select count(*) from held_emails)::text, 'goes to 0 as you approve'
union all select 'shared emails stored, last 24 h', (select count(*) from raw_items
  where source = 'gmail_shared' and fetched_at > now() - interval '1 day')::text, 'grows hourly once lists are approved'
union all select 'newest shared email has a contributor', coalesce((select (contributor is not null)::text from (
  select contributor, fetched_at as t from raw_items where source = 'gmail_shared'
  union all select contributor, held_at from held_emails) x order by t desc limit 1), 'no emails yet'),
  'true (the new Code.gs sends it)';

-- 2. Review lists: pending first, with who shared them and how many emails are waiting.
select l.status, l.list_id, l.sample as latest_subject, array_to_string(l.shared_by, ', ') as shared_by,
       (select count(*) from held_emails h where h.list_id = l.list_id) as held, l.last_seen
from shared_lists l
order by l.status = 'pending' desc, l.last_seen desc;

-- 3. Approve or block lists (or use the status dropdown in Table Editor -> shared_lists).
-- update shared_lists set status = 'approved' where list_id in ('met-2030.lists.berkeley.edu');
-- update shared_lists set status = 'blocked'  where list_id in ('berkeleyeventsnetwork.lists.berkeley.edu');

-- 4. Who's sharing (emails in the last 14 days, held and stored), and who's blocked.
select contributor, count(*) as emails, max(t) as last_shared,
       exists (select 1 from blocked_contributors b where b.email = x.contributor) as blocked
from (select contributor, fetched_at as t from raw_items where source = 'gmail_shared' and contributor is not null
      union all select contributor, held_at from held_emails) x
group by contributor order by last_shared desc;

-- 5. Block a person and remove what they shared (then delete any fake event from events by title).
-- insert into blocked_contributors values ('someone@berkeley.edu', 'why');
-- delete from held_emails where contributor = 'someone@berkeley.edu';
-- delete from raw_items where source = 'gmail_shared' and contributor = 'someone@berkeley.edu';
-- Unblock: delete from blocked_contributors where email = 'someone@berkeley.edu';
