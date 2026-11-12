import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
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
import { ScreenEntrance } from '@/components/ui-primitives';
import { KlippColors } from '@/lib/brand';
import type { ExtractRole } from '@/lib/types';
import { isSupabaseConfigured } from '../../lib/supabase';

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

function AuthShowcase({ compact, isRegister }: { compact: boolean; isRegister: boolean }) {
  const compactLogin = compact && !isRegister;
  const fullBleedRegister = compact && isRegister;
  return (
    <ImageBackground
      source={fullBleedRegister ? { uri: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85' } : undefined}
      resizeMode="cover"
      imageStyle={styles.showcaseImage}
      style={[styles.showcase, compact && styles.showcaseCompact, compactLogin && styles.showcaseCompactLogin, fullBleedRegister && styles.showcaseRegisterHero]}>
      <View style={styles.showcaseCopy}>
        <View style={styles.showcaseBrandLine}>
          <View style={[styles.showcaseMark, compactLogin && styles.showcaseMarkLogin]}><Text style={styles.showcaseMarkLetter}>K</Text></View>
          <Text style={[styles.showcaseBrand, compactLogin && styles.showcaseBrandLogin]}>KLIPP</Text>
          <Text style={[styles.showcaseRegion, compactLogin && styles.showcaseRegionLogin]}>SANTO DOMINGO · RD</Text>
        </View>
        <Text style={[styles.showcaseKicker, compactLogin && styles.showcaseKickerLogin]}>{compactLogin ? 'SERVICIOS A DOMICILIO, SIN COMPLICACIONES' : 'SERVICIOS A DOMICILIO'}</Text>
        <Text style={[styles.showcaseTitle, compactLogin && styles.showcaseTitleLogin]}>{compactLogin ? 'Qué bueno tenerte de vuelta.' : 'Tu día, más fácil. Tu servicio, en buenas manos.'}</Text>
        <Text style={[styles.showcaseDescription, compactLogin && styles.showcaseDescriptionLogin]}>
          {compactLogin ? 'Entra y gestiona tus servicios desde un solo lugar.' : 'Encuentra profesionales para limpieza, barbería, peluquería, estética, vehículos y mantenimiento.'}
        </Text>
        {compactLogin && (
          <View style={styles.loginServiceShowcase}>
            <View style={[styles.loginServiceCard, styles.loginServiceCardBlue]}>
              <View style={styles.loginServiceGlyph}><SymbolView name={{ ios: 'scissors', android: 'content_cut', web: 'content_cut' }} tintColor={KlippColors.cobalt} size={22} /></View>
              <Text style={styles.loginServiceName}>Barbería</Text>
              <Text style={styles.loginServiceCaption}>En tu casa</Text>
            </View>
            <View style={[styles.loginServiceCard, styles.loginServiceCardCoral]}>
              <View style={styles.loginServiceGlyph}><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={KlippColors.coral} size={22} /></View>
              <Text style={styles.loginServiceName}>Belleza</Text>
              <Text style={styles.loginServiceCaption}>A tu manera</Text>
            </View>
            <View style={[styles.loginServiceCard, styles.loginServiceCardMint]}>
              <View style={styles.loginServiceGlyph}><SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={KlippColors.success} size={22} /></View>
              <Text style={styles.loginServiceName}>Hogar</Text>
              <Text style={styles.loginServiceCaption}>Sin moverte</Text>
            </View>
          </View>
        )}
        {!compactLogin && <View style={styles.showcaseHighlights}>
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
        </View>}
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
      {fullBleedRegister && <View pointerEvents="none" style={styles.showcasePhotoWash} />}
    </ImageBackground>
  );
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const isRegister = mode === 'register';
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
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
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.authShell}>
            <View style={styles.topBar}>
              <View style={styles.brandRow}>
                <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
                <View style={styles.brandCopy}>
                  <Text style={styles.brand}>KLIPP</Text>
                  <Text style={styles.location}>SANTO DOMINGO, RD</Text>
                </View>
              </View>
              <View style={styles.trustNote}>
                <SymbolView name={{ ios: 'lock.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor={KlippColors.tealDark} size={15} />
                <Text style={styles.trustNoteText}>Acceso seguro</Text>
              </View>
            </View>

            <ScreenEntrance delay={30}>
              <View style={[styles.main, wide && styles.mainWide]}>
              <AuthShowcase compact={!wide} isRegister={isRegister} />
              <View style={[styles.formCard, wide && styles.formCardWide]}>
                <Text style={styles.eyebrow}>{isRegister ? 'ÚNETE A KLIPP' : 'QUÉ BUENO VERTE'}</Text>
                <Text style={styles.title}>{isRegister ? 'Crea tu cuenta' : 'Inicia sesión'}</Text>
                <Text style={styles.subtitle}>
                  {isRegister
                    ? 'Configura tu acceso para reservar servicios de profesionales de confianza.'
                    : 'Entra en tu cuenta y continúa donde lo dejaste.'}
                </Text>

                {!isSupabaseConfigured && (
                  <View style={styles.configNotice}>
                    <Text style={styles.configNoticeTitle}>Vista previa de Klipp</Text>
                    <Text style={styles.configNoticeText}>La interfaz está disponible, pero el acceso a cuentas y los datos reales se activarán al conectar el proyecto Supabase.</Text>
                  </View>
                )}

                {isRegister && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Nombre completo</Text>
                      <TextInput
                        autoComplete="name"
                        autoCapitalize="words"
                        onChangeText={setFullName}
                        placeholder="Tu nombre y apellido"
                        placeholderTextColor={KlippColors.muted}
                        style={styles.input}
                        value={fullName}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.label}>¿Cómo usarás Klipp?</Text>
                      <View style={styles.roleOptions}>
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ selected: role === 'client' }}
                          onPress={() => setRole('client')}
                          style={[styles.roleOption, role === 'client' && styles.roleOptionSelected]}>
                          <View style={[styles.roleIcon, role === 'client' && styles.roleIconSelected]}>
                            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={role === 'client' ? KlippColors.blue : KlippColors.muted} size={19} />
                          </View>
                          <View style={styles.roleCopy}>
                            <Text style={[styles.roleTitle, role === 'client' && styles.roleTitleSelected]}>Quiero contratar</Text>
                            <Text style={styles.roleDescription}>Buscar y reservar servicios</Text>
                          </View>
                          <View style={[styles.radio, role === 'client' && styles.radioSelected]}>
                            {role === 'client' && <View style={styles.radioDot} />}
                          </View>
                        </Pressable>
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ selected: false }}
                          onPress={() => router.push('/(auth)/pro-register')}
                          style={styles.roleOption}>
                          <View style={styles.roleIcon}>
                            <SymbolView name={{ ios: 'briefcase.fill', android: 'work', web: 'work' }} tintColor={KlippColors.teal} size={19} />
                          </View>
                          <View style={styles.roleCopy}>
                            <Text style={styles.roleTitle}>Soy profesional</Text>
                            <Text style={styles.roleDescription}>Ofrecer mis servicios</Text>
                          </View>
                          <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={KlippColors.muted} size={16} />
                        </Pressable>
                      </View>
                    </View>
                  </>
                )}

                <View style={styles.field}>
                  <Text style={styles.label}>Correo electrónico</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="nombre@correo.com"
                    placeholderTextColor={KlippColors.muted}
                    style={styles.input}
                    value={email}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Contraseña</Text>
                  <TextInput
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    onChangeText={setPassword}
                    placeholder={isRegister ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                    placeholderTextColor={KlippColors.muted}
                    secureTextEntry
                    style={styles.input}
                    value={password}
                  />
                </View>

                {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                {authError && <Text accessibilityRole="alert" style={styles.error}>{authError}</Text>}
                {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !email.trim() || !password || !isSupabaseConfigured}
                  onPress={() => void handleSubmit()}
                  style={({ pressed }) => [
                    styles.submit,
                    (busy || !email.trim() || !password || !isSupabaseConfigured) && styles.submitDisabled,
                    pressed && !busy && styles.submitPressed,
                  ]}>
                  {busy
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.submitText}>{isRegister ? 'Crear cuenta' : 'Entrar'}</Text>}
                  {!busy && <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor="#FFFFFF" size={17} />}
                </Pressable>

                <View style={styles.switchRow}>
                  <Text style={styles.switchText}>{isRegister ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}</Text>
                  <Link href={isRegister ? '/(auth)/login' : '/(auth)/register'} asChild>
                    <Text style={styles.link}>{isRegister ? 'Inicia sesión' : 'Regístrate'}</Text>
                  </Link>
                </View>
                <Text style={styles.legalNote}>Al continuar, aceptas las condiciones de uso y la política de privacidad de Klipp.</Text>
              </View>
              </View>
            </ScreenEntrance>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: KlippColors.canvas },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  authShell: { width: '100%', maxWidth: 1200, alignSelf: 'center', gap: 22 },
  topBar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: KlippColors.navy, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { color: KlippColors.white, fontSize: 23, fontWeight: '900' },
  brandCopy: { gap: 1 },
  brand: { color: KlippColors.navy, fontSize: 22, fontWeight: '900', letterSpacing: 1.1 },
  location: { color: KlippColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  trustNote: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: KlippColors.whiteMint },
  trustNoteText: { color: KlippColors.cobaltDark, fontSize: 11, fontWeight: '700' },
  main: { gap: 18 },
  mainWide: { flexDirection: 'row', alignItems: 'stretch', gap: 24 },
  showcase: { width: '100%', flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', gap: 20, padding: 28, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 26, backgroundColor: KlippColors.white, shadowColor: KlippColors.ink, shadowOpacity: 0.035, shadowOffset: { width: 0, height: 10 }, shadowRadius: 24, elevation: 2 },
  showcaseCompact: { flexDirection: 'column', padding: 22 },
  showcaseImage: { borderRadius: 26 },
  showcaseRegisterHero: { minHeight: 300, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 26, borderWidth: 0, padding: 22, backgroundColor: '#D9E2DF' },
  showcasePhotoWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(247,245,240,0.74)', borderRadius: 26 },
  showcaseCompactLogin: { padding: 30, borderRadius: 30, borderColor: '#DCE3FF', backgroundColor: '#E9EDFF', shadowOpacity: 0, elevation: 0 },
  showcaseMarkLogin: { backgroundColor: KlippColors.cobalt },
  showcaseBrandLogin: { color: KlippColors.ink },
  showcaseRegionLogin: { color: KlippColors.cobaltDark },
  showcaseKickerLogin: { color: KlippColors.coral, fontSize: 9, lineHeight: 14 },
  showcaseTitleLogin: { color: KlippColors.ink, fontSize: 29, lineHeight: 35, maxWidth: 360 },
  showcaseDescriptionLogin: { color: '#555D78', fontSize: 13, lineHeight: 20 },
  loginServiceShowcase: { flexDirection: 'row', gap: 8, marginTop: 7 },
  loginServiceCard: { flex: 1, minWidth: 0, minHeight: 92, padding: 10, borderRadius: 16, justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(23,27,45,0.06)' },
  loginServiceCardBlue: { backgroundColor: '#FFFFFF' },
  loginServiceCardCoral: { backgroundColor: '#FFF7F4' },
  loginServiceCardMint: { backgroundColor: '#F3FBF7' },
  loginServiceGlyph: { width: 32, height: 32, borderRadius: 11, backgroundColor: '#F7F5F0', alignItems: 'center', justifyContent: 'center' },
  loginServiceName: { color: KlippColors.ink, fontSize: 11, fontWeight: '900', marginTop: 7 },
  loginServiceCaption: { color: KlippColors.muted, fontSize: 9, marginTop: 1 },
  showcaseCopy: { flex: 1, minWidth: 0, gap: 13, justifyContent: 'center' },
  showcaseBrandLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  showcaseMark: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: KlippColors.blue },
  showcaseMarkLetter: { color: KlippColors.white, fontSize: 17, fontWeight: '900' },
  showcaseBrand: { color: KlippColors.navy, fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  showcaseRegion: { color: KlippColors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.7, marginLeft: 'auto' },
  showcaseKicker: { color: KlippColors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  showcaseTitle: { color: KlippColors.navy, fontSize: 30, lineHeight: 37, fontWeight: '900', maxWidth: 470, letterSpacing: -0.7 },
  showcaseDescription: { color: KlippColors.slate, fontSize: 14, lineHeight: 22, maxWidth: 470 },
  showcaseHighlights: { gap: 12, marginTop: 8 },
  showcaseHighlight: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  showcaseHighlightIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: KlippColors.whiteMint },
  showcaseHighlightCopy: { flex: 1, gap: 2 },
  showcaseHighlightTitle: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  showcaseHighlightDetail: { color: KlippColors.muted, fontSize: 11, lineHeight: 15 },
  bookingPreview: { width: 230, alignSelf: 'center', padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 20, backgroundColor: KlippColors.whiteMuted },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  previewEyebrow: { color: KlippColors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  previewLive: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: KlippColors.whiteMint },
  previewLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: KlippColors.teal },
  previewLiveText: { color: KlippColors.cobaltDark, fontSize: 7, fontWeight: '900' },
  previewService: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  previewServiceIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: KlippColors.surfaceBlue },
  previewServiceCopy: { flex: 1, gap: 3 },
  previewServiceTitle: { color: KlippColors.navy, fontSize: 10, fontWeight: '900' },
  previewServiceDetail: { color: KlippColors.muted, fontSize: 8 },
  previewDivider: { height: 1, backgroundColor: KlippColors.border, marginVertical: 15 },
  previewSectionTitle: { color: KlippColors.navy, fontSize: 10, fontWeight: '900', marginBottom: 11 },
  previewTimeline: { flexDirection: 'row', gap: 10 },
  previewTimelineRail: { width: 12, alignItems: 'center', paddingTop: 3 },
  previewTimelineDot: { width: 8, height: 8, borderWidth: 2, borderColor: KlippColors.muted, borderRadius: 5, backgroundColor: KlippColors.whiteMuted },
  previewTimelineDotActive: { borderColor: KlippColors.teal, backgroundColor: KlippColors.teal },
  previewTimelineLine: { width: 1, height: 28, backgroundColor: KlippColors.border },
  previewTimelineCopy: { flex: 1, gap: 3 },
  previewTimelineTitle: { color: KlippColors.navy, fontSize: 9, fontWeight: '800' },
  previewTimelineDetail: { color: KlippColors.muted, fontSize: 8, lineHeight: 12, marginBottom: 7 },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: KlippColors.border },
  previewFooterText: { color: KlippColors.slate, fontSize: 8, fontWeight: '700' },
  formCard: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16, padding: 30, borderWidth: 1, borderColor: '#EAE7E0', borderRadius: 30, backgroundColor: KlippColors.white, shadowColor: KlippColors.ink, shadowOpacity: 0.075, shadowOffset: { width: 0, height: 16 }, shadowRadius: 30, elevation: 4 },
  formCardWide: { width: 430, alignSelf: 'auto', padding: 28 },
  eyebrow: { color: KlippColors.blueDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: KlippColors.navy, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: KlippColors.muted, fontSize: 14, lineHeight: 21, marginBottom: 5 },
  configNotice: { gap: 5, padding: 13, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14, backgroundColor: KlippColors.surfaceBlue },
  configNoticeTitle: { color: KlippColors.navy, fontSize: 12, fontWeight: '900' },
  configNoticeText: { color: KlippColors.slate, fontSize: 11, lineHeight: 16 },
  field: { gap: 7 },
  label: { color: KlippColors.slate, fontSize: 12, fontWeight: '800' },
  input: { minHeight: 56, paddingHorizontal: 16, borderWidth: 1, borderColor: '#DFE1E8', borderRadius: 16, backgroundColor: '#FCFCFD', color: KlippColors.ink, fontSize: 15 },
  roleOptions: { gap: 9 },
  roleOption: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white },
  roleOptionSelected: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.surfaceBlue },
  roleIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: KlippColors.whiteMuted },
  roleIconSelected: { backgroundColor: KlippColors.surfaceBlue },
  roleCopy: { flex: 1, gap: 3 },
  roleTitle: { color: KlippColors.navy, fontSize: 13, fontWeight: '800' },
  roleTitleSelected: { color: KlippColors.blueDark },
  roleDescription: { color: KlippColors.muted, fontSize: 11, lineHeight: 15 },
  radio: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: KlippColors.border, borderRadius: 99 },
  radioSelected: { borderColor: KlippColors.blue },
  radioDot: { width: 9, height: 9, borderRadius: 99, backgroundColor: KlippColors.blue },
  error: { padding: 12, borderWidth: 1, borderColor: KlippColors.coral, borderRadius: 13, backgroundColor: KlippColors.whiteCoral, color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  notice: { padding: 12, borderWidth: 1, borderColor: KlippColors.mint, borderRadius: 13, backgroundColor: KlippColors.whiteMint, color: KlippColors.cobaltDark, fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 5, borderRadius: 16, backgroundColor: KlippColors.blue },
  submitDisabled: { opacity: 0.5 },
  submitPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  submitText: { color: KlippColors.white, fontSize: 14, fontWeight: '900' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  switchText: { color: KlippColors.muted, fontSize: 12 },
  link: { color: KlippColors.blueDark, fontSize: 12, fontWeight: '900' },
  legalNote: { color: KlippColors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 2 },
});
