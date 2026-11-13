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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { KlippMark } from '@/components/klipp-mark';
import { KlippColors as C } from '@/theme/tokens';
import { normalizePhoneNumber } from '@/lib/phone';
import { heroArt } from '@/lib/service-art';
import { isSupabaseConfigured } from '../../lib/supabase';

type AuthScreenProps = { mode: 'login' | 'register' };

export function AuthScreen({ mode }: AuthScreenProps) {
  const isRegister = mode === 'register';
  const router = useRouter();
  const { session, signIn, sendPhoneOtp, verifyPhoneOtp, authError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
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

  async function resendCode() {
    setError(null);
    setNotice(null);
    const fullPhone = normalizePhoneNumber(phone);
    if (!fullPhone) {
      setError('Introduce un número válido con código de país.');
      return;
    }
    setBusy(true);
    try {
      await sendPhoneOtp(fullPhone, fullName.trim(), 'client', isRegister);
      setNotice(`Enviamos otro código de 6 dígitos a ${fullPhone}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos reenviar el código SMS.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    setNotice(null);
    if (method === 'phone') {
      if (isRegister && !fullName.trim()) return setError('Escribe tu nombre para continuar.');
      const fullPhone = normalizePhoneNumber(phone);
      if (!fullPhone) return setError('Introduce un número válido con código de país. Ejemplo: +1 809 555 0123.');
      setBusy(true);
      try {
        if (!otpSent) {
          await sendPhoneOtp(fullPhone, fullName.trim(), 'client', isRegister);
          setOtpSent(true);
          setNotice(`Enviamos un código de 6 dígitos a ${fullPhone}.`);
        } else {
          if (!/^\d{6}$/.test(otp)) throw new Error('Introduce el código de 6 dígitos que recibiste por SMS.');
          await verifyPhoneOtp(fullPhone, otp);
          router.replace('/');
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No pudimos verificar tu teléfono.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!email.trim() || !password) return setError('Introduce tu correo y contraseña.');
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

  const disabled = busy || !isSupabaseConfigured || (method === 'phone'
    ? otpSent ? otp.length !== 6 : !normalizePhoneNumber(phone) || (isRegister && !fullName.trim())
    : !email.trim() || !password);
  const inactive = disabled && !busy;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandLockup}>
              <KlippMark size={42} />
              <View><Text style={styles.brand}>klipp</Text><Text style={styles.brandCaption}>SANTO DOMINGO, RD</Text></View>
            </View>
            <View style={styles.secureBadge}>
              <SymbolView name={{ ios: 'lock.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor={C.cobaltDark} size={14} />
              <Text style={styles.secureBadgeText}>Acceso seguro</Text>
            </View>
          </View>

          <View style={styles.intro}>
            <Image source={heroArt} cachePolicy="memory-disk" contentFit="cover" transition={350} style={styles.introImage} />
            <View pointerEvents="none" style={styles.introOverlay} />
            <View style={styles.introCopy}>
              <View style={styles.introRule} />
              <Text style={styles.kicker}>{isRegister ? 'CREAR CUENTA · CLIENTE' : 'TU CUENTA KLIPP'}</Text>
              <Text style={styles.title}>{isRegister ? 'Empieza con lo esencial.' : 'Qué bueno verte de nuevo.'}</Text>
              <Text style={styles.subtitle}>{isRegister ? 'Un número de teléfono y estarás listo para reservar servicios en casa.' : 'Accede a tus reservas, direcciones y servicios.'}</Text>
              {!isRegister && (
                <View style={styles.serviceChips}>
                  <View style={styles.serviceChip}><SymbolView name={{ ios: 'scissors', android: 'content_cut', web: 'content_cut' }} tintColor={C.cobalt} size={17} /><Text style={styles.serviceChipText}>Barbería</Text></View>
                  <View style={styles.serviceChip}><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={C.coral} size={17} /><Text style={styles.serviceChipText}>Belleza</Text></View>
                  <View style={styles.serviceChip}><SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={C.success} size={17} /><Text style={styles.serviceChipText}>Hogar</Text></View>
                </View>
              )}
            </View>
          </View>

          <View style={styles.form}>
            {!isRegister && <View style={styles.methodSwitch}>
              <Pressable onPress={() => { setMethod('phone'); setError(null); }} style={[styles.methodOption, method === 'phone' && styles.methodActive]}><Text style={[styles.methodText, method === 'phone' && styles.methodTextActive]}>Teléfono</Text></Pressable>
              <Pressable onPress={() => { setMethod('email'); setError(null); }} style={[styles.methodOption, method === 'email' && styles.methodActive]}><Text style={[styles.methodText, method === 'email' && styles.methodTextActive]}>Correo</Text></Pressable>
            </View>}

            {method === 'phone' ? (
              <>
                {isRegister && <Field label="Nombre y apellido" value={fullName} onChangeText={setFullName} placeholder="Cómo te llamas" autoCapitalize="words" />}
                <Field label="Número de teléfono" value={phone} onChangeText={setPhone} placeholder="+1 809 555 0123" keyboardType="phone-pad" autoCapitalize="none" editable={!otpSent} />
                {otpSent && <Field label="Código SMS" value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" />}
                {otpSent && (
                  <View style={styles.otpActions}>
                    <Pressable disabled={busy} onPress={() => void resendCode()}><Text style={styles.changeNumber}>{busy ? 'Enviando…' : 'Reenviar código'}</Text></Pressable>
                    <Pressable onPress={() => { setOtpSent(false); setOtp(''); setNotice(null); }}><Text style={styles.changeNumber}>Cambiar número</Text></Pressable>
                  </View>
                )}
              </>
            ) : (
              <>
                <Field label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" autoCapitalize="none" />
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Contraseña</Text>
                  <View style={styles.passwordField}>
                    <TextInput accessibilityLabel="Contraseña" autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Tu contraseña" placeholderTextColor={C.muted} secureTextEntry={!showPassword} style={styles.passwordInput} />
                    <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} hitSlop={10} onPress={() => setShowPassword((value) => !value)} style={styles.passwordToggle}>
                      <SymbolView name={showPassword ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'eye', android: 'visibility', web: 'visibility' }} tintColor={C.muted} size={19} />
                    </Pressable>
                  </View>
                </View>
              </>
            )}

            {!!notice && <View style={styles.notice}><SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} tintColor={C.success} size={18} /><Text style={styles.noticeText}>{notice}</Text></View>}
            {!!(error || authError) && <View style={styles.error}><Text style={styles.errorText}>{error || authError}</Text></View>}
            {!isSupabaseConfigured && <Text style={styles.configText}>Vista de diseño: conecta Supabase para activar el acceso real.</Text>}

            <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void submit()} style={({ pressed }) => [styles.submit, inactive && styles.submitDisabled, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator color={C.white} /> : <Text style={[styles.submitText, inactive && styles.submitTextDisabled]}>{method === 'phone' ? otpSent ? 'Verificar y entrar' : 'Enviar código SMS' : 'Continuar'}</Text>}
              {!busy && <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor={inactive ? C.muted : C.white} size={18} />}
            </Pressable>
            <Text style={styles.legal}>Al continuar aceptas los términos de servicio y la política de privacidad de Klipp.</Text>
          </View>

          <View style={styles.bottomLine}>
            <Text style={styles.bottomText}>{isRegister ? '¿Ya tienes cuenta?' : '¿Todavía no tienes cuenta?'}</Text>
            <Link href={isRegister ? '/login' : '/register'} style={styles.bottomLink}>{isRegister ? 'Inicia sesión' : 'Crear cuenta'}</Link>
          </View>
          {isRegister && (
            <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/pro-register')} style={styles.proSignupLink}>
              <Text style={styles.proSignupText}>¿Quieres ofrecer servicios? <Text style={styles.bottomLink}>Regístrate como profesional</Text></Text>
            </Pressable>
          )}
          <View style={styles.secure}><SymbolView name={{ ios: 'lock.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor={C.success} size={16} /><Text style={styles.secureText}>Tus datos y reservas, protegidos en Klipp</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...inputProps }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
  autoCapitalize?: 'none' | 'words';
  secureTextEntry?: boolean;
  editable?: boolean;
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor={C.muted} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ivory },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secureBadge: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: C.surfaceMint },
  secureBadgeText: { color: C.cobaltDark, fontSize: 10, fontWeight: '800' },
  brand: { color: C.ink, fontSize: 25, fontWeight: '900', letterSpacing: -1.1 },
  brandCaption: { color: C.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  intro: { minHeight: 280, justifyContent: 'flex-end', overflow: 'hidden', marginTop: 28, marginBottom: 24, padding: 22, borderRadius: 24, backgroundColor: C.darkCanvas },
  introImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  introOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,18,34,0.66)' },
  introCopy: { gap: 9 },
  serviceChips: { flexDirection: 'row', gap: 8, marginTop: 7 },
  serviceChip: { flex: 1, minWidth: 0, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.94)' },
  serviceChipText: { color: C.ink, fontSize: 10, fontWeight: '900' },
  introRule: { width: 42, height: 4, borderRadius: 2, backgroundColor: C.coral, marginBottom: 9 },
  kicker: { color: C.mint, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: C.white, fontSize: 36, lineHeight: 41, fontWeight: '800', letterSpacing: -1.4, maxWidth: 360 },
  subtitle: { color: 'rgba(255,255,255,0.88)', fontSize: 15, lineHeight: 22, maxWidth: 330 },
  form: { gap: 17, padding: 20, borderWidth: 1, borderColor: C.border, borderRadius: 24, backgroundColor: C.white },
  methodSwitch: { flexDirection: 'row', padding: 4, borderRadius: 15, backgroundColor: C.surfaceMuted, gap: 4 },
  methodOption: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  methodActive: { backgroundColor: C.white, shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  methodText: { color: C.muted, fontSize: 13, fontWeight: '800' },
  methodTextActive: { color: C.ink },
  field: { gap: 7 },
  fieldLabel: { color: C.ink, fontSize: 12, fontWeight: '800' },
  input: { minHeight: 56, borderRadius: 15, paddingHorizontal: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, color: C.ink, fontSize: 16 },
  passwordField: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, borderRadius: 15, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  passwordInput: { flex: 1, minHeight: 54, color: C.ink, fontSize: 16 },
  passwordToggle: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: C.surfaceMuted },
  otpActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeNumber: { color: C.cobalt, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, backgroundColor: C.surfaceMint, borderRadius: 13 },
  noticeText: { color: C.ink, flex: 1, fontSize: 12, lineHeight: 18 },
  error: { padding: 13, backgroundColor: C.surfaceCoral, borderRadius: 13 },
  errorText: { color: C.danger, fontSize: 12, lineHeight: 18 },
  configText: { color: C.warning, fontSize: 11, lineHeight: 16 },
  submit: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 17, backgroundColor: C.cobalt, marginTop: 3 },
  submitDisabled: { backgroundColor: C.surfaceMuted },
  submitTextDisabled: { color: C.muted },
  submitText: { color: C.white, fontSize: 15, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.985 }] },
  legal: { color: C.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  bottomLine: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 26 },
  bottomText: { color: C.muted, fontSize: 12 },
  bottomLink: { color: C.cobalt, fontSize: 12, fontWeight: '900' },
  proSignupLink: { alignSelf: 'center', marginTop: 12, paddingVertical: 8, paddingHorizontal: 10 },
  proSignupText: { color: C.muted, fontSize: 12, textAlign: 'center' },
  secure: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 30 },
  secureText: { color: C.muted, fontSize: 10, fontWeight: '700' },
});
