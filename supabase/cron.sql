-- Run the pipeline every 3 hours. GitHub's own hourly schedule in .github/workflows/pipeline.yml only fires
-- about every 6 hours, so Supabase's pg_cron asks GitHub to start the workflow (same as its "Run workflow"
-- button). Free on Supabase's free tier; GitHub Actions minutes are free for this public repo.
-- run.py's auto mode does a full extraction when >= 2.5 h have passed, so every one of these runs is full.
--
-- One-time setup:
--   1. GitHub: Settings -> Developer settings -> Fine-grained personal access tokens -> Generate new token.
--      Repository access: only dmistry157/freeFood. Permissions: Actions = Read and write. Copy the token.
--   2. Supabase: Integrations -> Vault -> Add new secret. Name: github_pipeline_token, value: the token.
--      (In the Vault, not in this file or the SQL editor, so it never lands in query history or git.)
--   3. Supabase SQL editor: run this file. Safe to re-run (cron.schedule replaces a job with the same name).
-- When the token expires, make a new one and edit the Vault secret; nothing else changes.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('run-pipeline', '7 */3 * * *', $$
  select net.http_post(
    url := 'https://api.github.com/repos/dmistry157/freeFood/actions/workflows/pipeline.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'github_pipeline_token'),
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'freefood-pg-cron'),
    body := '{"ref": "main"}'::jsonb)
$$);

-- Check it (GitHub answers 204 when it starts a run; 401 = bad token, 403/404 = token lacks Actions access):
--   select jobname, schedule, active from cron.job;
--   select start_time, status, return_message from cron.job_run_details order by start_time desc limit 5;
--   select created, status_code, content from net._http_response order by created desc limit 5;
-- Stop it:
--   select cron.unschedule('run-pipeline');
