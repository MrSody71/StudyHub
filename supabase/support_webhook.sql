-- ── Database Webhook trigger for support email notifications ─────────────────
--
-- ВАЖНО: Этот скрипт НЕ создаёт webhook напрямую — Database Webhooks
-- в Supabase настраиваются только через Dashboard (UI) или Management API.
-- Воспользуйтесь инструкцией ниже, чтобы настроить webhook вручную.
--
-- ── Вместо этого скрипт создаёт HTTP-обёртку, если вы хотите вызвать
--    Edge Function из обычного триггера PostgreSQL через pg_net (расширение,
--    включённое в Supabase по умолчанию). Это альтернативный способ.
-- ─────────────────────────────────────────────────────────────────────────────

-- Включить расширение pg_net (уже включено в Supabase, но на всякий случай)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Функция-триггер, вызывающая Edge Function через HTTP
CREATE OR REPLACE FUNCTION notify_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url  text;
  _body jsonb;
BEGIN
  _url := current_setting('app.supabase_url', true) || '/functions/v1/notify-support';

  _body := jsonb_build_object(
    'type',       'INSERT',
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     row_to_json(NEW),
    'old_record', NULL
  );

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := _body
  );

  RETURN NEW;
END;
$$;

-- Триггер на таблице support_messages
DROP TRIGGER IF EXISTS support_message_notify ON support_messages;
CREATE TRIGGER support_message_notify
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_support_message();

-- ── Настройка URL и ключа ─────────────────────────────────────────────────────
-- Выполните эти команды один раз, подставив свои значения.
-- Их нужно запустить в том же сеансе или добавить в postgresql.conf
-- через ALTER DATABASE:
--
--   ALTER DATABASE postgres
--     SET app.supabase_url = 'https://ТВОЙ_ПРОЕКТ.supabase.co';
--
--   ALTER DATABASE postgres
--     SET app.service_role_key = 'ТВОЙ_SERVICE_ROLE_KEY';
--
-- Service Role Key: Supabase Dashboard → Project Settings → API → service_role
-- ─────────────────────────────────────────────────────────────────────────────
