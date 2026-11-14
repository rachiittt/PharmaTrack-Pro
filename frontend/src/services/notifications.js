import { supabase, unwrap } from '../lib/supabase';

export async function listNotifications(pharmacyId, { unreadOnly = false, limit = 50 } = {}) {
  let q = supabase.from('notifications').select('*').eq('pharmacy_id', pharmacyId)
    .order('created_at', { ascending: false }).limit(limit);
  if (unreadOnly) q = q.is('read_at', null);
  return unwrap(await q);
}

export async function unreadCount(pharmacyId) {
  const { count } = unwrap(await supabase.from('notifications')
    .select('id', { count: 'exact', head: true }).eq('pharmacy_id', pharmacyId).is('read_at', null));
  return count ?? 0;
}

export async function markRead(ids) {
  return unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids));
}

export async function markAllRead(pharmacyId) {
  return unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('pharmacy_id', pharmacyId).is('read_at', null));
}

/**
 * Realtime: new notifications, sales and stock changes for one pharmacy.
 * RLS applies to realtime, so a client only receives its own tenant's rows.
 * Returns an unsubscribe function.
 */
export function subscribeToPharmacy(pharmacyId, handlers) {
  const filter = `pharmacy_id=eq.${pharmacyId}`;
  const channel = supabase.channel(`pharmacy:${pharmacyId}`);
  if (handlers.onNotification) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter }, (p) => handlers.onNotification(p.new));
  }
  if (handlers.onSale) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter }, (p) => handlers.onSale(p.new));
  }
  if (handlers.onStock) {
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'medicine_batches', filter }, (p) => handlers.onStock(p.new));
  }
  channel.subscribe();
  return () => { supabase.removeChannel(channel); };
}
