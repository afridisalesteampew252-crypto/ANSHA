import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization') || '';
    if (!url || !anonKey || !serviceKey) return json(request, { error: 'Deletion service is not configured.' }, 500);
    if (!authorization.startsWith('Bearer ')) return json(request, { error: 'Authentication required.' }, 401);

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json(request, { error: 'Your session is invalid. Sign in again.' }, 401);

    const { data: callerProfile } = await serviceClient
      .from('admin_profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (callerProfile?.role !== 'admin' || callerProfile?.is_active !== true) {
      return json(request, { error: 'Only an active administrator can review deletion requests.' }, 403);
    }

    const payload = await request.json();
    const requestId = String(payload.request_id || '').trim();
    const action = String(payload.action || '').trim();
    const note = String(payload.review_note || '').trim().slice(0, 1000) || null;
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json(request, { error: 'A valid request id is required.' }, 422);
    if (action !== 'approve' && action !== 'reject') return json(request, { error: 'Action must be approve or reject.' }, 422);

    const { data: deletionRequest, error: requestError } = await serviceClient
      .from('account_deletion_requests')
      .select('id, auth_user_id, customer_id, status')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) return json(request, { error: 'Could not load the deletion request.' }, 500);
    if (!deletionRequest) return json(request, { error: 'Deletion request not found.' }, 404);
    if (deletionRequest.status !== 'pending') return json(request, { error: 'This request is no longer pending.' }, 409);

    if (action === 'reject') {
      const { error } = await serviceClient
        .from('account_deletion_requests')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id, review_note: note })
        .eq('id', requestId)
        .eq('status', 'pending');
      if (error) return json(request, { error: error.message }, 500);
      return json(request, { status: 'rejected' });
    }

    const reviewedAt = new Date().toISOString();
    const { error: approvalError } = await serviceClient
      .from('account_deletion_requests')
      .update({ status: 'approved', reviewed_at: reviewedAt, reviewed_by: user.id, review_note: note })
      .eq('id', requestId)
      .eq('status', 'pending');
    if (approvalError) return json(request, { error: approvalError.message }, 500);

    const { data: profile } = await serviceClient
      .from('customer_profiles')
      .select('customer_id')
      .eq('id', deletionRequest.auth_user_id)
      .maybeSingle();
    const customerId = profile?.customer_id || deletionRequest.customer_id;

    await serviceClient
      .from('customer_profiles')
      .update({ is_active: false, email: 'deleted@invalid.local', full_name: 'Deleted portal user' })
      .eq('id', deletionRequest.auth_user_id);

    if (customerId) {
      const { data: customer } = await serviceClient
        .from('customers')
        .select('customer_code')
        .eq('id', customerId)
        .maybeSingle();
      const { error: anonymizeError } = await serviceClient
        .from('customers')
        .update({
          full_name: `Deleted customer ${customer?.customer_code || ''}`.trim(),
          company_name: null,
          email: null,
          phone: null,
          whatsapp: null,
          country: null,
          address: null,
          notes: null,
          avatar_url: null,
          tax_registration_number: null,
          consignee_name: null,
          consignee_company: null,
          consignee_phone: null,
          consignee_email: null,
          consignee_address: null,
          consignee_country: null,
          consignee_notes: null,
          is_active: false,
        })
        .eq('id', customerId);
      if (anonymizeError) return json(request, { error: `Could not anonymize customer data: ${anonymizeError.message}` }, 500);
    }

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(deletionRequest.auth_user_id);
    if (deleteError) return json(request, { error: `Profile was disabled, but Auth deletion failed: ${deleteError.message}` }, 500);

    const completedAt = new Date().toISOString();
    await serviceClient
      .from('account_deletion_requests')
      .update({ status: 'completed', completed_at: completedAt, updated_at: completedAt })
      .eq('id', requestId);

    return json(request, { status: 'completed' });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Unknown deletion error.' }, 500);
  }
});
