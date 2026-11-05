import { Link, useRouter } from 'expo-router';
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
    <SafeAreaView style={[styles.safeArea, isRegister && styles.registerSafeArea]}>
      {isRegister && (
        <>
          <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1675034743339-0b0747047727?auto=format&fit=crop&w=1800&q=85' }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={styles.registerPhotoOverlay} />
        </>
      )}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scrollContent, !isRegister && styles.loginScrollContent, wideLogin && styles.loginScrollContentWide]} keyboardShouldPersistTaps="handled">
          <View style={[styles.loginShell, wideLogin && styles.loginShellWide]}>
            <View style={[styles.brandBlock, !isRegister && styles.loginBrandBlock]}>
              <View style={styles.brandRow}>
                <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
                <Text style={[styles.brand, !isRegister && styles.loginBrand, isRegister && styles.registerBrand]}>Klipp</Text>
              </View>
              <Text style={[styles.location, !isRegister && styles.loginLocation, isRegister && styles.registerLocation]}>TU SERVICIO, EN CAMINO</Text>
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
                    ['client', 'Soy cliente', 'Quiero encontrar y reservar servicios'],
                    ['pro', 'Soy profesional', 'Quiero ofrecer mis servicios en Klipp'],
                  ] as const).map(([value, label, description]) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: role === value }}
                      key={value}
                      onPress={() => value === 'pro' ? router.push('/(auth)/pro-register') : setRole(value)}
                      style={[styles.roleOption, role === value && styles.roleOptionSelected]}>
                      <View style={[styles.roleDot, role === value && styles.roleDotSelected]} />
                      <View style={styles.roleCopy}>
                        <Text style={[styles.roleText, role === value && styles.roleTextSelected]}>{label}</Text>
                        <Text style={styles.roleDescription}>{description}</Text>
                      </View>
                      <Text style={[styles.roleArrow, role === value && styles.roleTextSelected]}>›</Text>
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
  registerSafeArea: { backgroundColor: '#101827' },
  registerPhotoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7, 17, 34, 0.48)' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  loginScrollContent: { backgroundColor: KlippColors.canvas, paddingHorizontal: 22, paddingVertical: 30 },
  loginScrollContentWide: { justifyContent: 'center', minHeight: '100%' },
  loginShell: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  loginShellWide: { paddingHorizontal: 12 },
  brandBlock: { marginBottom: 30, gap: 8 },
  loginBrandBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoMark: { width: 44, height: 44, borderRadius: 16, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: KlippColors.cyan },
  logoLetter: { color: KlippColors.white, fontSize: 25, fontWeight: '900', letterSpacing: -1 },
  brand: { color: KlippColors.navy, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  registerBrand: { color: KlippColors.white },
  loginBrand: { color: KlippColors.navy },
  location: { color: KlippColors.muted, fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 1 },
  registerLocation: { color: '#DCE8F7' },
  loginLocation: { color: KlippColors.violet, fontSize: 9, letterSpacing: 1.1 },
  loginMain: { gap: 20 },
  loginMainWide: { alignItems: 'center', justifyContent: 'center', gap: 20 },
  form: { width: '100%', maxWidth: 500, alignSelf: 'center', gap: 13, padding: 28, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)', backgroundColor: 'rgba(255,255,255,0.96)', shadowColor: KlippColors.navy, shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 5 },
  loginForm: { maxWidth: 480, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  loginFormWide: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 30 },
  eyebrow: { color: KlippColors.blue, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 2 },
  loginEyebrow: { color: KlippColors.violet },
  title: { color: KlippColors.navy, fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1.1 },
  loginTitle: { color: KlippColors.navy },
  subtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 23, marginBottom: 12 },
  loginSubtitle: { color: KlippColors.muted },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '800', marginTop: 5 },
  input: { minHeight: 56, borderWidth: 1, borderColor: '#E1E8F1', borderRadius: 16, paddingHorizontal: 16, color: KlippColors.navy, backgroundColor: '#FAFBFD', fontSize: 15 },
  loginInput: { borderColor: KlippColors.borderStrong, color: KlippColors.navy, backgroundColor: KlippColors.white },
  roleOptions: { flexDirection: 'column', gap: 10, marginTop: 2, marginBottom: 4 },
  roleOption: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E4EAF2', borderRadius: 18, backgroundColor: '#FAFBFD', paddingHorizontal: 15, paddingVertical: 12 },
  roleOptionSelected: { borderColor: KlippColors.blue, backgroundColor: '#F0F5FF' },
  roleText: { color: KlippColors.navy, fontSize: 14, fontWeight: '900' },
  roleTextSelected: { color: KlippColors.blueDark },
  roleCopy: { flex: 1, gap: 4 },
  roleDescription: { color: KlippColors.muted, fontSize: 11, lineHeight: 16 },
  roleDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#B8C4D5', backgroundColor: KlippColors.white },
  roleDotSelected: { borderWidth: 5, borderColor: KlippColors.blue },
  roleArrow: { color: '#9AA8BA', fontSize: 24, lineHeight: 26 },
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
