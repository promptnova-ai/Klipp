import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { supabase } from '../../lib/supabase';
import type { ProAvailability, ProProfile, Sector, VerificationStatus } from '@/lib/types';

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function verificationLabel(status: VerificationStatus) {
  if (status === 'approved') return 'Verificado';
  if (status === 'rejected') return 'Verificación rechazada';
  return 'Verificación pendiente';
}

export function ProProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proProfile, setProProfile] = useState<ProProfile | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSectorIds, setSelectedSectorIds] = useState<number[]>([]);
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [baseSectorId, setBaseSectorId] = useState<number | null>(null);
  const [availability, setAvailability] = useState<ProAvailability[]>([]);
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [addingAvailability, setAddingAvailability] = useState(false);

  async function loadProfile() {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const [profileResult, sectorsResult, linksResult, availabilityResult] = await Promise.all([
      supabase.from('pro_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('sectors').select('id, name, zone, active').eq('active', true).order('name'),
      supabase.from('pro_sectors').select('sector_id').eq('pro_id', userId),
      supabase.from('pro_availability').select('id, pro_id, weekday, start_time, end_time').eq('pro_id', userId).order('weekday'),
    ]);
    if (profileResult.error || sectorsResult.error || linksResult.error || availabilityResult.error) {
      setError(
        profileResult.error?.message ?? sectorsResult.error?.message ?? linksResult.error?.message ?? availabilityResult.error?.message ?? 'No pudimos cargar tu perfil.',
      );
      setLoading(false);
      return;
    }
    const savedProfile = profileResult.data as ProProfile;
    setProProfile(savedProfile);
    setBio(savedProfile.bio ?? '');
    setYears(savedProfile.years_experience?.toString() ?? '');
    setBaseSectorId(savedProfile.base_sector_id);
    setSectors((sectorsResult.data ?? []) as Sector[]);
    setSelectedSectorIds((linksResult.data ?? []).map((link) => link.sector_id));
    setAvailability((availabilityResult.data ?? []) as ProAvailability[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadProfile();
  }, [userId]);

  async function saveProfile() {
    if (!userId || !proProfile) return;
    const parsedYears = years.trim() ? Number(years) : null;
    if (parsedYears !== null && (!Number.isInteger(parsedYears) || parsedYears < 0)) {
      setError('Los años de experiencia deben ser un número entero igual o mayor que cero.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: updateError } = await supabase
      .from('pro_profiles')
      .update({ bio: bio.trim() || null, years_experience: parsedYears, base_sector_id: baseSectorId })
      .eq('user_id', userId);
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const currentIds = new Set(selectedSectorIds);
    const savedIds = new Set((await supabase.from('pro_sectors').select('sector_id').eq('pro_id', userId)).data?.map((link) => link.sector_id) ?? []);
    const toAdd = [...currentIds].filter((id) => !savedIds.has(id));
    const toRemove = [...savedIds].filter((id) => !currentIds.has(id));
    let sectorError: string | null = null;
    if (toAdd.length) {
      const { error: addError } = await supabase.from('pro_sectors').insert(toAdd.map((sector_id) => ({ pro_id: userId, sector_id })));
      sectorError = addError?.message ?? null;
    }
    if (!sectorError && toRemove.length) {
      const { error: removeError } = await supabase.from('pro_sectors').delete().eq('pro_id', userId).in('sector_id', toRemove);
      sectorError = removeError?.message ?? null;
    }
    if (sectorError) setError(`El perfil se guardó, pero no se pudieron actualizar los sectores: ${sectorError}`);
    else setNotice('Perfil actualizado.');
    setProProfile({ ...proProfile, bio: bio.trim() || null, years_experience: parsedYears, base_sector_id: baseSectorId });
    setSaving(false);
  }

  function toggleSector(sectorId: number) {
    setSelectedSectorIds((current) =>
      current.includes(sectorId) ? current.filter((id) => id !== sectorId) : [...current, sectorId],
    );
  }

  async function addAvailability() {
    if (!userId) return;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
      setError('Usa horas válidas en formato HH:MM y asegúrate de que el fin sea posterior al inicio.');
      return;
    }
    setAddingAvailability(true);
    setError(null);
    const { error: addError } = await supabase.from('pro_availability').insert({
      pro_id: userId,
      weekday,
      start_time: startTime,
      end_time: endTime,
    });
    if (addError) setError(addError.message);
    else await loadProfile();
    setAddingAvailability(false);
  }

  async function removeAvailability(id: number) {
    if (!userId) return;
    setError(null);
    const { error: removeError } = await supabase.from('pro_availability').delete().eq('id', id).eq('pro_id', userId);
    if (removeError) setError(removeError.message);
    else setAvailability((current) => current.filter((slot) => slot.id !== id));
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando perfil...</Text></View>;
  }

  if (!proProfile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.sectionTitle}>No pudimos cargar tu perfil</Text>
        <Text style={styles.body}>{error ?? 'Intenta de nuevo.'}</Text>
        <ActionButton label="Reintentar" onPress={() => void loadProfile()} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Mi perfil profesional</Text>
      <View style={[styles.statusBanner, proProfile.verification_status === 'approved' && styles.statusApproved]}>
        <Text style={styles.statusTitle}>{verificationLabel(proProfile.verification_status)}</Text>
        {proProfile.verification_status !== 'approved' && (
          <Text style={styles.body}>Debes completar la verificación antes de recibir solicitudes.</Text>
        )}
      </View>

      <Section title="Sobre ti">
        <Text style={styles.label}>Biografía</Text>
        <TextInput multiline onChangeText={setBio} placeholder="Cuéntales a tus clientes sobre tu experiencia" style={[styles.input, styles.multiline]} value={bio} />
        <Text style={styles.label}>Años de experiencia</Text>
        <TextInput keyboardType="number-pad" onChangeText={setYears} placeholder="Ej. 5" style={styles.input} value={years} />
        <Text style={styles.label}>Sector base</Text>
        <View style={styles.choiceList}>
          {sectors.map((sector) => (
            <Choice key={sector.id} selected={baseSectorId === sector.id} label={sector.name} onPress={() => setBaseSectorId(sector.id)} />
          ))}
        </View>
        <Text style={styles.label}>Sectores donde trabajas</Text>
        <View style={styles.choiceList}>
          {sectors.map((sector) => (
            <Choice key={sector.id} selected={selectedSectorIds.includes(sector.id)} label={sector.name} onPress={() => toggleSector(sector.id)} />
          ))}
        </View>
      </Section>

      <Section title="Disponibilidad semanal">
        <Text style={styles.body}>Indica los horarios en que puedes recibir servicios.</Text>
        <View style={styles.weekdays}>
          {weekdayLabels.map((label, index) => (
            <Choice key={label} selected={weekday === index + 1} label={label} onPress={() => setWeekday(index + 1)} />
          ))}
        </View>
        <View style={styles.timeRow}>
          <View style={styles.timeField}><Text style={styles.label}>Desde</Text><TextInput keyboardType="numbers-and-punctuation" onChangeText={setStartTime} style={styles.input} value={startTime} /></View>
          <View style={styles.timeField}><Text style={styles.label}>Hasta</Text><TextInput keyboardType="numbers-and-punctuation" onChangeText={setEndTime} style={styles.input} value={endTime} /></View>
        </View>
        <ActionButton disabled={addingAvailability} label={addingAvailability ? 'Añadiendo...' : 'Añadir horario'} onPress={() => void addAvailability()} />
        {availability.length === 0 ? (
          <Text style={styles.empty}>Todavía no has añadido horarios.</Text>
        ) : (
          availability.map((slot) => (
            <View key={slot.id} style={styles.slotRow}>
              <Text style={styles.slotText}>{weekdayLabels[slot.weekday - 1]} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</Text>
              <Pressable accessibilityRole="button" onPress={() => void removeAvailability(slot.id)} style={styles.removeButton}>
                <Text style={styles.removeText}>Eliminar</Text>
              </Pressable>
            </View>
          ))
        )}
      </Section>

      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {notice && <Text accessibilityRole="status" style={styles.success}>{notice}</Text>}
      <ActionButton disabled={saving} label={saving ? 'Guardando...' : 'Guardar perfil'} onPress={() => void saveProfile()} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionButton, disabled && styles.buttonDisabled]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { padding: 22, paddingTop: 58, paddingBottom: 40, gap: 16, backgroundColor: '#f4f7f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: '#18332d', fontSize: 27, fontWeight: '700' },
  section: { padding: 17, borderRadius: 8, backgroundColor: '#fff', gap: 11 },
  sectionTitle: { color: '#18332d', fontSize: 18, fontWeight: '700' },
  statusBanner: { padding: 16, borderRadius: 8, backgroundColor: '#fff1dd', gap: 5 },
  statusApproved: { backgroundColor: '#e3f1e9' },
  statusTitle: { color: '#18332d', fontSize: 15, fontWeight: '700' },
  label: { color: '#263b34', fontSize: 13, fontWeight: '700' },
  body: { color: '#52615b', fontSize: 14, lineHeight: 21 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 7, paddingHorizontal: 12, color: '#18332d', backgroundColor: '#fff', fontSize: 15 },
  multiline: { minHeight: 92, paddingVertical: 10, textAlignVertical: 'top' },
  choiceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  choice: { minHeight: 38, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  choiceSelected: { borderColor: '#16766c', backgroundColor: '#e7f1ed' },
  choiceText: { color: '#52615b', fontSize: 13, fontWeight: '600' },
  choiceTextSelected: { color: '#125e56' },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1, gap: 6 },
  actionButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16766c' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.55 },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e7eeea' },
  slotText: { color: '#263b34', fontSize: 14 },
  removeButton: { padding: 8 },
  removeText: { color: '#a32f27', fontSize: 13, fontWeight: '600' },
  empty: { color: '#68756f', fontSize: 14, paddingVertical: 6 },
  error: { color: '#a32f27', fontSize: 14, lineHeight: 20 },
  success: { color: '#126e64', fontSize: 14 },
});