/* Explicitly deny direct sequence access and cover the settings audit foreign key. */

CREATE POLICY deny_direct_invoice_sequence_access
ON public.invoice_sequences
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS invoice_company_settings_updated_by_idx
ON public.invoice_company_settings(updated_by);
