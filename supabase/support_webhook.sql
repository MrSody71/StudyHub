-- ── Триггер для email-уведомлений поддержки ───────────────────────────────────
-- Запускать в Supabase Dashboard → SQL Editor ПОСЛЕ деплоя Edge Function.
-- ─────────────────────────────────────────────────────────────────────────────

-- Включить pg_net (уже включено в Supabase, на случай если нет)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Удалить старый триггер и функцию
DROP TRIGGER IF EXISTS on_support_message_created ON support_messages;
DROP FUNCTION IF EXISTS notify_support_trigger();

-- Функция-триггер
CREATE OR REPLACE FUNCTION notify_support_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url      text := 'https://pjuawdizgfwrwtbcnnfb.supabase.co';
  supabase_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWF3ZGl6Z2Z3cnd0YmNubmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjYwMDksImV4cCI6MjA5NjAwMjAwOX0.Azls7NiKv6I9yZFlIoz8WIpplgETDB8ivamVwHAJlWE';
BEGIN
  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/notify-support',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || supabase_anon_key
               ),
    body    := jsonb_build_object('record', row_to_json(NEW))::text
  );
  RETURN NEW;
END;
$$;

-- Триггер на таблице support_messages
CREATE TRIGGER on_support_message_created
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_support_trigger();
