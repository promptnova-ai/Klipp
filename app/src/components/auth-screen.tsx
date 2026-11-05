import { Link, useRouter } from 'expo-router';
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
                <Text style={[styles.brand, !isRegister && styles.loginBrand]}>Klipp</Text>
              </View>
              <Text style={[styles.location, !isRegister && styles.loginLocation]}>TU SERVICIO, EN CAMINO</Text>
            </View>

            <View style={[styles.loginMain, wideLogin && styles.loginMainWide]}>
          <View style={[styles.form, !isRegister && styles.loginForm, wideLogin && styles.loginFormWide]}>
            <Text style={[styles.eyebrow, !isRegister && styles.loginEyebrow]}>{isRegister ? 'EMPIEZA CON KLIPP' : 'CUENTA KLIPP'}</Text>
            <Text style={[styles.title, !isRegister && styles.loginTitle]}>{isRegister ? 'Crea tu cuenta' : 'Inicia sesión'}</Text>
            <Text style={[styles.subtitle, !isRegister && styles.loginSubtitle]}>
              {isRegister ? 'Servicios profesionales de confianza, cerca de ti.' : 'Encuentra, reserva y sigue tus servicios desde un solo lugar.'}
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
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  loginScrollContent: { backgroundColor: KlippColors.canvas, paddingHorizontal: 22, paddingVertical: 30 },
  loginScrollContentWide: { justifyContent: 'center', minHeight: '100%' },
  loginShell: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  loginShellWide: { paddingHorizontal: 12 },
  brandBlock: { marginBottom: 28, gap: 6 },
  loginBrandBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoMark: { width: 44, height: 44, borderRadius: 16, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: KlippColors.cyan },
  logoLetter: { color: KlippColors.white, fontSize: 25, fontWeight: '900', letterSpacing: -1 },
  brand: { color: KlippColors.navy, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  loginBrand: { color: KlippColors.navy },
  location: { color: KlippColors.muted, fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 1 },
  loginLocation: { color: KlippColors.violet, fontSize: 9, letterSpacing: 1.1 },
  loginMain: { gap: 20 },
  loginMainWide: { alignItems: 'center', justifyContent: 'center', gap: 20 },
  form: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12, padding: 24, borderRadius: 26, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, shadowColor: KlippColors.navy, shadowOpacity: 0.07, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 5 },
  loginForm: { maxWidth: 480, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  loginFormWide: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 30 },
  eyebrow: { color: KlippColors.blue, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 2 },
  loginEyebrow: { color: KlippColors.violet },
  title: { color: KlippColors.navy, fontSize: 31, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  loginTitle: { color: KlippColors.navy },
  subtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 23, marginBottom: 12 },
  loginSubtitle: { color: KlippColors.muted },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '800', marginTop: 5 },
  input: { minHeight: 54, borderWidth: 1, borderColor: KlippColors.borderStrong, borderRadius: 14, paddingHorizontal: 15, color: KlippColors.navy, backgroundColor: KlippColors.white, fontSize: 15 },
  loginInput: { borderColor: KlippColors.borderStrong, color: KlippColors.navy, backgroundColor: KlippColors.white },
  roleOptions: { flexDirection: 'row', gap: 10 },
  roleOption: { flex: 1, minHeight: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: KlippColors.borderStrong, borderRadius: 14, backgroundColor: KlippColors.white, paddingHorizontal: 8 },
  roleOptionSelected: { borderColor: KlippColors.blue, backgroundColor: KlippColors.blueSoft },
  roleText: { color: KlippColors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  roleTextSelected: { color: KlippColors.blueDark },
  error: { color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  notice: { color: KlippColors.success, fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 54, marginTop: 10, borderRadius: 15, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center', shadowColor: KlippColors.blue, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  loginSubmit: { backgroundColor: KlippColors.blue },
  submitDisabled: { backgroundColor: '#93B0FF', shadowOpacity: 0 },
  submitPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  submitText: { color: KlippColors.white, fontSize: 16, fontWeight: '900' },
  loginSubmitText: { color: KlippColors.white, fontWeight: '900' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' },
  switchText: { color: KlippColors.muted, fontSize: 14 },
  loginSwitchText: { color: KlippColors.muted },
  link: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '900' },
  loginLink: { color: KlippColors.violet },
});
