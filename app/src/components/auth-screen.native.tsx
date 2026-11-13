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
import { ScreenEntrance } from '@/components/ui-primitives';
import { KlippMark } from '@/components/klipp-mark';
import { KlippColors } from '@/theme/tokens';
import { normalizePhoneNumber } from '@/lib/phone';
import type { ExtractRole } from '@/lib/types';
import { isSupabaseConfigured } from '../../lib/supabase';

type AuthScreenProps = { mode: 'login' | 'register' };

function AuthShowcase({ compact }: { compact: boolean; isRegister: boolean }) {
  return (
    <View style={[styles.showcase, compact && styles.showcaseCompact]}>
      <View style={styles.showcaseRule} />
      <Text style={styles.showcaseKicker}>KLIPP · SANTO DOMINGO</Text>
      <Text style={styles.showcaseTitle}>Los servicios que necesitas. Cuando los necesitas.</Text>
      <Text style={styles.showcaseDescription}>Reserva con profesionales verificados, conoce el precio antes de confirmar y sigue cada servicio desde la app.</Text>
      <View style={styles.showcaseProof}>
        <View style={styles.showcaseProofItem}>
          <Text style={styles.showcaseProofNumber}>01</Text>
          <Text style={styles.showcaseProofText}>Elige tu servicio</Text>
        </View>
        <View style={styles.showcaseProofItem}>
          <Text style={styles.showcaseProofNumber}>02</Text>
          <Text style={styles.showcaseProofText}>Confirma el profesional</Text>
        </View>
        <View style={styles.showcaseProofItem}>
          <Text style={styles.showcaseProofNumber}>03</Text>
          <Text style={styles.showcaseProofText}>Sigue su llegada</Text>
        </View>
      </View>
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
                <View style={styles.logoMark}><KlippMark size={42} /></View>
                <View style={styles.brandCopy}>
                  <Text style={styles.brand}>KLIPP</Text>
                  <Text style={styles.location}>SANTO DOMINGO, RD</Text>
                </View>
              </View>
              <View style={styles.trustNote}>
                <SymbolView name={{ ios: 'lock.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor={KlippColors.cobaltDark} size={15} />
                <Text style={styles.trustNoteText}>Conexión protegida</Text>
              </View>
            </View>

            <ScreenEntrance delay={30}>
              <View style={[styles.main, wide && !isRegister && styles.mainWide]}>
              {!isRegister && wide && <AuthShowcase compact={false} isRegister={false} />}
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
  loginScrollContent: { paddingHorizontal: 24, paddingVertical: 28 },
  loginAuthShell: { gap: 28 },
  authShell: { width: '100%', maxWidth: 1160, alignSelf: 'center', gap: 30 },
  topBar: { minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 20, backgroundColor: '#111827' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  passwordInputWrap: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white },
  passwordInput: { flex: 1, minWidth: 0, minHeight: 54, color: KlippColors.ink, fontSize: 15 },
  passwordToggle: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  brandCopy: { gap: 3 },
  brand: { color: '#FFFFFF', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 23, fontWeight: '800', letterSpacing: 2.4 },
  location: { color: '#AAB3C2', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 10, fontWeight: '600', letterSpacing: 1.7 },
  trustNote: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#344154', borderRadius: 999, backgroundColor: '#1B2637' },
  trustNoteText: { color: '#D7E0EA', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  main: { gap: 24 },
  mainWide: { flexDirection: 'row', alignItems: 'stretch', gap: 24 },
  showcase: { width: '100%', flex: 1, minWidth: 0, minHeight: 560, justifyContent: 'center', gap: 22, padding: 42, borderRadius: 24, backgroundColor: '#172235', overflow: 'hidden' },
  showcaseCompact: { minHeight: 0, padding: 0, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'transparent', gap: 9 },



  showcaseRule: { width: 42, height: 3, borderRadius: 3, backgroundColor: '#F18A75' },
  showcaseProof: { gap: 16, marginTop: 22, paddingTop: 22, borderTopWidth: 1, borderTopColor: '#344154' },
  showcaseProofItem: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  showcaseProofNumber: { color: '#F18A75', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  showcaseProofText: { color: '#E3E9F0', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 13, fontWeight: '500' },












  
  












  showcaseKicker: { color: '#F4A18F', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 10, fontWeight: '700', letterSpacing: 2.1 },
  showcaseTitle: { color: '#FFFFFF', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 38, lineHeight: 46, fontWeight: '700', maxWidth: 490, letterSpacing: -1.2 },
  showcaseDescription: { color: '#C4CEDB', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 15, lineHeight: 25, maxWidth: 470 },






  bookingPreview: { width: 230, alignSelf: 'center', padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 20, backgroundColor: KlippColors.surfaceMuted },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  previewEyebrow: { color: KlippColors.muted, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  previewLive: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: KlippColors.surfaceMint },
  previewLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: KlippColors.cobalt },
  previewLiveText: { color: KlippColors.cobaltDark, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 7, fontWeight: '900' },
  previewService: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  previewServiceIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: KlippColors.surfaceBlue },
  previewServiceCopy: { flex: 1, gap: 3 },
  previewServiceTitle: { color: KlippColors.ink, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 10, fontWeight: '900' },
  previewServiceDetail: { color: KlippColors.muted, fontSize: 8 },
  previewDivider: { height: 1, backgroundColor: KlippColors.border, marginVertical: 15 },
  previewSectionTitle: { color: KlippColors.ink, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 10, fontWeight: '900', marginBottom: 11 },
  previewTimeline: { flexDirection: 'row', gap: 10 },
  previewTimelineRail: { width: 12, alignItems: 'center', paddingTop: 3 },
  previewTimelineDot: { width: 8, height: 8, borderWidth: 2, borderColor: KlippColors.muted, borderRadius: 5, backgroundColor: KlippColors.surfaceMuted },
  previewTimelineDotActive: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.cobalt },
  previewTimelineLine: { width: 1, height: 28, backgroundColor: KlippColors.border },
  previewTimelineCopy: { flex: 1, gap: 3 },
  previewTimelineTitle: { color: KlippColors.ink, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 9, fontWeight: '800' },
  previewTimelineDetail: { color: KlippColors.muted, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 8, lineHeight: 12, marginBottom: 7 },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: KlippColors.border },
  previewFooterText: { color: KlippColors.slate, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 8, fontWeight: '700' },
  formCard: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 18, padding: 34, borderWidth: 1, borderColor: '#E8EAF0', borderRadius: 20, backgroundColor: KlippColors.white, shadowColor: '#111827', shadowOpacity: 0.045, shadowOffset: { width: 0, height: 10 }, shadowRadius: 28, elevation: 2 },
  formCardWide: { width: 430, alignSelf: 'center', padding: 34 },
  formCardLogin: { padding: 28, gap: 17, borderRadius: 20 },
  eyebrow: { color: KlippColors.cobaltDark, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#151C2B', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 32, lineHeight: 39, fontWeight: '700', letterSpacing: -0.9 },
  subtitle: { color: KlippColors.muted, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 14, lineHeight: 21, marginBottom: 5 },
  configNotice: { gap: 5, padding: 13, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14, backgroundColor: KlippColors.surfaceBlue },
  configNoticeTitle: { color: KlippColors.ink, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 12, fontWeight: '900' },
  configNoticeText: { color: KlippColors.slate, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 11, lineHeight: 16 },
  authMethodTabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 11, backgroundColor: '#F0F2F5' },
  authMethodTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  authMethodTabActive: { backgroundColor: KlippColors.white, shadowColor: KlippColors.ink, shadowOpacity: 0.07, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  authMethodText: { color: KlippColors.muted, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 12, fontWeight: '700' },
  authMethodTextActive: { color: KlippColors.ink, fontWeight: '900' },
  otpInput: { minHeight: 64, paddingHorizontal: 18, borderWidth: 1, borderColor: KlippColors.cobalt, borderRadius: 16, backgroundColor: KlippColors.surfaceBlue, color: KlippColors.ink, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 25, fontWeight: '900', letterSpacing: 9, textAlign: 'center' },
  resendLink: { alignSelf: 'flex-start', paddingVertical: 5 },
  field: { gap: 7 },
  label: { color: KlippColors.slate, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 12, fontWeight: '800' },
  input: { minHeight: 58, paddingHorizontal: 17, borderWidth: 1, borderColor: '#D9DEE7', borderRadius: 12, backgroundColor: '#FFFFFF', color: '#151C2B', fontSize: 16 },
  roleOptions: { gap: 9 },
  roleOption: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white },
  roleOptionSelected: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.surfaceBlue },
  roleIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: KlippColors.surfaceMuted },
  roleIconSelected: { backgroundColor: KlippColors.surfaceBlue },
  roleCopy: { flex: 1, gap: 3 },
  roleTitle: { color: KlippColors.ink, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 13, fontWeight: '800' },
  roleTitleSelected: { color: KlippColors.cobaltDark },
  roleDescription: { color: KlippColors.muted, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 11, lineHeight: 15 },
  radio: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: KlippColors.border, borderRadius: 99 },
  radioSelected: { borderColor: KlippColors.cobalt },
  radioDot: { width: 9, height: 9, borderRadius: 99, backgroundColor: KlippColors.cobalt },
  error: { padding: 12, borderWidth: 1, borderColor: KlippColors.coral, borderRadius: 13, backgroundColor: KlippColors.surfaceCoral, color: KlippColors.danger, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 13, lineHeight: 19 },
  notice: { padding: 12, borderWidth: 1, borderColor: KlippColors.mint, borderRadius: 13, backgroundColor: KlippColors.surfaceMint, color: KlippColors.cobaltDark, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 5, borderRadius: 12, backgroundColor: '#172235' },
  submitDisabled: { backgroundColor: KlippColors.surfaceMuted },
  submitTextDisabled: { color: KlippColors.muted },
  submitPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  submitText: { color: KlippColors.white, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 14, fontWeight: '900' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  switchText: { color: KlippColors.muted, fontSize: 12 },
  link: { color: '#344F80', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 12, fontWeight: '700' },
  legalNote: { color: KlippColors.muted, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'sans-serif' }), fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 2 },
});
