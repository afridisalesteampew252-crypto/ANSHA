const labels: Record<string, string> = {
  overdue_invoice: 'Overdue invoice', invoice_issue: 'Invoice issue', new_inquiry: 'New inquiry',
  overdue_request: 'Overdue request', due_today_request: 'Due today', unassigned_request: 'Unassigned request',
  new_request: 'New request', part_request: 'Part request', payment_proof: 'TT copy review', unknown_tt: 'Unknown TT',
  reservation: 'Reservation', shipment_followup: 'Shipment follow-up', support_message: 'Support reply',
  failed_import: 'Failed import', failed_email: 'Failed email',
};

export function workQueueLabel(kind: string) {
  return labels[kind] || 'Action needed';
}
