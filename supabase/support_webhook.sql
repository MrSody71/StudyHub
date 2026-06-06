-- ── Триггер для email-уведомлений поддержки ───────────────────────────────────
-- Запускать в Supabase Dashboard → SQL Editor ПОСЛЕ деплоя Edge Function.
-- ─────────────────────────────────────────────────────────────────────────────

-- Включить pg_net (уже включено в Supabase, на случай если нет)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Функция-триггер
CREATE OR REPLACE FUNCTION notify_support_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://pjuawdizgfwrwtbcnnfb.supabase.co/functions/v1/notify-support',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWF3ZGl6Z2Z3cnd0YmNubmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjYwMDksImV4cCI6MjA5NjAwMjAwOX0.Azls7NiKv6I9yZFlIoz8WIpplgETDB8ivamVwHAJlWE'
               ),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$;

-- Триггер на таблице support_messages
DROP TRIGGER IF EXISTS on_support_message_created ON support_messages;
CREATE TRIGGER on_support_message_created
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_support_trigger();
