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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { KlippMark } from '@/components/klipp-mark';
import { KlippColors as C } from '@/lib/brand';
import { normalizePhoneNumber } from '@/lib/phone';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace('/');
  }, [router, session]);

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
          if (!/^\\d{6}$/.test(otp)) throw new Error('Introduce el código de 6 dígitos que recibiste por SMS.');
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
    ? otpSent ? otp.length !== 6 : phone.length !== 7 || (isRegister && !fullName.trim())
    : !email.trim() || !password);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <KlippMark size={42} />
            <View><Text style={styles.brand}>klipp</Text><Text style={styles.brandCaption}>REPÚBLICA DOMINICANA</Text></View>
          </View>

          <View style={styles.intro}>
            <View style={styles.introRule} />
            <Text style={styles.kicker}>{isRegister ? 'EMPIEZA POR AQUÍ' : 'TU CUENTA KLIPP'}</Text>
            <Text style={styles.title}>{isRegister ? 'Tu próximo servicio, más cerca.' : 'Qué bueno verte de nuevo.'}</Text>
            <Text style={styles.subtitle}>{isRegister ? 'Crea tu cuenta y recibe profesionales de confianza donde los necesites.' : 'Accede a tus reservas, direcciones y servicios.'}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.methodSwitch}>
              <Pressable onPress={() => { setMethod('phone'); setError(null); }} style={[styles.methodOption, method === 'phone' && styles.methodActive]}><Text style={[styles.methodText, method === 'phone' && styles.methodTextActive]}>Teléfono</Text></Pressable>
              <Pressable onPress={() => { setMethod('email'); setError(null); }} style={[styles.methodOption, method === 'email' && styles.methodActive]}><Text style={[styles.methodText, method === 'email' && styles.methodTextActive]}>Correo</Text></Pressable>
            </View>

            {method === 'phone' ? (
              <>
                {isRegister && <Field label="Nombre y apellido" value={fullName} onChangeText={setFullName} placeholder="Cómo te llamas" autoCapitalize="words" />}
                <Field label="Número de teléfono" value={phone} onChangeText={setPhone} placeholder="+1 809 555 0123" keyboardType="phone-pad" autoCapitalize="none" editable={!otpSent} />
                {otpSent && <Field label="Código SMS" value={otp} onChangeText={(value) => setOtp(value.replace(/\\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" />}
                {otpSent && <Pressable onPress={() => { setOtpSent(false); setOtp(''); setNotice(null); }}><Text style={styles.changeNumber}>Cambiar número</Text></Pressable>}
              </>
            ) : (
              <>
                <Field label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" autoCapitalize="none" />
                <Field label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secureTextEntry />
              </>
            )}

            {!!notice && <View style={styles.notice}><SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} tintColor={C.success} size={18} /><Text style={styles.noticeText}>{notice}</Text></View>}
            {!!(error || authError) && <View style={styles.error}><Text style={styles.errorText}>{error || authError}</Text></View>}
            {!isSupabaseConfigured && <Text style={styles.configText}>Vista de diseño: conecta Supabase para activar el acceso real.</Text>}

            <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void submit()} style={({ pressed }) => [styles.submit, disabled && styles.submitDisabled, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.submitText}>{method === 'phone' ? otpSent ? 'Verificar y entrar' : 'Enviar código SMS' : 'Continuar'}</Text>}
              {!busy && <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor={C.white} size={18} />}
            </Pressable>
            <Text style={styles.legal}>Al continuar aceptas los términos de servicio y la política de privacidad de Klipp.</Text>
          </View>

          <View style={styles.bottomLine}>
            <Text style={styles.bottomText}>{isRegister ? '¿Ya tienes cuenta?' : '¿Todavía no tienes cuenta?'}</Text>
            <Link href={isRegister ? '/login' : '/register'} style={styles.bottomLink}>{isRegister ? 'Inicia sesión' : 'Crear cuenta'}</Link>
          </View>
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
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'words';
  secureTextEntry?: boolean;
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor={C.muted} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ivory },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { color: C.ink, fontSize: 25, fontWeight: '900', letterSpacing: -1.1 },
  brandCaption: { color: C.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  intro: { marginTop: 54, marginBottom: 30, gap: 9 },
  introRule: { width: 42, height: 4, borderRadius: 2, backgroundColor: C.coral, marginBottom: 9 },
  kicker: { color: C.cobalt, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: C.ink, fontSize: 34, lineHeight: 39, fontWeight: '900', letterSpacing: -1.4, maxWidth: 330 },
  subtitle: { color: C.muted, fontSize: 15, lineHeight: 22, maxWidth: 330 },
  form: { gap: 17 },
  methodSwitch: { flexDirection: 'row', padding: 4, borderRadius: 15, backgroundColor: '#ECEAE4', gap: 4 },
  methodOption: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  methodActive: { backgroundColor: C.white, shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  methodText: { color: C.muted, fontSize: 13, fontWeight: '800' },
  methodTextActive: { color: C.ink },
  field: { gap: 7 },
  fieldLabel: { color: C.ink, fontSize: 12, fontWeight: '800' },
  input: { minHeight: 56, borderRadius: 15, paddingHorizontal: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, color: C.ink, fontSize: 16 },
  changeNumber: { color: C.cobalt, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, backgroundColor: C.surfaceMint, borderRadius: 13 },
  noticeText: { color: C.ink, flex: 1, fontSize: 12, lineHeight: 18 },
  error: { padding: 13, backgroundColor: C.surfaceCoral, borderRadius: 13 },
  errorText: { color: C.danger, fontSize: 12, lineHeight: 18 },
  configText: { color: C.warning, fontSize: 11, lineHeight: 16 },
  submit: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 17, backgroundColor: C.cobalt, marginTop: 3 },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: C.white, fontSize: 15, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.985 }] },
  legal: { color: C.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  bottomLine: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 34 },
  bottomText: { color: C.muted, fontSize: 12 },
  bottomLink: { color: C.cobalt, fontSize: 12, fontWeight: '900' },
  secure: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 30 },
  secureText: { color: C.muted, fontSize: 10, fontWeight: '700' },
});
