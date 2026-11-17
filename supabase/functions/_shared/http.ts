export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-telegram-bot-api-secret-token',
};

export function json(data: unknown, status = 200, cors = true) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors ? corsHeaders : {}) },
  });
}

export function options() {
  return new Response('ok', { headers: corsHeaders });
}
