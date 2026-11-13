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
import { KlippMark } from '@/components/klipp-mark';
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
      source={{ uri: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=88' }}
      resizeMode="cover"
      imageStyle={styles.showcaseImage}
      style={[styles.showcase, compact && styles.showcaseCompact, compactLogin && styles.showcaseCompactLogin, fullBleedRegister && styles.showcaseRegisterHero]}>
      {(fullBleedRegister || compactLogin || !compact) && <View pointerEvents="none" style={[styles.showcasePhotoWash, compactLogin && styles.showcaseLoginPhotoWash]} />}
      <View style={styles.showcaseCopy}>
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
    </ImageBackground>
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
  const [phonePrefix, setPhonePrefix] = useState('809');
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
      if (!/^\d{7}$/.test(phoneNumber)) {
        setError('Introduce los 7 dígitos de tu número dominicano.');
        return;
      }
      const phone = `+1${phonePrefix}${phoneNumber}`;
      setBusy(true);
      try {
        if (!otpSent) {
          await sendPhoneOtp(phone, fullName.trim(), 'client', isRegister);
          setOtpSent(true);
          setNotice(`Enviamos un código de 6 dígitos a +1 ${phonePrefix} ${phoneNumber}.`);
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
    ? (otpSent ? otp.length !== 6 : phoneNumber.length !== 7 || (isRegister && !fullName.trim()))
    : !email.trim() || !password);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
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
                <SymbolView name={{ ios: 'lock.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor={KlippColors.tealDark} size={15} />
                <Text style={styles.trustNoteText}>Acceso seguro</Text>
              </View>
            </View>

            <ScreenEntrance delay={30}>
              <View style={[styles.main, wide && styles.mainWide]}>
              <AuthShowcase compact={!wide} isRegister={isRegister} />
              <View style={[styles.formCard, wide && styles.formCardWide, !wide && !isRegister && styles.formCardLogin]}>
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
                        placeholderTextColor="#8A94A6"
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
                      <Text style={styles.label}>Número dominicano</Text>
                      <View style={styles.phonePrefixList}>
                        {['809', '829', '849'].map((prefix) => (
                          <Pressable key={prefix} accessibilityRole="radio" accessibilityState={{ selected: phonePrefix === prefix }} onPress={() => { setPhonePrefix(prefix); setOtpSent(false); setOtp(''); setNotice(null); }} style={[styles.phonePrefixOption, phonePrefix === prefix && styles.phonePrefixSelected]}>
                            <Text style={[styles.phonePrefixText, phonePrefix === prefix && styles.phonePrefixTextSelected]}>+1 {prefix}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <TextInput accessibilityLabel="Siete dígitos del teléfono dominicano" autoComplete="tel-national" keyboardType="phone-pad" maxLength={7} onChangeText={(value) => { setPhoneNumber(value.replace(/\D/g, '').slice(0, 7)); setOtpSent(false); setOtp(''); setNotice(null); }} placeholder="555 0123" placeholderTextColor={KlippColors.muted} style={styles.input} value={phoneNumber} />
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
                    submitDisabled && styles.submitDisabled,
                    pressed && !busy && styles.submitPressed,
                  ]}>
                  {busy
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.submitText}>{authMethod === 'phone' ? (otpSent ? 'Verificar y continuar' : 'Enviar código') : 'Entrar'}</Text>}
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
  loginScrollContent: { paddingHorizontal: 16, paddingVertical: 12 },
  loginAuthShell: { gap: 12 },
  authShell: { width: '100%', maxWidth: 1200, alignSelf: 'center', gap: 22 },
  topBar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  passwordInputWrap: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, borderWidth: 1, borderColor: '#DFE1E8', borderRadius: 16, backgroundColor: '#FCFCFD' },
  passwordInput: { flex: 1, minWidth: 0, minHeight: 54, color: KlippColors.ink, fontSize: 15 },
  passwordToggle: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  logoLetter: { color: KlippColors.white, fontSize: 23, fontWeight: '900' },
  brandCopy: { gap: 1 },
  brand: { color: KlippColors.navy, fontSize: 22, fontWeight: '900', letterSpacing: 1.1 },
  location: { color: KlippColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  trustNote: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: KlippColors.whiteMint },
  trustNoteText: { color: KlippColors.cobaltDark, fontSize: 11, fontWeight: '700' },
  main: { gap: 18 },
  mainWide: { flexDirection: 'row', alignItems: 'stretch', gap: 24 },
  showcase: { width: '100%', flex: 1, minWidth: 0, minHeight: 620, flexDirection: 'row', alignItems: 'stretch', gap: 20, padding: 32, borderWidth: 0, borderColor: KlippColors.border, borderRadius: 26, backgroundColor: '#D9E2DF', overflow: 'hidden', shadowColor: KlippColors.ink, shadowOpacity: 0.035, shadowOffset: { width: 0, height: 10 }, shadowRadius: 24, elevation: 2 },
  showcaseCompact: { flexDirection: 'column', padding: 22 },
  showcaseImage: { borderRadius: 26 },
  showcaseRegisterHero: { minHeight: 300, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 26, borderWidth: 0, padding: 22, backgroundColor: '#D9E2DF' },
  showcasePhotoWash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(247,245,240,0.74)', borderRadius: 26 },
  showcaseCompactLogin: { minHeight: 270, justifyContent: 'flex-end', padding: 20, borderRadius: 24, borderColor: 'transparent', backgroundColor: '#18233A', shadowOpacity: 0, elevation: 0 },
  showcaseLoginPhotoWash: { backgroundColor: 'rgba(10,18,34,0.58)' },
  showcaseMarkLogin: { backgroundColor: 'transparent' },
  showcaseBrandLogin: { color: '#FFFFFF' },
  showcaseRegionLogin: { color: 'rgba(255,255,255,0.78)' },
  
  
  showcaseKickerLogin: { color: '#FFD0A8', fontSize: 9, lineHeight: 14 },
  showcaseTitleLogin: { color: '#FFFFFF', fontSize: 28, lineHeight: 33, maxWidth: 390 },
  showcaseDescriptionLogin: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 21, maxWidth: 390 },
  loginServiceShowcase: { flexDirection: 'row', gap: 8, marginTop: 6 },
  loginServiceCard: { flex: 1, minWidth: 0, minHeight: 64, padding: 8, borderRadius: 13, justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', backgroundColor: 'rgba(255,255,255,0.94)' },
  loginServiceCardBlue: { backgroundColor: 'rgba(255,255,255,0.94)' },
  loginServiceCardCoral: { backgroundColor: 'rgba(255,247,244,0.96)' },
  loginServiceCardMint: { backgroundColor: 'rgba(243,251,247,0.96)' },
  loginServiceGlyph: { width: 32, height: 32, borderRadius: 11, backgroundColor: '#F7F5F0', alignItems: 'center', justifyContent: 'center' },
  loginServiceName: { color: KlippColors.ink, fontSize: 11, fontWeight: '900', marginTop: 7 },
  loginServiceCaption: { color: KlippColors.muted, fontSize: 9, marginTop: 1 },
  showcaseCopy: { flex: 1, minWidth: 0, gap: 13, justifyContent: 'center' },
  showcaseBrandLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  showcaseMark: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: 'transparent' },
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
  formCardLogin: { padding: 22, gap: 12, borderRadius: 24 },
  eyebrow: { color: KlippColors.blueDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: KlippColors.navy, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: KlippColors.muted, fontSize: 14, lineHeight: 21, marginBottom: 5 },
  configNotice: { gap: 5, padding: 13, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14, backgroundColor: KlippColors.surfaceBlue },
  configNoticeTitle: { color: KlippColors.navy, fontSize: 12, fontWeight: '900' },
  configNoticeText: { color: KlippColors.slate, fontSize: 11, lineHeight: 16 },
  authMethodTabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: KlippColors.surfaceMuted },
  authMethodTab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  authMethodTabActive: { backgroundColor: KlippColors.white, shadowColor: KlippColors.ink, shadowOpacity: 0.07, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  authMethodText: { color: KlippColors.muted, fontSize: 12, fontWeight: '700' },
  authMethodTextActive: { color: KlippColors.ink, fontWeight: '900' },
  phonePrefixList: { flexDirection: 'row', gap: 7, marginBottom: 2 },
  phonePrefixOption: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, backgroundColor: KlippColors.white },
  phonePrefixSelected: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.surfaceBlue },
  phonePrefixText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700' },
  phonePrefixTextSelected: { color: KlippColors.cobaltDark, fontWeight: '900' },
  otpInput: { minHeight: 64, paddingHorizontal: 18, borderWidth: 1, borderColor: KlippColors.cobalt, borderRadius: 16, backgroundColor: KlippColors.surfaceBlue, color: KlippColors.ink, fontSize: 25, fontWeight: '900', letterSpacing: 9, textAlign: 'center' },
  resendLink: { alignSelf: 'flex-start', paddingVertical: 5 },
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
