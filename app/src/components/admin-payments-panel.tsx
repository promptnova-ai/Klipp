import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';

type ReconciliationRow = {
  payment_id: string;
  booking_id: string;
  client_name: string | null;
  booking_status: string;
  provider_order_number: string;
  expected_amount_dop: number;
  provider_amount_dop: number | null;
  payment_status: string;
  reconciliation_required_at: string | null;
  refund_required_at: string | null;
  refund_reason: string | null;
  response_message: string | null;
  created_at: string;
};

type Props = { canReconcile: boolean };

function formatDop(value: number | null) {
  if (value === null || !Number.isFinite(Number(value))) return 'Sin dato';
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function AdminPaymentsPanel({ canReconcile }: Props) {
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase.rpc('admin_list_azul_reconciliation');
    if (loadError) {
      setError(loadError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ReconciliationRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function resolve(row: ReconciliationRow, action: 'no_charge' | 'refund_confirmed') {
    const providerReference = references[row.payment_id]?.trim() ?? '';
    const reason = reasons[row.payment_id]?.trim() ?? '';
    if (providerReference.length < 4 || reason.length < 5) {
      setError('Introduce la referencia del reporte/devolución de AZUL y una explicación de al menos 5 caracteres.');
      return;
    }
    setBusyId(row.payment_id);
    setError(null);
    setNotice(null);
    const { error: actionError } = await supabase.rpc('admin_resolve_azul_reconciliation', {
      p_payment_id: row.payment_id,
      p_action: action,
      p_provider_reference: providerReference,
      p_reason: reason,
    });
    if (actionError) {
      setError(actionError.message);
    } else {
      setNotice(action === 'refund_confirmed'
        ? 'Devolución registrada. El pago ya no aparece en la cola pendiente.'
        : 'Conciliación registrada: AZUL confirmó que no hubo cargo.');
      setReferences((current) => ({ ...current, [row.payment_id]: '' }));
      setReasons((current) => ({ ...current, [row.payment_id]: '' }));
      await loadQueue();
    }
    setBusyId(null);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CONTROL FINANCIERO</Text>
          <Text style={styles.title}>Conciliación AZUL</Text>
          <Text style={styles.subtitle}>Pagos sin retorno del navegador y cobros aprobados que requieren devolución.</Text>
        </View>
        <View style={styles.countPill}><Text style={styles.countText}>{rows.length} pendientes</Text></View>
      </View>

      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={KlippColors.gold} /><Text style={styles.subtitle}>Consultando pagos pendientes…</Text></View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyTitle}>Todo conciliado</Text><Text style={styles.subtitle}>No hay pagos AZUL que requieran revisión.</Text></View>
      ) : rows.map((row) => {
        const refund = Boolean(row.refund_required_at);
        const busy = busyId === row.payment_id;
        return (
          <View key={row.payment_id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardTopCopy}>
                <Text style={styles.cardTitle}>{refund ? 'Devolución pendiente' : 'Resultado por verificar'}</Text>
                <Text style={styles.muted}>{row.client_name ?? 'Cliente'} · Reserva {row.booking_id.slice(0, 8)}</Text>
              </View>
              <View style={[styles.statusPill, refund ? styles.refundPill : styles.reconcilePill]}>
                <Text style={styles.statusText}>{refund ? 'REEMBOLSO' : 'CONCILIAR'}</Text>
              </View>
            </View>
            <View style={styles.amountGrid}>
              <View style={styles.amountCell}><Text style={styles.amountLabel}>Importe de reserva</Text><Text style={styles.amountValue}>{formatDop(Number(row.expected_amount_dop))}</Text></View>
              <View style={styles.amountCell}><Text style={styles.amountLabel}>Importe AZUL</Text><Text style={styles.amountValue}>{formatDop(row.provider_amount_dop)}</Text></View>
            </View>
            <Text style={styles.meta}>Orden AZUL: {row.provider_order_number}</Text>
            <Text style={styles.meta}>Pago: {row.payment_status} · Reserva: {row.booking_status}</Text>
            {row.refund_reason && <Text style={styles.reason}>{row.refund_reason}</Text>}
            <Text style={styles.meta}>{refund ? 'AZUL aprobó un cobro que no debe activar el servicio.' : 'No se recibió la redirección firmada. Comprueba el reporte/portal de AZUL antes de cerrar el caso.'}</Text>

            {canReconcile ? (
              <View style={styles.actionArea}>
                <TextInput
                  value={references[row.payment_id] ?? ''}
                  onChangeText={(value) => setReferences((current) => ({ ...current, [row.payment_id]: value }))}
                  placeholder={refund ? 'Referencia de devolución AZUL' : 'Referencia del reporte AZUL'}
                  placeholderTextColor={KlippColors.muted}
                  autoCapitalize="characters"
                  style={styles.input}
                />
                <TextInput
                  value={reasons[row.payment_id] ?? ''}
                  onChangeText={(value) => setReasons((current) => ({ ...current, [row.payment_id]: value }))}
                  placeholder={refund ? 'Nota de devolución confirmada' : 'Nota de conciliación'}
                  placeholderTextColor={KlippColors.muted}
                  style={[styles.input, styles.reasonInput]}
                  multiline
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void resolve(row, refund ? 'refund_confirmed' : 'no_charge')}
                  style={[styles.actionButton, busy && styles.disabled]}
                >
                  {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.actionButtonText}>{refund ? 'Registrar devolución confirmada' : 'Confirmar que AZUL no cobró'}</Text>}
                </Pressable>
                <Text style={styles.disclaimer}>Registra la acción solo después de comprobarla en el portal o reporte oficial de AZUL. Queda guardada en el historial administrativo.</Text>
              </View>
            ) : (
              <Text style={styles.disclaimer}>Tu permiso permite consultar el caso, pero no resolver conciliaciones financieras.</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: { color: KlippColors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: KlippColors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  countPill: { backgroundColor: '#27231A', borderColor: '#66501D', borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  countText: { color: KlippColors.gold, fontSize: 11, fontWeight: '800' },
  loading: { alignItems: 'center', gap: 10, padding: 28 },
  empty: { backgroundColor: KlippColors.surface, borderColor: KlippColors.border, borderWidth: 1, borderRadius: 16, padding: 20, gap: 5 },
  emptyTitle: { color: KlippColors.text, fontSize: 15, fontWeight: '800' },
  card: { backgroundColor: KlippColors.surface, borderColor: KlippColors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTopCopy: { flex: 1, gap: 4 },
  cardTitle: { color: KlippColors.text, fontSize: 15, fontWeight: '800' },
  muted: { color: KlippColors.muted, fontSize: 11 },
  statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  refundPill: { backgroundColor: '#3B2422' },
  reconcilePill: { backgroundColor: '#27231A' },
  statusText: { color: KlippColors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  amountGrid: { flexDirection: 'row', gap: 10 },
  amountCell: { flex: 1, backgroundColor: '#101012', borderRadius: 10, padding: 10, gap: 4 },
  amountLabel: { color: KlippColors.muted, fontSize: 10 },
  amountValue: { color: KlippColors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: KlippColors.muted, fontSize: 11, lineHeight: 16 },
  reason: { color: '#F5C56B', fontSize: 12, lineHeight: 17 },
  actionArea: { borderTopColor: KlippColors.border, borderTopWidth: 1, paddingTop: 12, gap: 8 },
  input: { backgroundColor: '#101012', borderColor: KlippColors.border, borderWidth: 1, borderRadius: 10, color: KlippColors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12 },
  reasonInput: { minHeight: 64, textAlignVertical: 'top' },
  actionButton: { backgroundColor: KlippColors.gold, borderRadius: 10, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  actionButtonText: { color: '#111', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  disclaimer: { color: KlippColors.muted, fontSize: 10, lineHeight: 15 },
  error: { color: '#FCA5A5', fontSize: 12 },
  notice: { color: '#86EFAC', fontSize: 12 },
});
