import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { KlippColors } from '@/theme/tokens';
import { normalizePhoneNumber } from '@/lib/phone';
import { isSupabaseConfigured } from '../../lib/supabase';

type AuthScreenProps = { mode: 'login' | 'register' };
type AuthMethod = 'phone' | 'email';

const KLIPP_SYMBOL = require('../../assets/images/klipp-symbol.png');

function BrandLockup({ inverted = false }: { inverted?: boolean }) {
  return (
    <View style={styles.brandLockup}>
      <Image source={KLIPP_SYMBOL} resizeMode="contain" style={styles.brandSymbol} accessibilityLabel="Símbolo de Klipp" />
      <Text style={[styles.brandWord, inverted && styles.brandWordInverted]}>klipp</Text>
    </View>
  );
}

function EditorialPanel({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.editorial, compact && styles.editorialCompact]}>
      <View style={styles.editorialTopline}>
        <View style={styles.editorialDot} />
        <Text style={styles.editorialKicker}>SERVICIOS A DOMICILIO · REPÚBLICA DOMINICANA</Text>
      </View>
      <Text style={[styles.editorialTitle, compact && styles.editorialTitleCompact]}>
        Tu tiempo.{ '\n' }Tus servicios.{ '\n' }A tu manera.
      </Text>
      <Text style={styles.editorialBody}>
        Profesionales de confianza para lo que necesitas en casa. Reserva en minutos y sigue cada paso desde Klipp.
      </Text>
      {!compact && (
        <View style={styles.journey}>
          <View style={styles.journeyLine} />
          <View style={styles.journeyStep}>
            <Text style={styles.journeyNumber}>01</Text>
            <View><Text style={styles.journeyTitle}>Elige lo que necesitas</Text><Text style={styles.journeyCaption}>Servicios claros, precios por adelantado</Text></View>
          </View>
          <View style={styles.journeyStep}>
            <Text style={styles.journeyNumber}>02</Text>
            <View><Text style={styles.journeyTitle}>Conecta con un profesional</Text><Text style={styles.journeyCaption}>Perfiles y valoraciones reales</Text></View>
          </View>
          <View style={styles.journeyStep}>
            <Text style={styles.journeyNumber}>03</Text>
            <View><Text style={styles.journeyTitle}>Sigue el servicio en directo</Text><Text style={styles.journeyCaption}>Desde la confirmación hasta el final</Text></View>
          </View>
        </View>
      )}
      <View style={styles.editorialFooter}>
        <Text style={styles.editorialFooterText}>SANTO DOMINGO</Text>
        <View style={styles.footerDivider} />
        <Text style={styles.editorialFooterText}>HECHO PARA RD</Text>
      </View>
    </View>
  );
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const isRegister = mode === 'register';
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const compact = width < 620;
  const router = useRouter();
  const { session, signIn, sendPhoneOtp, verifyPhoneOtp, authError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace('/');
  }, [router, session]);

  function changeMethod(method: AuthMethod) {
    setAuthMethod(method);
    setOtpSent(false);
    setOtp('');
    setError(null);
    setNotice(null);
  }

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
        setError('Introduce un número válido. Puedes usar +1 809, +1 829 o +1 849.');
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
        if (!/^\\d{6}$/.test(otp)) {
          setError('Introduce el código de 6 dígitos que recibiste por SMS.');
          return;
        }
        await verifyPhoneOtp(phone, otp);
        router.replace('/');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No pudimos completar la verificación.');
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
      setError(cause instanceof Error ? cause.message : 'No pudimos iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  const submitDisabled = busy || !isSupabaseConfigured || (authMethod === 'phone'
    ? (otpSent ? otp.length !== 6 : !normalizePhoneNumber(phoneNumber) || (isRegister && !fullName.trim()))
    : !email.trim() || !password);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.page, wide && styles.pageWide]}>
            <View style={styles.header}>
              <BrandLockup />
              <Text style={styles.headerLocation}>REPÚBLICA DOMINICANA</Text>
            </View>
            <View style={[styles.content, wide && styles.contentWide]}>
              <View style={[styles.visualColumn, wide && styles.visualColumnWide]}>
                <EditorialPanel compact={!wide} />
              </View>
              <ScreenEntrance delay={35} style={[styles.formColumn, wide && styles.formColumnWide]}>
                <View style={styles.form}>
                  <View style={styles.formIntro}>
                    <Text style={styles.formEyebrow}>{isRegister ? 'TU CUENTA KLIPP' : 'BIENVENIDO DE NUEVO'}</Text>
                    <Text style={styles.formTitle}>{isRegister ? 'Empieza por aquí.' : 'Qué bueno verte.'}</Text>
                    <Text style={styles.formSubtitle}>
                      {isRegister ? 'Crea tu cuenta y encuentra a la persona adecuada para cada servicio.' : 'Accede para gestionar tus reservas y servicios.'}
                    </Text>
                  </View>

                  {!isSupabaseConfigured && (
                    <View style={styles.previewNotice}>
                      <Text style={styles.previewNoticeTitle}>Modo de vista previa</Text>
                      <Text style={styles.previewNoticeText}>El diseño está disponible. La autenticación real requiere conectar el proyecto de Supabase.</Text>
                    </View>
                  )}

                  {isRegister && (
                    <View style={styles.field}>
                      <Text style={styles.label}>Nombre y apellido</Text>
                      <TextInput autoComplete="name" autoCapitalize="words" onChangeText={setFullName} placeholder="Cómo te llamas" placeholderTextColor="#9699A4" style={styles.input} value={fullName} />
                    </View>
                  )}

                  {!isRegister && (
                    <View style={styles.methodSwitch}>
                      <Pressable accessibilityRole="tab" accessibilityState={{ selected: authMethod === 'phone' }} onPress={() => changeMethod('phone')} style={[styles.methodOption, authMethod === 'phone' && styles.methodOptionActive]}>
                        <Text style={[styles.methodText, authMethod === 'phone' && styles.methodTextActive]}>Teléfono</Text>
                      </Pressable>
                      <Pressable accessibilityRole="tab" accessibilityState={{ selected: authMethod === 'email' }} onPress={() => changeMethod('email')} style={[styles.methodOption, authMethod === 'email' && styles.methodOptionActive]}>
                        <Text style={[styles.methodText, authMethod === 'email' && styles.methodTextActive]}>Correo</Text>
                      </Pressable>
                    </View>
                  )}

                  {authMethod === 'phone' ? (
                    <>
                      <View style={styles.field}>
                        <Text style={styles.label}>{otpSent ? 'Código de verificación' : 'Número de teléfono'}</Text>
                        {!otpSent ? (
                          <View style={styles.phoneInputWrap}>
                            <View style={styles.countryCode}><Text style={styles.flag}>🇩🇴</Text><Text style={styles.countryCodeText}>+1</Text><SymbolView name={{ ios: 'chevron.down', android: 'arrow_drop_down', web: 'arrow_drop_down' }} tintColor="#747987" size={13} /></View>
                            <View style={styles.inputDivider} />
                            <TextInput accessibilityLabel="Número de teléfono" autoComplete="tel" keyboardType="phone-pad" onChangeText={setPhoneNumber} placeholder="809 555 0123" placeholderTextColor="#9699A4" style={styles.phoneInput} value={phoneNumber} />
                          </View>
                        ) : (
                          <View style={styles.otpWrap}>
                            <TextInput accessibilityLabel="Código SMS de seis dígitos" autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} onChangeText={(value) => setOtp(value.replace(/\\D/g, '').slice(0, 6))} placeholder="• • • • • •" placeholderTextColor="#A5A8B1" style={styles.otpInput} value={otp} />
                            <Pressable accessibilityRole="button" onPress={() => { setOtpSent(false); setOtp(''); setNotice(null); }} style={styles.changeNumber}><Text style={styles.inlineLink}>Cambiar número</Text></Pressable>
                          </View>
                        )}
                      </View>
                      {otpSent && <Text style={styles.helperText}>Introduce el código que enviamos por SMS para confirmar tu número.</Text>}
                    </>
                  ) : (
                    <>
                      <View style={styles.field}>
                        <Text style={styles.label}>Correo electrónico</Text>
                        <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="nombre@correo.com" placeholderTextColor="#9699A4" style={styles.input} value={email} />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>Contraseña</Text>
                        <View style={styles.passwordWrap}>
                          <TextInput autoComplete="current-password" onChangeText={setPassword} placeholder="Tu contraseña" placeholderTextColor="#9699A4" secureTextEntry={!showPassword} style={styles.passwordInput} value={password} />
                          <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} hitSlop={10} onPress={() => setShowPassword((visible) => !visible)} style={styles.passwordToggle}>
                            <SymbolView name={showPassword ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'eye', android: 'visibility', web: 'visibility' }} tintColor="#747987" size={19} />
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}

                  {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                  {authError && <Text accessibilityRole="alert" style={styles.error}>{authError}</Text>}
                  {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

                  <Pressable accessibilityRole="button" disabled={submitDisabled} onPress={() => void handleSubmit()} style={({ pressed }) => [styles.submit, submitDisabled && styles.submitDisabled, pressed && !busy && styles.submitPressed]}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{authMethod === 'phone' ? (otpSent ? 'Confirmar y continuar' : 'Continuar con teléfono') : 'Iniciar sesión'}</Text>}
                    {!busy && <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor="#FFFFFF" size={17} />}
                  </Pressable>

                  <View style={styles.switchRow}>
                    <Text style={styles.switchText}>{isRegister ? '¿Ya tienes cuenta?' : '¿Primera vez en Klipp?'}</Text>
                    <Link href={isRegister ? '/(auth)/login' : '/(auth)/register'} asChild>
                      <Text style={styles.inlineLink}>{isRegister ? 'Inicia sesión' : 'Crea tu cuenta'}</Text>
                    </Link>
                  </View>
                  {isRegister && (
                    <Pressable accessibilityRole="link" onPress={() => router.push('/(auth)/pro-register')} style={styles.proEntry}>
                      <View style={styles.proEntryIcon}><SymbolView name={{ ios: 'briefcase.fill', android: 'work', web: 'work' }} tintColor="#3D5AFE" size={17} /></View>
                      <View style={styles.proEntryCopy}><Text style={styles.proEntryTitle}>¿Ofreces servicios?</Text><Text style={styles.proEntrySubtitle}>Crea tu cuenta profesional en Klipp PRO</Text></View>
                      <SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }} tintColor="#747987" size={16} />
                    </Pressable>
                  )}
                  <Text style={styles.legal}>Al continuar, aceptas las condiciones de uso y la política de privacidad de Klipp.</Text>
                </View>
              </ScreenEntrance>
            </View>
            <View style={styles.pageFooter}><Text style={styles.pageFooterText}>KLIPP</Text><Text style={styles.pageFooterText}>SERVICIOS QUE SE MUEVEN CONTIGO</Text></View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F7F5F0' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 22, paddingVertical: 16 },
  page: { width: '100%', maxWidth: 1160, alignSelf: 'center', flex: 1 },
  pageWide: { minHeight: 720, justifyContent: 'center' },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E7E3DB' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandSymbol: { width: 34, height: 40 },
  brandWord: { color: '#171B2D', fontSize: 31, lineHeight: 36, fontWeight: '800', letterSpacing: -2.1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', web: 'Arial, sans-serif', default: 'sans-serif' }) },
  brandWordInverted: { color: '#F7F5F0' },
  headerLocation: { color: '#747987', fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  content: { flex: 1, gap: 28, paddingTop: 26, paddingBottom: 24 },
  contentWide: { flexDirection: 'row', alignItems: 'stretch', gap: 72, paddingTop: 46, paddingBottom: 44 },
  visualColumn: { width: '100%' },
  visualColumnWide: { flex: 1, justifyContent: 'center', minWidth: 0 },
  editorial: { minHeight: 270, padding: 28, borderRadius: 26, backgroundColor: '#171B2D', justifyContent: 'center', overflow: 'hidden' },
  editorialCompact: { minHeight: 0, paddingHorizontal: 0, paddingVertical: 16, borderRadius: 0, backgroundColor: 'transparent', justifyContent: 'flex-start', gap: 13 },
  editorialTopline: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  editorialDot: { width: 7, height: 7, borderRadius: 9, backgroundColor: '#FF7058' },
  editorialKicker: { color: '#B7BDCE', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  editorialTitle: { color: '#F7F5F0', fontSize: 46, lineHeight: 51, fontWeight: '700', letterSpacing: -1.8, marginTop: 25 },
  editorialTitleCompact: { color: '#171B2D', fontSize: 31, lineHeight: 34, marginTop: 4, letterSpacing: -1.1 },
  editorialBody: { color: '#B7BDCE', fontSize: 14, lineHeight: 22, maxWidth: 420, marginTop: 17 },
  journey: { gap: 19, marginTop: 40, paddingTop: 25, borderTopWidth: 1, borderTopColor: '#34394C' },
  journeyLine: { display: 'none' },
  journeyStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  journeyNumber: { color: '#FF7058', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, paddingTop: 2 },
  journeyTitle: { color: '#F7F5F0', fontSize: 13, fontWeight: '700' },
  journeyCaption: { color: '#9DA5B8', fontSize: 11, marginTop: 4 },
  editorialFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 35 },
  editorialFooterText: { color: '#8E96AA', fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  footerDivider: { width: 22, height: 1, backgroundColor: '#596075' },
  formColumn: { width: '100%' },
  formColumnWide: { width: 420, justifyContent: 'center', flexShrink: 0 },
  form: { gap: 19, paddingVertical: 8 },
  formIntro: { gap: 9, marginBottom: 5 },
  formEyebrow: { color: '#3D5AFE', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  formTitle: { color: '#171B2D', fontSize: 35, lineHeight: 41, fontWeight: '700', letterSpacing: -1.3 },
  formSubtitle: { color: '#747987', fontSize: 14, lineHeight: 21, maxWidth: 390 },
  previewNotice: { padding: 13, borderRadius: 12, backgroundColor: '#E9EDFF', gap: 4 },
  previewNoticeTitle: { color: '#3048D8', fontSize: 12, fontWeight: '800' },
  previewNoticeText: { color: '#555D77', fontSize: 11, lineHeight: 16 },
  field: { gap: 8 },
  label: { color: '#3D4358', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 56, paddingHorizontal: 16, borderWidth: 1, borderColor: '#DCD9D2', borderRadius: 13, backgroundColor: '#FFFFFF', color: '#171B2D', fontSize: 15 },
  phoneInputWrap: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DCD9D2', borderRadius: 13, backgroundColor: '#FFFFFF', paddingHorizontal: 13 },
  countryCode: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flag: { fontSize: 17 },
  countryCodeText: { color: '#171B2D', fontSize: 14, fontWeight: '700' },
  inputDivider: { width: 1, height: 25, backgroundColor: '#E7E3DB', marginHorizontal: 13 },
  phoneInput: { flex: 1, minWidth: 0, height: 54, color: '#171B2D', fontSize: 15 },
  methodSwitch: { flexDirection: 'row', alignSelf: 'flex-start', gap: 20, borderBottomWidth: 1, borderBottomColor: '#E7E3DB' },
  methodOption: { minHeight: 38, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 2 },
  methodOptionActive: { borderBottomColor: '#3D5AFE' },
  methodText: { color: '#858997', fontSize: 13, fontWeight: '600' },
  methodTextActive: { color: '#171B2D', fontWeight: '800' },
  otpWrap: { gap: 10 },
  otpInput: { minHeight: 62, borderWidth: 1, borderColor: '#3D5AFE', borderRadius: 13, backgroundColor: '#FFFFFF', color: '#171B2D', fontSize: 24, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  changeNumber: { alignSelf: 'flex-start', paddingVertical: 3 },
  helperText: { color: '#747987', fontSize: 12, lineHeight: 18, marginTop: -9 },
  passwordWrap: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DCD9D2', borderRadius: 13, backgroundColor: '#FFFFFF', paddingLeft: 16, paddingRight: 8 },
  passwordInput: { flex: 1, minWidth: 0, height: 54, color: '#171B2D', fontSize: 15 },
  passwordToggle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  error: { padding: 12, borderRadius: 12, backgroundColor: '#FFF0EC', color: '#B83E31', fontSize: 12, lineHeight: 18 },
  notice: { padding: 12, borderRadius: 12, backgroundColor: '#E7F7F0', color: '#247A5A', fontSize: 12, lineHeight: 18 },
  submit: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 13, backgroundColor: '#3D5AFE', marginTop: 2 },
  submitDisabled: { opacity: 0.45 },
  submitPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  switchText: { color: '#747987', fontSize: 12 },
  inlineLink: { color: '#3048D8', fontSize: 12, fontWeight: '800' },
  proEntry: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, borderWidth: 1, borderColor: '#E7E3DB', borderRadius: 14, backgroundColor: '#FFFFFF' },
  proEntryIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#E9EDFF' },
  proEntryCopy: { flex: 1, gap: 3 },
  proEntryTitle: { color: '#171B2D', fontSize: 12, fontWeight: '800' },
  proEntrySubtitle: { color: '#747987', fontSize: 10 },
  legal: { color: '#9699A4', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 2 },
  pageFooter: { minHeight: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E7E3DB' },
  pageFooterText: { color: '#9699A4', fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
});
