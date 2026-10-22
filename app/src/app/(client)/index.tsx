import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';

export default function ClientHomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
          <View>
            <Text style={styles.brand}>klipp</Text>
            <Text style={styles.location}>SANTO DOMINGO, RD</Text>
          </View>
        </View>
        <View style={styles.goldBadge}><Text style={styles.goldBadgeText}>SERVICIOS DE LIMPIEZA</Text></View>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Tu hogar, en buenas manos.</Text>
        <Text style={styles.greeting}>
          Hola{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Encuentra una ayuda
          confiable para tu hogar en Santo Domingo.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(client)/new-booking')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>Reservar un servicio</Text>
        </Pressable>
        <View style={styles.trustPanel}>
          <Text style={styles.trustTitle}>Confianza en cada visita</Text>
          <Text style={styles.noteText}>Elige una limpieza regular o profunda, revisa profesionales verificados y reserva en tu sector.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: KlippColors.canvas },
  header: {
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 25,
    backgroundColor: KlippColors.navyDeep,
    borderBottomWidth: 3,
    borderBottomColor: KlippColors.teal,
    gap: 18,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: KlippColors.teal },
  logoLetter: { color: KlippColors.white, fontSize: 24, fontWeight: '900' },
  brand: { color: KlippColors.white, fontSize: 25, fontWeight: '900' },
  location: { color: '#CBD5E1', fontSize: 10, fontWeight: '700', marginTop: 3 },
  goldBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 5, backgroundColor: KlippColors.gold },
  goldBadgeText: { color: KlippColors.navy, fontSize: 10, fontWeight: '900' },
  content: { padding: 24, gap: 14 },
  title: { color: KlippColors.navy, fontSize: 32, lineHeight: 38, fontWeight: '800' },
  greeting: { color: KlippColors.muted, fontSize: 16, lineHeight: 24 },
  primaryButton: { minHeight: 54, marginTop: 10, borderRadius: 8, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center', shadowColor: KlippColors.blue, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  primaryButtonText: { color: KlippColors.white, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.82 },
  trustPanel: { marginTop: 8, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 5 },
  trustTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '800' },
  noteText: { color: KlippColors.muted, fontSize: 14, lineHeight: 21, marginTop: 2 },
});