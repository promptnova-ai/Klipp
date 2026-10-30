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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import type { ExtractRole } from '@/lib/types';

type AuthScreenProps = { mode: 'login' | 'register' };

export function AuthScreen({ mode }: AuthScreenProps) {
  const isRegister = mode === 'register';
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
          <View style={styles.brandBlock}>
            <View style={styles.brandRow}>
              <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
              <View><Text style={styles.brand}>klipp</Text><Text style={styles.location}>SERVICIOS A DOMICILIO · RD</Text></View>
            </View>
            <View style={styles.welcomeHero}>
              <Text style={styles.welcomeEyebrow}>TU TIEMPO VALE</Text>
              <Text style={styles.welcomeTitle}>La ayuda que necesitas, a un toque.</Text>
              <Text style={styles.welcomeBody}>Descubre profesionales, reserva en tu zona y sigue cada servicio desde Klipp.</Text>
              <View style={styles.welcomeBenefits}>
                <View style={styles.benefit}><Text style={styles.benefitMark}>✓</Text><Text style={styles.benefitText}>Profesionales verificados</Text></View>
                <View style={styles.benefit}><Text style={styles.benefitMark}>✓</Text><Text style={styles.benefitText}>Reserva y seguimiento</Text></View>
              </View>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.eyebrow}>{isRegister ? 'EMPIEZA CON KLIPP' : 'QUÉ BUENO VERTE'}</Text>
            <Text style={styles.title}>{isRegister ? 'Crea tu cuenta' : 'Inicia sesión'}</Text>
            <Text style={styles.subtitle}>
              {isRegister ? 'Encuentra ayuda confiable para tu hogar y tu día a día.' : 'Accede a tu espacio de Klipp.'}
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
                  style={styles.input}
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
              style={styles.input}
              value={email}
            />
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor="#85918b"
              secureTextEntry
              style={styles.input}
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
                (busy || !email.trim() || !password) && styles.submitDisabled,
                pressed && !busy && styles.submitPressed,
              ]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{isRegister ? 'Crear cuenta' : 'Entrar'}</Text>}
            </Pressable>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{isRegister ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}</Text>
              <Link href={isRegister ? '/(auth)/login' : '/(auth)/register'} asChild>
                <Text style={styles.link}>{isRegister ? 'Inicia sesión' : 'Regístrate'}</Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F5F7FC' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 28 },
  brandBlock: { width: '100%', maxWidth: 480, alignSelf: 'center', marginBottom: 20, gap: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#315BFF', alignItems: 'center', justifyContent: 'center' },
  logoLetter: { color: KlippColors.white, fontSize: 23, fontWeight: '900' },
  brand: { color: '#15213B', fontSize: 28, lineHeight: 29, fontWeight: '900', letterSpacing: -1 },
  location: { color: '#8792A5', fontSize: 8, fontWeight: '900', marginTop: 3, letterSpacing: 0.8 },
  form: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 11, padding: 23, borderRadius: 24, borderWidth: 1, borderColor: '#E4E9F2', backgroundColor: '#FFFFFF', shadowColor: '#182B55', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 10 }, shadowRadius: 20, elevation: 3 },
  eyebrow: { color: KlippColors.blue, fontSize: 11, fontWeight: '800', marginBottom: 2 },
  title: { color: KlippColors.navy, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  subtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700', marginTop: 5 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#DCE3EF', borderRadius: 13, paddingHorizontal: 15, color: '#15213B', backgroundColor: '#FFFFFF', fontSize: 14 },
  roleOptions: { flexDirection: 'row', gap: 10 },
  roleOption: { flex: 1, minHeight: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#DCE3EF', borderRadius: 13, backgroundColor: '#FFFFFF', paddingHorizontal: 8 },
  roleOptionSelected: { borderColor: '#315BFF', backgroundColor: '#EEF2FF' },
  roleText: { color: KlippColors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  roleTextSelected: { color: KlippColors.blueDark },
  error: { color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  notice: { color: '#067647', fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 55, marginTop: 9, borderRadius: 14, backgroundColor: '#315BFF', alignItems: 'center', justifyContent: 'center' },
  submitDisabled: { backgroundColor: '#93B0FF' },
  submitPressed: { opacity: 0.85 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' },
  switchText: { color: '#52615b', fontSize: 14 },
  link: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  welcomeHero: { overflow: 'hidden', padding: 22, borderRadius: 24, backgroundColor: '#244BDE', gap: 9, shadowColor: '#244BDE', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 9 }, shadowRadius: 16, elevation: 4 },
  welcomeEyebrow: { color: '#D4DEFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  welcomeTitle: { maxWidth: 360, color: '#FFFFFF', fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7 },
  welcomeBody: { color: '#E2E9FF', fontSize: 12, lineHeight: 18 },
  welcomeBenefits: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  benefitMark: { color: '#B6F0D2', fontSize: 12, fontWeight: '900' },
  benefitText: { color: '#E2E9FF', fontSize: 9, fontWeight: '700' },
});