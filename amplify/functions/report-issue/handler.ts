import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { supabaseAdmin } from '../_shared/supabaseAdmin.js';
import { verifySupabaseAuth } from '../_shared/verifySupabaseAuth.js';

interface ReportRequest {
  message?: string;
  category?: string;
  context?: Record<string, unknown>;
}

export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuth(event);
  enforceRateLimit(`report:${user.id}`, 5, 10 * 60_000);

  const { message, category, context } = parseBody<ReportRequest>(event);
  const trimmed = message?.trim();
  if (!trimmed) throw new HttpError(400, 'message is required');
  if (trimmed.length > 5000) throw new HttpError(400, 'message is too long');

  const { error } = await supabaseAdmin().from('issue_reports').insert({
    user_id: user.id,
    email: user.email,
    category: category ?? 'general',
    message: trimmed,
    context: context ?? {},
  });

  if (error) throw new HttpError(500, error.message);
  return json(201, { received: true });
});
