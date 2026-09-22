import { expect, test, type APIRequestContext } from '@playwright/test';
import { adminAccessToken, loginAs, missingRoleReason, mutationSkipReason, supabaseHeaders } from './helpers';

const db = () => process.env.E2E_SUPABASE_URL!;

async function rpc(request: APIRequestContext, token: string, name: string, data: Record<string, unknown>) {
  return request.post(`${db()}/rest/v1/rpc/${name}`, { headers: supabaseHeaders(token), data });
}

async function rows(request: APIRequestContext, token: string, query: string) {
  const response = await request.get(`${db()}/rest/v1/${query}`, { headers: supabaseHeaders(token) });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test.describe('opt-in stateful workflows', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(() => {
    test.skip(Boolean(mutationSkipReason()), mutationSkipReason());
    test.skip(Boolean(missingRoleReason('admin')), missingRoleReason('admin'));
  });

  test('reserve, release, sell, and make available stock', async ({ request }) => {
    const vehicleId = process.env.E2E_STOCK_VEHICLE_ID;
    const customerId = process.env.E2E_CUSTOMER_ID;
    test.skip(!vehicleId || !customerId, 'Set disposable stock and customer fixture IDs');
    const token = await adminAccessToken(request);
    const [original] = await rows(request, token, `vehicles?id=eq.${vehicleId}&select=stock_status,is_published,reserved_customer_id`);
    expect(original).toBeTruthy();

    try {
      const reserve = await rpc(request, token, 'reserve_vehicle_stock', {
        p_vehicle_id: vehicleId, p_customer_id: customerId, p_price_term: 'fob',
        p_shipment_term: 'roro', p_inspection_required: false, p_vat_applicable: true,
        p_etd: null, p_eta: null, p_requester_name: 'Playwright', p_requester_role: 'admin',
      });
      expect(reserve.ok(), await reserve.text()).toBeTruthy();
      expect((await rows(request, token, `vehicles?id=eq.${vehicleId}&select=stock_status`))[0].stock_status).toBe('reserved');

      const release = await rpc(request, token, 'release_vehicle_reservation', { p_vehicle_id: vehicleId, p_republish: false });
      expect(release.ok(), await release.text()).toBeTruthy();

      for (const [stock_status, is_published] of [['sold', false], ['available', true]] as const) {
        const response = await request.patch(`${db()}/rest/v1/vehicles?id=eq.${vehicleId}`, {
          headers: { ...supabaseHeaders(token), Prefer: 'return=representation' },
          data: { stock_status, is_published },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
        expect((await response.json())[0]).toMatchObject({ stock_status, is_published });
      }
    } finally {
      await request.patch(`${db()}/rest/v1/vehicles?id=eq.${vehicleId}`, { headers: supabaseHeaders(token), data: original });
    }
  });

  test('allocates remittance and rejects over-allocation', async ({ request }) => {
    const remittanceId = process.env.E2E_REMITTANCE_ID;
    const invoiceId = process.env.E2E_INVOICE_ID;
    test.skip(!remittanceId || !invoiceId, 'Set matching disposable remittance and invoice IDs');
    const token = await adminAccessToken(request);

    const invalid = await rpc(request, token, 'allocate_remittance', {
      p_remittance_id: remittanceId, p_invoice_id: invoiceId, p_amount: 999999999999,
    });
    expect(invalid.ok()).toBeFalsy();

    const valid = await rpc(request, token, 'allocate_remittance', {
      p_remittance_id: remittanceId, p_invoice_id: invoiceId, p_amount: 0.01,
    });
    expect(valid.ok(), await valid.text()).toBeTruthy();
    const allocation = (await rows(request, token, `remittance_allocations?remittance_id=eq.${remittanceId}&invoice_id=eq.${invoiceId}&order=created_at.desc&limit=1&select=id,amount`))[0];
    expect(Number(allocation.amount)).toBe(0.01);
    const reverse = await rpc(request, token, 'reverse_remittance_allocation', { p_allocation_id: allocation.id });
    expect(reverse.ok(), await reverse.text()).toBeTruthy();
  });

  test('links unknown TTS and confirms it automatically', async ({ request }) => {
    const remittanceId = process.env.E2E_UNKNOWN_REMITTANCE_ID;
    const customerId = process.env.E2E_CUSTOMER_ID;
    const receivedBy = process.env.E2E_RECEIVED_BY_USER_ID;
    test.skip(!remittanceId || !customerId || !receivedBy, 'Set disposable unknown-TTS fixture IDs');
    const token = await adminAccessToken(request);
    const [original] = await rows(request, token, `remittances?id=eq.${remittanceId}&select=customer_id,customer_name,received_by,office_id,shift_id,status,is_unknown`);

    try {
      const response = await rpc(request, token, 'link_remittance', {
        p_remittance_id: remittanceId, p_customer_id: customerId,
        p_customer_name: process.env.E2E_CUSTOMER_NAME || 'Playwright fixture',
        p_received_by: receivedBy, p_office_id: original.office_id,
        p_shift_id: original.shift_id, p_status: 'confirmed',
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const linked = (await rows(request, token, `remittances?id=eq.${remittanceId}&select=customer_id,received_by,status,is_unknown`))[0];
      expect(linked).toMatchObject({ customer_id: customerId, received_by: receivedBy, status: 'confirmed', is_unknown: false });
    } finally {
      await request.patch(`${db()}/rest/v1/remittances?id=eq.${remittanceId}`, { headers: supabaseHeaders(token), data: original });
    }
  });
});

test('customer SOA separates multi-currency totals', async ({ page }) => {
  const customerId = process.env.E2E_MULTI_CURRENCY_CUSTOMER_ID;
  test.skip(Boolean(missingRoleReason('admin')), missingRoleReason('admin'));
  test.skip(!customerId, 'Set a customer fixture with at least two currencies');
  await loginAs(page, 'admin');
  await page.goto(`/admin/customers/${customerId}#soa`);
  await expect(page.getByRole('heading', { name: 'Statement of Account' })).toBeVisible();
  await expect(page.getByText('Balances listed per currency — amounts are not converted. Allocate only matching currencies.')).toBeVisible();
  const text = await page.locator('#soa').innerText();
  const currencies = new Set(text.match(/AED|USD|JPY|EUR|GBP/g) || []);
  expect(currencies.size).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/no FX conversion across currencies/i)).toBeVisible();
});
