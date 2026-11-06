import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import type { ExtractRole } from '@/lib/types';

type AuthScreenProps = { mode: 'login' | 'register' };

const serviceHighlights = [
  {
    title: 'Profesionales verificados',
    detail: 'Perfiles revisados antes de trabajar.',
    icon: { ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' },
  },
  {
    title: 'Tarifas claras',
    detail: 'Conoces el precio antes de pagar.',
    icon: { ios: 'tag.fill', android: 'sell', web: 'sell' },
  },
  {
    title: 'Seguimiento en vivo',
    detail: 'Sigue la llegada del profesional.',
    icon: { ios: 'location.fill', android: 'location_on', web: 'place' },
  },
] as const;

function LoginShowcase({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.showcase, compact && styles.showcaseCompact]}>
      <View style={styles.showcaseCopy}>
        <View style={styles.showcaseBrandLine}>
          <View style={styles.showcaseMark}><Text style={styles.showcaseMarkLetter}>K</Text></View>
          <Text style={styles.showcaseBrand}>KLIPP</Text>
          <Text style={styles.showcaseRegion}>SANTO DOMINGO · RD</Text>
        </View>
        <Text style={styles.showcaseKicker}>SERVICIOS A DOMICILIO</Text>
        <Text style={styles.showcaseTitle}>Tu día, más fácil. Tu servicio, en buenas manos.</Text>
        <Text style={styles.showcaseDescription}>
          Encuentra profesionales para limpieza, barbería, peluquería, estética, vehículos y mantenimiento.
        </Text>
        <View style={styles.showcaseHighlights}>
          {serviceHighlights.map((item) => (
            <View key={item.title} style={styles.showcaseHighlight}>
              <View style={styles.showcaseHighlightIcon}>
                <SymbolView name={item.icon} tintColor={KlippColors.teal} size={18} />
              </View>
              <View style={styles.showcaseHighlightCopy}>
                <Text style={styles.showcaseHighlightTitle}>{item.title}</Text>
                <Text style={styles.showcaseHighlightDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      {!compact && (
        <View style={styles.bookingPreview}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewEyebrow}>ASÍ FUNCIONA</Text>
            <View style={styles.previewLive}><View style={styles.previewLiveDot} /><Text style={styles.previewLiveText}>EN VIVO</Text></View>
          </View>
          <View style={styles.previewService}>
            <View style={styles.previewServiceIcon}>
              <SymbolView name={{ ios: 'scissors', android: 'content_cut', web: 'content_cut' }} tintColor={KlippColors.blue} size={23} />
            </View>
            <View style={styles.previewServiceCopy}>
              <Text style={styles.previewServiceTitle}>Barbería a domicilio</Text>
              <Text style={styles.previewServiceDetail}>Ejemplo de una reserva</Text>
            </View>
          </View>
          <View style={styles.previewDivider} />
          <Text style={styles.previewSectionTitle}>Tu servicio, paso a paso</Text>
          <View style={styles.previewTimeline}>
            <View style={styles.previewTimelineRail}>
              <View style={styles.previewTimelineDot} />
              <View style={styles.previewTimelineLine} />
              <View style={[styles.previewTimelineDot, styles.previewTimelineDotActive]} />
            </View>
            <View style={styles.previewTimelineCopy}>
              <Text style={styles.previewTimelineTitle}>Profesional asignado</Text>
              <Text style={styles.previewTimelineDetail}>Precio confirmado antes del pago</Text>
              <Text style={styles.previewTimelineTitle}>En camino</Text>
              <Text style={styles.previewTimelineDetail}>Ubicación y ETA actualizadas</Text>
            </View>
          </View>
          <View style={styles.previewFooter}>
            <SymbolView name={{ ios: 'shield.lefthalf.filled', android: 'verified_user', web: 'verified_user' }} tintColor={KlippColors.teal} size={15} />
            <Text style={styles.previewFooterText}>Todo desde la app Klipp</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const isRegister = mode === 'register';
  const { width } = useWindowDimensions();
  const wideLogin = !isRegister && width >= 1050;
  const router = useRouter();
  const { session, signIn, signUp, authError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ExtractRole>('client');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace('/');
  }, [router, session]);

  async function handleSubmit() {
    setError(null);
    setNotice(null);
    if (isRegister && !fullName.trim()) {
      setError('Escribe tu nombre para continuar.');
      return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        const hasSession = await signUp(email.trim(), password, fullName.trim(), role);
        if (hasSession) router.replace('/');
        else setNotice('Revisa tu correo para confirmar la cuenta y luego inicia sesión.');
      } else {
        await signIn(email.trim(), password);
        router.replace('/');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos completar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scrollContent, !isRegister && styles.loginScrollContent, wideLogin && styles.loginScrollContentWide]} keyboardShouldPersistTaps="handled">
          <View style={[styles.loginShell, wideLogin && styles.loginShellWide]}>
            <View style={[styles.brandBlock, !isRegister && styles.loginBrandBlock]}>
              <View style={styles.brandRow}>
                <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
                <Text style={[styles.brand, !isRegister && styles.loginBrand]}>KLIPP</Text>
              </View>
              <Text style={[styles.location, !isRegister && styles.loginLocation]}>SANTO DOMINGO, RD</Text>
            </View>

            <View style={[styles.loginMain, wideLogin && styles.loginMainWide]}>
              {!isRegister && <LoginShowcase compact={!wideLogin} />}
          <View style={[styles.form, !isRegister && styles.loginForm, wideLogin && styles.loginFormWide]}>
            <Text style={[styles.eyebrow, !isRegister && styles.loginEyebrow]}>{isRegister ? 'EMPIEZA CON KLIPP' : 'CUENTA KLIPP'}</Text>
            <Text style={[styles.title, !isRegister && styles.loginTitle]}>{isRegister ? 'Crea tu cuenta' : 'Inicia sesión'}</Text>
            <Text style={[styles.subtitle, !isRegister && styles.loginSubtitle]}>
              {isRegister ? 'Encuentra profesionales de confianza para los servicios que necesitas.' : 'Accede a tu espacio de Klipp.'}
            </Text>

            {isRegister && (
              <>
                <Text style={styles.label}>Nombre completo</Text>
                <TextInput
                  autoComplete="name"
                  autoCapitalize="words"
                  onChangeText={setFullName}
                  placeholder="Tu nombre"
                  placeholderTextColor="#85918b"
                  style={[styles.input, !isRegister && styles.loginInput]}
                  value={fullName}
                />
                <Text style={styles.label}>¿Cómo usarás Klipp?</Text>
                <View style={styles.roleOptions}>
                  {([
                    ['client', 'Soy cliente'],
                    ['pro', 'Soy profesional'],
                  ] as const).map(([value, label]) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: role === value }}
                      key={value}
                      onPress={() => value === 'pro' ? router.push('/(auth)/pro-register') : setRole(value)}
                      style={[styles.roleOption, role === value && styles.roleOptionSelected]}>
                      <Text style={[styles.roleText, role === value && styles.roleTextSelected]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="nombre@correo.com"
              placeholderTextColor="#85918b"
              style={[styles.input, !isRegister && styles.loginInput]}
              value={email}
            />
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor="#85918b"
              secureTextEntry
              style={[styles.input, !isRegister && styles.loginInput]}
              value={password}
            />

            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            {authError && <Text accessibilityRole="alert" style={styles.error}>{authError}</Text>}
            {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

            <Pressable
              accessibilityRole="button"
              disabled={busy || !email.trim() || !password}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.submit,
                !isRegister && styles.loginSubmit,
                (busy || !email.trim() || !password) && styles.submitDisabled,
                pressed && !busy && styles.submitPressed,
              ]}>
              {busy ? <ActivityIndicator color={isRegister ? '#fff' : '#0f172a'} /> : <Text style={[styles.submitText, !isRegister && styles.loginSubmitText]}>{isRegister ? 'Crear cuenta' : 'Entrar'}</Text>}
            </Pressable>

            <View style={styles.switchRow}>
              <Text style={[styles.switchText, !isRegister && styles.loginSwitchText]}>{isRegister ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}</Text>
              <Link href={isRegister ? '/(auth)/login' : '/(auth)/register'} asChild>
                <Text style={StyleSheet.flatten([styles.link, !isRegister && styles.loginLink])}>{isRegister ? 'Inicia sesión' : 'Regístrate'}</Text>
              </Link>
            </View>
          </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: KlippColors.canvas },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  loginScrollContent: { backgroundColor: '#0f172a', paddingHorizontal: 20, paddingVertical: 22 },
  loginScrollContentWide: { justifyContent: 'center', minHeight: '100%' },
  loginShell: { width: '100%', maxWidth: 1400, alignSelf: 'center' },
  loginShellWide: { paddingHorizontal: 16 },
  brandBlock: { marginBottom: 30, gap: 4 },
  loginBrandBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  loginBrand: { color: '#f8fafc', fontSize: 24, letterSpacing: 1.5 },
  loginLocation: { color: '#9babbc', fontSize: 9, letterSpacing: 1.4 },
  loginMain: { gap: 20 },
  loginMainWide: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  showcase: { width: '100%', flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', gap: 18, padding: 22, borderWidth: 1, borderColor: '#35495d', borderRadius: 18, backgroundColor: '#142638' },
  showcaseCompact: { flexDirection: 'column', padding: 18 },
  showcaseCopy: { flex: 1, minWidth: 0, gap: 11, justifyContent: 'center' },
  showcaseBrandLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  showcaseMark: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: KlippColors.blue },
  showcaseMarkLetter: { color: '#fff', fontSize: 17, fontWeight: '900' },
  showcaseBrand: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  showcaseRegion: { color: '#9babbc', fontSize: 8, fontWeight: '800', letterSpacing: 0.7, marginLeft: 'auto' },
  showcaseKicker: { color: KlippColors.teal, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  showcaseTitle: { color: '#f8fafc', fontSize: 27, lineHeight: 33, fontWeight: '900', maxWidth: 430 },
  showcaseDescription: { color: '#b6c4d2', fontSize: 13, lineHeight: 20, maxWidth: 430 },
  showcaseHighlights: { gap: 12, marginTop: 8 },
  showcaseHighlight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  showcaseHighlightIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#1d3b4a' },
  showcaseHighlightCopy: { flex: 1, gap: 2 },
  showcaseHighlightTitle: { color: '#f8fafc', fontSize: 11, fontWeight: '800' },
  showcaseHighlightDetail: { color: '#9babbc', fontSize: 10, lineHeight: 14 },
  bookingPreview: { width: 215, alignSelf: 'center', padding: 15, borderWidth: 1, borderColor: '#3b5367', borderRadius: 15, backgroundColor: '#0f1d2c' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  previewEyebrow: { color: '#9babbc', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  previewLive: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20, backgroundColor: '#153c36' },
  previewLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: KlippColors.teal },
  previewLiveText: { color: KlippColors.teal, fontSize: 6, fontWeight: '900' },
  previewService: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  previewServiceIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#e8f0ff' },
  previewServiceCopy: { flex: 1, gap: 3 },
  previewServiceTitle: { color: '#f8fafc', fontSize: 10, fontWeight: '900' },
  previewServiceDetail: { color: '#9babbc', fontSize: 8 },
  previewDivider: { height: 1, backgroundColor: '#2e4356', marginVertical: 14 },
  previewSectionTitle: { color: '#f8fafc', fontSize: 9, fontWeight: '900', marginBottom: 10 },
  previewTimeline: { flexDirection: 'row', gap: 10 },
  previewTimelineRail: { width: 12, alignItems: 'center', paddingTop: 3 },
  previewTimelineDot: { width: 8, height: 8, borderWidth: 2, borderColor: '#64748b', borderRadius: 5, backgroundColor: '#0f1d2c' },
  previewTimelineDotActive: { borderColor: KlippColors.teal, backgroundColor: KlippColors.teal },
  previewTimelineLine: { width: 1, height: 27, backgroundColor: '#64748b' },
  previewTimelineCopy: { flex: 1, gap: 3 },
  previewTimelineTitle: { color: '#f8fafc', fontSize: 8, fontWeight: '800' },
  previewTimelineDetail: { color: '#9babbc', fontSize: 7, lineHeight: 11, marginBottom: 7 },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2e4356' },
  previewFooterText: { color: '#b6c4d2', fontSize: 8, fontWeight: '700' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 42, height: 42, borderRadius: 12, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: KlippColors.teal },
  logoLetter: { color: KlippColors.white, fontSize: 23, fontWeight: '900' },
  brand: { color: KlippColors.navy, fontSize: 30, fontWeight: '900' },
  location: { color: KlippColors.muted, fontSize: 10, fontWeight: '700', marginTop: 5, letterSpacing: 0.5 },
  form: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 10, padding: 18, borderRadius: 10, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  loginForm: { maxWidth: 400, borderColor: '#35495d', backgroundColor: '#142638' },
  loginFormWide: { width: 360, alignSelf: 'auto', padding: 22 },
  eyebrow: { color: KlippColors.blue, fontSize: 11, fontWeight: '800', marginBottom: 2 },
  loginEyebrow: { color: '#a3e635' },
  title: { color: KlippColors.navy, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  loginTitle: { color: '#f8fafc' },
  subtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  loginSubtitle: { color: '#9babbc' },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700', marginTop: 5 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 7, paddingHorizontal: 14, color: KlippColors.navy, backgroundColor: KlippColors.white, fontSize: 15 },
  loginInput: { borderColor: '#41556a', color: '#f8fafc', backgroundColor: '#0f1d2c' },
  roleOptions: { flexDirection: 'row', gap: 10 },
  roleOption: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 7, backgroundColor: '#fff', paddingHorizontal: 8 },
  roleOptionSelected: { borderColor: KlippColors.blue, backgroundColor: '#EEF4FF' },
  roleText: { color: KlippColors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  roleTextSelected: { color: KlippColors.blueDark },
  error: { color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  notice: { color: '#067647', fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 52, marginTop: 8, borderRadius: 7, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center' },
  loginSubmit: { backgroundColor: '#a3e635' },
  submitDisabled: { backgroundColor: '#93B0FF' },
  submitPressed: { opacity: 0.85 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginSubmitText: { color: '#0f172a', fontWeight: '900' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' },
  switchText: { color: '#52615b', fontSize: 14 },
  loginSwitchText: { color: '#9babbc' },
  link: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  loginLink: { color: '#a3e635' },
});