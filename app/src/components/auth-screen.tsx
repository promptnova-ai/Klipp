import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
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
import { ScreenEntrance } from '@/components/ui-primitives';
import { KlippMark } from '@/components/klipp-mark';
import { KlippColors } from '@/theme/tokens';
import { normalizePhoneNumber } from '@/lib/phone';
import { heroArt } from '@/lib/service-art';
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
  const { width } = useWindowDimensions();
  const compactLogin = compact && !isRegister;
  const veryCompact = width < 375;
  const fullBleedRegister = compact && isRegister;
  return (
    <View style={[styles.showcase, compact && styles.showcaseCompact, compactLogin && styles.showcaseCompactLogin, fullBleedRegister && styles.showcaseRegisterHero, veryCompact && compactLogin && styles.showcaseCompactLoginTight]}>
      {(compactLogin || !compact) && <Image source={heroArt} cachePolicy="memory-disk" contentFit="cover" transition={350} style={styles.showcaseHeroImage} />}
      {(fullBleedRegister || compactLogin || !compact) && <View pointerEvents="none" style={[styles.showcasePhotoWash, compactLogin && styles.showcaseLoginPhotoWash]} />}
      <View style={[styles.showcaseCopy, veryCompact && compactLogin && styles.showcaseCopyTight]}>
        <Text style={[styles.showcaseKicker, (compactLogin || !compact) && styles.showcaseKickerOnPhoto, compactLogin && styles.showcaseKickerLogin]}>{compactLogin ? 'SERVICIOS A DOMICILIO, SIN COMPLICACIONES' : 'SERVICIOS A DOMICILIO'}</Text>
        <Text style={[styles.showcaseTitle, (compactLogin || !compact) && styles.showcaseTitleOnPhoto, compactLogin && styles.showcaseTitleLogin, veryCompact && styles.showcaseTitleLoginTight]}>{compactLogin ? 'Qué bueno tenerte de vuelta.' : 'Tu día, más fácil. Tu servicio, en buenas manos.'}</Text>
        <Text style={[styles.showcaseDescription, (compactLogin || !compact) && styles.showcaseDescriptionOnPhoto, compactLogin && styles.showcaseDescriptionLogin, veryCompact && styles.showcaseDescriptionLoginTight]}>
          {compactLogin ? 'Entra y gestiona tus servicios desde un solo lugar.' : 'Encuentra profesionales para limpieza, barbería, peluquería, estética, vehículos y mantenimiento.'}
        </Text>
        {compactLogin && (
          <View style={[styles.loginServiceShowcase, veryCompact && styles.loginServiceShowcaseTight]}>
            <View style={[styles.loginServiceCard, styles.loginServiceCardBlue, veryCompact && styles.loginServiceCardTight]}>
              <View style={styles.loginServiceGlyph}><SymbolView name={{ ios: 'scissors', android: 'content_cut', web: 'content_cut' }} tintColor={KlippColors.cobalt} size={22} /></View>
              <Text style={styles.loginServiceName}>Barbería</Text>
              <Text style={styles.loginServiceCaption}>En tu casa</Text>
            </View>
            <View style={[styles.loginServiceCard, styles.loginServiceCardCoral, veryCompact && styles.loginServiceCardTight]}>
              <View style={styles.loginServiceGlyph}><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={KlippColors.coral} size={22} /></View>
              <Text style={styles.loginServiceName}>Belleza</Text>
              <Text style={styles.loginServiceCaption}>A tu manera</Text>
            </View>
            <View style={[styles.loginServiceCard, styles.loginServiceCardMint, veryCompact && styles.loginServiceCardTight]}>
              <View style={styles.loginServiceGlyph}><SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={KlippColors.success} size={22} /></View>
              <Text style={styles.loginServiceName}>Hogar</Text>
              <Text style={styles.loginServiceCaption}>Sin moverte</Text>
            </View>
          </View>
        )}
        {!compactLogin && <View style={styles.showcaseHighlights}>
          {serviceHighlights.map((item) => (
            <View key={item.title} style={styles.showcaseHighlight}>
              <View style={[styles.showcaseHighlightIcon, (compactLogin || !compact) && styles.showcaseHighlightIconOnPhoto]}>
                <SymbolView name={item.icon} tintColor={KlippColors.cobalt} size={18} />
              </View>
              <View style={styles.showcaseHighlightCopy}>
                <Text style={[styles.showcaseHighlightTitle, (compactLogin || !compact) && styles.showcaseHighlightTitleOnPhoto]}>{item.title}</Text>
                <Text style={[styles.showcaseHighlightDetail, (compactLogin || !compact) && styles.showcaseHighlightDetailOnPhoto]}>{item.detail}</Text>
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
              <SymbolView name={{ ios: 'scissors', android: 'content_cut', web: 'content_cut' }} tintColor={KlippColors.cobalt} size={23} />
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
            <SymbolView name={{ ios: 'shield.lefthalf.filled', android: 'verified_user', web: 'verified_user' }} tintColor={KlippColors.cobalt} size={15} />
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
  const wide = width >= 1024;
  const router = useRouter();
  const { session, signIn, sendPhoneOtp, verifyPhoneOtp, authError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    if (authMethod === 'phone') {
      if (isRegister && !fullName.trim()) {
        setError('Escribe tu nombre para continuar.');
        return;
      }
      const phone = normalizePhoneNumber(phoneNumber);
      if (!phone) {
        setError('Introduce un número válido con código de país. Ejemplo: +1 809 555 0123.');
        return;
      }
      setBusy(true);
      try {
        if (!otpSent) {
          await sendPhoneOtp(phone, fullName.trim(), 'client', isRegister);
          setOtpSent(true);
          setNotice(`Enviamos un código de 6 dígitos a ${phone}.`);
          return;
        }
        if (!/^\d{6}$/.test(otp)) {
          setError('Introduce el código de 6 dígitos que recibiste por SMS.');
          return;
        }
        await verifyPhoneOtp(phone, otp);
        router.replace('/');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No pudimos completar la verificación del teléfono.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError('Introduce tu correo y contraseña para continuar.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos completar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  const submitDisabled = busy || !isSupabaseConfigured || (authMethod === 'phone'
    ? (otpSent ? otp.length !== 6 : !normalizePhoneNumber(phoneNumber) || (isRegister && !fullName.trim()))
    : !email.trim() || !password);

  const submitInactive = submitDisabled && !busy;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scrollContent, !wide && !isRegister && styles.loginScrollContent]} keyboardShouldPersistTaps="handled">
          <View style={[styles.authShell, !wide && !isRegister && styles.loginAuthShell]}>
            <View style={styles.topBar}>
              <View style={styles.brandRow}>
                <View style={styles.logoMark}><KlippMark size={36} /></View>
                <View style={styles.brandCopy}>
                  <Text style={styles.brand}>KLIPP</Text>
                  <Text style={styles.location}>SANTO DOMINGO, RD</Text>
                </View>
              </View>
              <View style={styles.trustNote}>
                <SymbolView name={{ ios: 'lock.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor={KlippColors.cobaltDark} size={15} />
                <Text style={styles.trustNoteText}>Acceso seguro</Text>
              </View>
            </View>

            <ScreenEntrance delay={30}>
              <View style={[styles.main, wide && !isRegister && styles.mainWide]}>
              {!isRegister && <AuthShowcase compact={!wide} isRegister={false} />}
              <View style={[styles.formCard, wide && styles.formCardWide, !wide && !isRegister && styles.formCardLogin]}>
                <Text style={styles.eyebrow}>{isRegister ? 'CREAR CUENTA · CLIENTE' : 'QUÉ BUENO VERTE'}</Text>
                <Text style={styles.title}>{isRegister ? 'Empieza con lo esencial.' : 'Inicia sesión'}</Text>
                <Text style={styles.subtitle}>
                  {isRegister
                    ? 'Un número de teléfono y estarás listo para reservar servicios en casa.'
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
                            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={role === 'client' ? KlippColors.cobalt : KlippColors.muted} size={19} />
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
                            <SymbolView name={{ ios: 'briefcase.fill', android: 'work', web: 'work' }} tintColor={KlippColors.coral} size={19} />
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

                {!isRegister && (
                  <View style={styles.authMethodTabs}>
                    <Pressable accessibilityRole="tab" accessibilityState={{ selected: authMethod === 'phone' }} onPress={() => { setAuthMethod('phone'); setOtpSent(false); setOtp(''); setError(null); setNotice(null); }} style={[styles.authMethodTab, authMethod === 'phone' && styles.authMethodTabActive]}>
                      <Text style={[styles.authMethodText, authMethod === 'phone' && styles.authMethodTextActive]}>Teléfono</Text>
                    </Pressable>
                    <Pressable accessibilityRole="tab" accessibilityState={{ selected: authMethod === 'email' }} onPress={() => { setAuthMethod('email'); setError(null); setNotice(null); }} style={[styles.authMethodTab, authMethod === 'email' && styles.authMethodTabActive]}>
                      <Text style={[styles.authMethodText, authMethod === 'email' && styles.authMethodTextActive]}>Correo</Text>
                    </Pressable>
                  </View>
                )}

                {authMethod === 'phone' ? (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Número de teléfono</Text>
                      <TextInput accessibilityLabel="Número de teléfono" autoComplete="tel" keyboardType="phone-pad" onChangeText={(value) => { setPhoneNumber(value); setOtpSent(false); setOtp(''); setNotice(null); }} placeholder="+1 809 555 0123" placeholderTextColor={KlippColors.muted} style={styles.input} value={phoneNumber} editable={!otpSent} />
                    </View>
                                        {otpSent && (
                      <View style={styles.field}>
                        <Text style={styles.label}>Código de verificación</Text>
                        <TextInput accessibilityLabel="Código SMS de seis dígitos" autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="······" placeholderTextColor={KlippColors.muted} style={styles.otpInput} value={otp} />
                        <Pressable accessibilityRole="button" onPress={() => { setOtpSent(false); setOtp(''); setNotice(null); }} style={styles.resendLink}>
                          <Text style={styles.link}>Cambiar número</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Correo electrónico</Text>
                      <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="nombre@correo.com" placeholderTextColor={KlippColors.muted} style={styles.input} value={email} />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.label}>Contraseña</Text>
                      <View style={styles.passwordInputWrap}>
                        <TextInput autoComplete="current-password" onChangeText={setPassword} placeholder="Tu contraseña" placeholderTextColor={KlippColors.muted} secureTextEntry={!showPassword} style={styles.passwordInput} value={password} />
                        <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} hitSlop={10} onPress={() => setShowPassword((visible) => !visible)} style={styles.passwordToggle}>
                          <SymbolView name={showPassword ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'eye', android: 'visibility', web: 'visibility' }} tintColor={KlippColors.muted} size={19} />
                        </Pressable>
                      </View>
                    </View>
                  </>
                )}

                {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                {authError && <Text accessibilityRole="alert" style={styles.error}>{authError}</Text>}
                {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

                <Pressable
                  accessibilityRole="button"
                  disabled={submitDisabled}
                  onPress={() => void handleSubmit()}
                  style={({ pressed }) => [
                    styles.submit,
                    submitInactive && styles.submitDisabled,
                    pressed && !busy && styles.submitPressed,
                  ]}>
                  {busy
                    ? <ActivityIndicator color={KlippColors.white} />
                    : <Text style={[styles.submitText, submitInactive && styles.submitTextDisabled]}>{authMethod === 'phone' ? (otpSent ? 'Verificar y continuar' : 'Enviar código') : 'Entrar'}</Text>}
                  {!busy && <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor={submitInactive ? KlippColors.muted : KlippColors.white} size={17} />}
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
  safeArea: { flex: 1, backgroundColor: KlippColors.ivory },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 28 },
  loginScrollContent: { paddingHorizontal: 16, paddingVertical: 12 },
  loginAuthShell: { gap: 12 },
  authShell: { width: '100%', maxWidth: 1200, alignSelf: 'center', gap: 22 },
  topBar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  passwordInputWrap: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white },
  passwordInput: { flex: 1, minWidth: 0, minHeight: 54, color: KlippColors.ink, fontSize: 15 },
  passwordToggle: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  brandCopy: { gap: 1 },
  brand: { color: KlippColors.ink, fontSize: 22, fontWeight: '900', letterSpacing: 1.1 },
  location: { color: KlippColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  trustNote: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: KlippColors.surfaceMint },
  trustNoteText: { color: KlippColors.cobaltDark, fontSize: 11, fontWeight: '700' },
  main: { gap: 18 },
  mainWide: { flexDirection: 'row', alignItems: 'stretch', gap: 24 },
  showcase: { width: '100%', flex: 1, minWidth: 0, minHeight: 620, flexDirection: 'row', alignItems: 'stretch', gap: 20, padding: 32, borderWidth: 0, borderColor: KlippColors.border, borderRadius: 26, backgroundColor: KlippColors.surfaceBlue, overflow: 'hidden', shadowColor: KlippColors.ink, shadowOpacity: 0.035, shadowOffset: { width: 0, height: 10 }, shadowRadius: 24, elevation: 2 },
  showcaseCompact: { flexDirection: 'column', padding: 22 },
  showcaseRegisterHero: { minHeight: 300, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 26, borderWidth: 0, padding: 22, backgroundColor: KlippColors.border },
  showcaseHeroImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  showcasePhotoWash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,18,34,0.62)', borderRadius: 26 },
  showcaseKickerOnPhoto: { color: KlippColors.mint },
  showcaseTitleOnPhoto: { color: KlippColors.white },
  showcaseDescriptionOnPhoto: { color: 'rgba(255,255,255,0.9)' },
  showcaseHighlightIconOnPhoto: { backgroundColor: 'rgba(255,255,255,0.94)' },
  showcaseHighlightTitleOnPhoto: { color: KlippColors.white },
  showcaseHighlightDetailOnPhoto: { color: 'rgba(255,255,255,0.78)' },
  showcaseCompactLogin: { minHeight: 270, justifyContent: 'flex-end', padding: 20, borderRadius: 24, borderColor: 'transparent', backgroundColor: KlippColors.darkCanvas, shadowOpacity: 0, elevation: 0 },
  showcaseCompactLoginTight: { minHeight: 244, padding: 16 },
  showcaseCopyTight: { gap: 9 },
  showcaseTitleLoginTight: { fontSize: 26, lineHeight: 30 },
  showcaseDescriptionLoginTight: { fontSize: 13, lineHeight: 19 },
  loginServiceShowcaseTight: { gap: 6, marginTop: 2 },
  loginServiceCardTight: { minHeight: 58, padding: 7 },
  showcaseLoginPhotoWash: { backgroundColor: 'rgba(10,18,34,0.66)' },
  
  
  showcaseKickerLogin: { color: KlippColors.coral, fontSize: 9, lineHeight: 14 },
  showcaseTitleLogin: { color: KlippColors.white, fontSize: 28, lineHeight: 33, maxWidth: 390 },
  showcaseDescriptionLogin: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 21, maxWidth: 390 },
  loginServiceShowcase: { flexDirection: 'row', gap: 8, marginTop: 6 },
  loginServiceCard: { flex: 1, minWidth: 0, minHeight: 64, padding: 8, borderRadius: 13, justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', backgroundColor: 'rgba(255,255,255,0.94)' },
  loginServiceCardBlue: { backgroundColor: 'rgba(255,255,255,0.94)' },
  loginServiceCardCoral: { backgroundColor: 'rgba(255,247,244,0.96)' },
  loginServiceCardMint: { backgroundColor: 'rgba(243,251,247,0.96)' },
  loginServiceGlyph: { width: 32, height: 32, borderRadius: 11, backgroundColor: KlippColors.ivory, alignItems: 'center', justifyContent: 'center' },
  loginServiceName: { color: KlippColors.ink, fontSize: 11, fontWeight: '900', marginTop: 7 },
  loginServiceCaption: { color: KlippColors.muted, fontSize: 9, marginTop: 1 },
  showcaseCopy: { flex: 1, minWidth: 0, gap: 13, justifyContent: 'center' },
  showcaseKicker: { color: KlippColors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  showcaseTitle: { color: KlippColors.ink, fontSize: 30, lineHeight: 37, fontWeight: '900', maxWidth: 470, letterSpacing: -0.7 },
  showcaseDescription: { color: KlippColors.slate, fontSize: 14, lineHeight: 22, maxWidth: 470 },
  showcaseHighlights: { gap: 12, marginTop: 8 },
  showcaseHighlight: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  showcaseHighlightIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: KlippColors.surfaceMint },
  showcaseHighlightCopy: { flex: 1, gap: 2 },
  showcaseHighlightTitle: { color: KlippColors.ink, fontSize: 12, fontWeight: '800' },
  showcaseHighlightDetail: { color: KlippColors.muted, fontSize: 11, lineHeight: 15 },
  bookingPreview: { width: 230, alignSelf: 'center', padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 20, backgroundColor: KlippColors.surfaceMuted },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  previewEyebrow: { color: KlippColors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  previewLive: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: KlippColors.surfaceMint },
  previewLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: KlippColors.cobalt },
  previewLiveText: { color: KlippColors.cobaltDark, fontSize: 7, fontWeight: '900' },
  previewService: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  previewServiceIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: KlippColors.surfaceBlue },
  previewServiceCopy: { flex: 1, gap: 3 },
  previewServiceTitle: { color: KlippColors.ink, fontSize: 10, fontWeight: '900' },
  previewServiceDetail: { color: KlippColors.muted, fontSize: 8 },
  previewDivider: { height: 1, backgroundColor: KlippColors.border, marginVertical: 15 },
  previewSectionTitle: { color: KlippColors.ink, fontSize: 10, fontWeight: '900', marginBottom: 11 },
  previewTimeline: { flexDirection: 'row', gap: 10 },
  previewTimelineRail: { width: 12, alignItems: 'center', paddingTop: 3 },
  previewTimelineDot: { width: 8, height: 8, borderWidth: 2, borderColor: KlippColors.muted, borderRadius: 5, backgroundColor: KlippColors.surfaceMuted },
  previewTimelineDotActive: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.cobalt },
  previewTimelineLine: { width: 1, height: 28, backgroundColor: KlippColors.border },
  previewTimelineCopy: { flex: 1, gap: 3 },
  previewTimelineTitle: { color: KlippColors.ink, fontSize: 9, fontWeight: '800' },
  previewTimelineDetail: { color: KlippColors.muted, fontSize: 8, lineHeight: 12, marginBottom: 7 },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: KlippColors.border },
  previewFooterText: { color: KlippColors.slate, fontSize: 8, fontWeight: '700' },
  formCard: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16, padding: 30, borderWidth: 1, borderColor: KlippColors.surfaceMuted, borderRadius: 30, backgroundColor: KlippColors.white, shadowColor: KlippColors.ink, shadowOpacity: 0.075, shadowOffset: { width: 0, height: 16 }, shadowRadius: 30, elevation: 4 },
  formCardWide: { width: 430, alignSelf: 'center', padding: 28 },
  formCardLogin: { padding: 22, gap: 12, borderRadius: 24 },
  eyebrow: { color: KlippColors.cobaltDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: KlippColors.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: KlippColors.muted, fontSize: 14, lineHeight: 21, marginBottom: 5 },
  configNotice: { gap: 5, padding: 13, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14, backgroundColor: KlippColors.surfaceBlue },
  configNoticeTitle: { color: KlippColors.ink, fontSize: 12, fontWeight: '900' },
  configNoticeText: { color: KlippColors.slate, fontSize: 11, lineHeight: 16 },
  authMethodTabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: KlippColors.surfaceMuted },
  authMethodTab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  authMethodTabActive: { backgroundColor: KlippColors.white, shadowColor: KlippColors.ink, shadowOpacity: 0.07, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  authMethodText: { color: KlippColors.muted, fontSize: 12, fontWeight: '700' },
  authMethodTextActive: { color: KlippColors.ink, fontWeight: '900' },
  otpInput: { minHeight: 64, paddingHorizontal: 18, borderWidth: 1, borderColor: KlippColors.cobalt, borderRadius: 16, backgroundColor: KlippColors.surfaceBlue, color: KlippColors.ink, fontSize: 25, fontWeight: '900', letterSpacing: 9, textAlign: 'center' },
  resendLink: { alignSelf: 'flex-start', paddingVertical: 5 },
  field: { gap: 7 },
  label: { color: KlippColors.slate, fontSize: 12, fontWeight: '800' },
  input: { minHeight: 56, paddingHorizontal: 16, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white, color: KlippColors.ink, fontSize: 15 },
  roleOptions: { gap: 9 },
  roleOption: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white },
  roleOptionSelected: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.surfaceBlue },
  roleIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: KlippColors.surfaceMuted },
  roleIconSelected: { backgroundColor: KlippColors.surfaceBlue },
  roleCopy: { flex: 1, gap: 3 },
  roleTitle: { color: KlippColors.ink, fontSize: 13, fontWeight: '800' },
  roleTitleSelected: { color: KlippColors.cobaltDark },
  roleDescription: { color: KlippColors.muted, fontSize: 11, lineHeight: 15 },
  radio: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: KlippColors.border, borderRadius: 99 },
  radioSelected: { borderColor: KlippColors.cobalt },
  radioDot: { width: 9, height: 9, borderRadius: 99, backgroundColor: KlippColors.cobalt },
  error: { padding: 12, borderWidth: 1, borderColor: KlippColors.coral, borderRadius: 13, backgroundColor: KlippColors.surfaceCoral, color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  notice: { padding: 12, borderWidth: 1, borderColor: KlippColors.mint, borderRadius: 13, backgroundColor: KlippColors.surfaceMint, color: KlippColors.cobaltDark, fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 5, borderRadius: 16, backgroundColor: KlippColors.cobalt },
  submitDisabled: { backgroundColor: KlippColors.surfaceMuted },
  submitTextDisabled: { color: KlippColors.muted },
  submitPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  submitText: { color: KlippColors.white, fontSize: 14, fontWeight: '900' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  switchText: { color: KlippColors.muted, fontSize: 12 },
  link: { color: KlippColors.cobaltDark, fontSize: 12, fontWeight: '900' },
  legalNote: { color: KlippColors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 2 },
});
