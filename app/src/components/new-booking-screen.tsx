import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { supabase } from '../../lib/supabase';
import { formatDop } from '@/lib/format';
import type { Address, ProCard, PricingTier, Review, ServiceType } from '@/lib/types';

type AddressOption = Address & { sectors: { name: string } | null };

export function NewBookingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [services, setServices] = useState<ServiceType[]>([]);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [addresses, setAddresses] = useState<AddressOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<number | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [pros, setPros] = useState<ProCard[]>([]);
  const [selectedProId, setSelectedProId] = useState<string | null>(null);
  const [expandedProId, setExpandedProId] = useState<string | null>(null);
  const [proReviews, setProReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPros, setLoadingPros] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      if (!session?.user.id) return;
      const [serviceResult, tierResult, addressResult] = await Promise.all([
        supabase.from('service_types').select('id, code, name, description, active').eq('active', true).order('name'),
        supabase.from('pricing_tiers').select('id, service_type_id, label, bedrooms, bathrooms, price_dop, est_minutes').order('price_dop'),
        supabase.from('addresses').select('id, client_id, label, street, references_text, sector_id, location, created_at, sectors(name)').eq('client_id', session.user.id).order('created_at', { ascending: false }),
      ]);
      const loadError = serviceResult.error ?? tierResult.error ?? addressResult.error;
      if (loadError) setError(loadError.message);
      else {
        const serviceRows = (serviceResult.data ?? []) as ServiceType[];
        setServices(serviceRows);
        setTiers((tierResult.data ?? []) as PricingTier[]);
        setAddresses((addressResult.data ?? []) as unknown as AddressOption[]);
        setSelectedServiceId(serviceRows[0]?.id ?? null);
      }
      setLoading(false);
    }
    void loadOptions();
  }, [session?.user.id]);

  const visibleTiers = tiers.filter((tier) => tier.service_type_id === selectedServiceId);
  const selectedTier = tiers.find((tier) => tier.id === selectedTierId) ?? visibleTiers[0] ?? null;
  const selectedAddress = addresses.find((address) => address.id === selectedAddressId) ?? null;

  useEffect(() => {
    if (!selectedAddress) {
      setPros([]);
      setSelectedProId(null);
      return;
    }
    const sectorId = selectedAddress.sector_id;
    let active = true;
    async function loadPros() {
      setLoadingPros(true);
      setError(null);
      const { data: sectorLinks, error: linksError } = await supabase.from('pro_sectors').select('pro_id').eq('sector_id', sectorId);
      if (linksError) {
        if (active) setError(linksError.message);
      } else {
        const proIds = [...new Set((sectorLinks ?? []).map((link) => link.pro_id))];
        if (proIds.length === 0) {
          if (active) setPros([]);
        } else {
          const { data, error: prosError } = await supabase
            .from('pro_cards')
            .select('pro_id, full_name, avatar_url, bio, years_experience, base_sector_id, rating_avg, rating_count, jobs_completed')
            .in('pro_id', proIds)
            .order('rating_avg', { ascending: false });
          if (active && prosError) setError(prosError.message);
          else if (active) {
            setPros((data ?? []) as ProCard[]);
            setSelectedProId(null);
          }
        }
      }
      if (active) setLoadingPros(false);
    }
    void loadPros();
    return () => { active = false; };
  }, [selectedAddress?.id, selectedAddress?.sector_id]);

  async function showProProfile(pro: ProCard) {
    setExpandedProId((current) => current === pro.pro_id ? null : pro.pro_id);
    setSelectedProId(pro.pro_id);
    const { data, error: reviewError } = await supabase
      .from('reviews')
      .select('id, booking_id, client_id, pro_id, rating, comment, created_at')
      .eq('pro_id', pro.pro_id)
      .order('created_at', { ascending: false })
      .limit(3);
    if (reviewError) setError(reviewError.message);
    else setProReviews((data ?? []) as Review[]);
  }

  function getScheduledStart() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) return null;
    const value = new Date(`${scheduledDate}T${scheduledTime}:00-04:00`);
    return Number.isNaN(value.getTime()) || value.getTime() <= Date.now() ? null : value.toISOString();
  }

  async function createBooking() {
    if (!selectedTier || !selectedAddress || !session?.user.id) {
      setError('Selecciona el servicio, tamaño y dirección.');
      return;
    }
    const scheduledStart = getScheduledStart();
    if (!scheduledStart) {
      setError('Elige una fecha y hora futura válidas.');
      return;
    }
    if (mode === 'manual' && !selectedProId) {
      setError('Selecciona un profesional disponible para continuar.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { error: rpcError } = await supabase.rpc('create_booking', {
      p_pricing_tier_id: selectedTier.id,
      p_address_id: selectedAddress.id,
      p_scheduled_start: scheduledStart,
      p_mode: mode,
      p_pro_id: mode === 'manual' ? selectedProId : null,
      p_notes: null,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess(mode === 'auto' ? 'Buscando profesional. Tu solicitud se creó correctamente.' : 'Solicitud enviada al profesional. Te avisaremos cuando responda.');
    }
    setSaving(false);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando opciones...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Volver</Text></Pressable>
      <Text style={styles.title}>Nueva reserva</Text>
      {success && <View style={styles.successBanner}><Text style={styles.successTitle}>{success}</Text><Pressable onPress={() => router.replace('/(client)/bookings')}><Text style={styles.successLink}>Ver mis reservas</Text></Pressable></View>}
      {services.length === 0 && <Text style={styles.empty}>No hay servicios disponibles ahora mismo.</Text>}

      <Section title="1. Servicio">
        {services.map((service) => <Choice key={service.id} selected={selectedServiceId === service.id} label={service.name} onPress={() => { setSelectedServiceId(service.id); setSelectedTierId(null); }} />)}
      </Section>
      <Section title="2. Tamaño de la vivienda">
        {visibleTiers.length === 0 ? <Text style={styles.body}>No hay tamaños configurados para este servicio.</Text> : visibleTiers.map((tier) => (
          <Choice key={tier.id} selected={(selectedTier?.id ?? null) === tier.id} label={`${tier.label} · ${formatDop(tier.price_dop)}`} onPress={() => setSelectedTierId(tier.id)} />
        ))}
      </Section>
      <Section title="3. Dirección">
        {addresses.length === 0 ? (
          <View style={styles.emptyInline}><Text style={styles.body}>Primero guarda una dirección con sector y referencias.</Text><Pressable onPress={() => router.push('/(client)/addresses')}><Text style={styles.successLink}>Añadir dirección</Text></Pressable></View>
        ) : addresses.map((address) => (
          <Choice key={address.id} selected={selectedAddressId === address.id} label={`${address.label || address.sectors?.name || 'Dirección'} · ${address.sectors?.name ?? 'Sector'}`} onPress={() => setSelectedAddressId(address.id)} />
        ))}
      </Section>
      <Section title="4. Fecha y hora">
        <Text style={styles.label}>Fecha (AAAA-MM-DD)</Text>
        <TextInput onChangeText={setScheduledDate} placeholder="2026-12-31" placeholderTextColor="#85918b" style={styles.input} value={scheduledDate} />
        <Text style={styles.label}>Hora (hora de Santo Domingo)</Text>
        <TextInput onChangeText={setScheduledTime} placeholder="09:00" placeholderTextColor="#85918b" style={styles.input} value={scheduledTime} />
      </Section>
      <Section title="5. Profesional">
        <View style={styles.modeOptions}>
          <ModeOption label="Elegir profesional" selected={mode === 'manual'} onPress={() => setMode('manual')} />
          <ModeOption label="Asignar automáticamente" selected={mode === 'auto'} onPress={() => setMode('auto')} />
        </View>
        {mode === 'manual' && !selectedAddress && <Text style={styles.body}>Selecciona una dirección para ver profesionales de ese sector.</Text>}
        {mode === 'manual' && selectedAddress && loadingPros && <ActivityIndicator color="#16766c" />}
        {mode === 'manual' && selectedAddress && !loadingPros && pros.length === 0 && <Text style={styles.body}>No hay profesionales verificados disponibles en este sector.</Text>}
        {mode === 'manual' && pros.map((pro) => (
          <View key={pro.pro_id} style={[styles.proCard, selectedProId === pro.pro_id && styles.proCardSelected]}>
            <Pressable onPress={() => void showProProfile(pro)} style={styles.proSummary}>
              {pro.avatar_url ? <Image source={{ uri: pro.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{pro.full_name?.[0] ?? 'K'}</Text></View>}
              <View style={styles.proMain}>
                <Text style={styles.proName}>{pro.full_name ?? 'Profesional Klipp'}</Text>
                <Text style={styles.body}>{pro.years_experience ?? 0} años de experiencia</Text>
                <Text style={styles.rating}>★ {Number(pro.rating_avg).toFixed(1)} · {pro.rating_count} reseñas</Text>
              </View>
              <Text style={styles.profileLink}>{expandedProId === pro.pro_id ? 'Cerrar' : 'Ver perfil'}</Text>
            </Pressable>
            {expandedProId === pro.pro_id && (
              <View style={styles.profileDetails}>
                <Text style={styles.body}>{pro.bio || 'Este profesional aún no ha añadido una biografía.'}</Text>
                <Text style={styles.reviewHeading}>Reseñas recientes</Text>
                {proReviews.length === 0 ? <Text style={styles.body}>Todavía no hay reseñas.</Text> : proReviews.map((review) => <Text key={review.id} style={styles.reviewText}>★ {review.rating} {review.comment || ''}</Text>)}
                <Pressable accessibilityRole="button" onPress={() => setSelectedProId(pro.pro_id)} style={styles.selectPro}><Text style={styles.selectProText}>{selectedProId === pro.pro_id ? 'Profesional seleccionado' : 'Elegir este profesional'}</Text></Pressable>
              </View>
            )}
          </View>
        ))}
        {mode === 'auto' && <Text style={styles.body}>Buscaremos un profesional disponible en el sector de tu dirección. La asignación automática se conectará más adelante.</Text>}
      </Section>

      {selectedTier && <Text style={styles.priceLine}>Total del servicio: {formatDop(selectedTier.price_dop)}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void createBooking()} style={[styles.submit, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Solicitar servicio</Text>}
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function ModeOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.modeOption, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { padding: 22, paddingTop: 42, paddingBottom: 38, gap: 14, backgroundColor: '#f4f7f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f4f7f5' },
  back: { alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { color: '#125e56', fontSize: 15, fontWeight: '700' },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  section: { padding: 16, borderRadius: 8, backgroundColor: '#fff', gap: 10 },
  sectionTitle: { color: '#18332d', fontSize: 16, fontWeight: '700' },
  body: { color: '#52615b', fontSize: 14, lineHeight: 21 },
  label: { color: '#263b34', fontSize: 13, fontWeight: '700', marginTop: 2 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 7, paddingHorizontal: 12, color: '#18332d', backgroundColor: '#fff', fontSize: 15 },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#d5dfda', borderRadius: 6, backgroundColor: '#fff' },
  choiceSelected: { borderColor: '#16766c', backgroundColor: '#e7f1ed' },
  choiceText: { color: '#52615b', fontSize: 14, fontWeight: '600' },
  choiceTextSelected: { color: '#125e56' },
  empty: { color: '#68756f', fontSize: 14, padding: 14, borderRadius: 7, backgroundColor: '#fff' },
  emptyInline: { gap: 6 },
  modeOptions: { flexDirection: 'row', gap: 8 },
  modeOption: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: '#d5dfda', borderRadius: 6, backgroundColor: '#fff' },
  proCard: { padding: 12, borderWidth: 1, borderColor: '#d5dfda', borderRadius: 7, gap: 10 },
  proCardSelected: { borderColor: '#16766c' },
  proSummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e7f1ed' },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e7f1ed' },
  avatarInitial: { color: '#125e56', fontSize: 20, fontWeight: '700' },
  proMain: { flex: 1, gap: 2 },
  proName: { color: '#18332d', fontSize: 15, fontWeight: '700' },
  rating: { color: '#8a5b00', fontSize: 13, fontWeight: '700' },
  profileLink: { color: '#125e56', fontSize: 12, fontWeight: '700' },
  profileDetails: { paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e6ede9', gap: 8 },
  reviewHeading: { color: '#263b34', fontSize: 13, fontWeight: '700', marginTop: 4 },
  reviewText: { color: '#52615b', fontSize: 13, lineHeight: 19 },
  selectPro: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#e7f1ed' },
  selectProText: { color: '#125e56', fontSize: 14, fontWeight: '700' },
  priceLine: { color: '#18332d', fontSize: 17, fontWeight: '700' },
  submit: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#16766c' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  error: { color: '#a32f27', fontSize: 14, lineHeight: 20 },
  successBanner: { padding: 14, borderRadius: 7, backgroundColor: '#e3f1e9', gap: 7 },
  successTitle: { color: '#125e56', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  successLink: { color: '#125e56', fontSize: 14, fontWeight: '700' },
});