import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
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
import type { ExtractRole } from '@/lib/types';

type AuthScreenProps = { mode: 'login' | 'register' };

export function AuthScreen({ mode }: AuthScreenProps) {
  const isRegister = mode === 'register';
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ExtractRole>('client');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
            <Text style={styles.brand}>Klipp</Text>
            <Text style={styles.location}>SANTO DOMINGO, RD</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.eyebrow}>{isRegister ? 'EMPIEZA CON KLIPP' : 'QUÉ BUENO VERTE'}</Text>
            <Text style={styles.title}>{isRegister ? 'Crea tu cuenta' : 'Inicia sesión'}</Text>
            <Text style={styles.subtitle}>
              {isRegister ? 'Servicios de limpieza confiables, cerca de ti.' : 'Accede a tu espacio de Klipp.'}
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
                      onPress={() => setRole(value)}
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
  safeArea: { flex: 1, backgroundColor: '#f4f7f5' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  brandBlock: { marginBottom: 34 },
  brand: { color: '#125e56', fontSize: 30, fontWeight: '800' },
  location: { color: '#68756f', fontSize: 11, fontWeight: '700', marginTop: 5 },
  form: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 10 },
  eyebrow: { color: '#16766c', fontSize: 11, fontWeight: '800', marginBottom: 2 },
  title: { color: '#18332d', fontSize: 30, lineHeight: 36, fontWeight: '700' },
  subtitle: { color: '#52615b', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  label: { color: '#263b34', fontSize: 13, fontWeight: '700', marginTop: 5 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 7, paddingHorizontal: 14, color: '#18332d', backgroundColor: '#fff', fontSize: 15 },
  roleOptions: { flexDirection: 'row', gap: 10 },
  roleOption: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 7, backgroundColor: '#fff', paddingHorizontal: 8 },
  roleOptionSelected: { borderColor: '#16766c', backgroundColor: '#e7f1ed' },
  roleText: { color: '#52615b', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  roleTextSelected: { color: '#125e56' },
  error: { color: '#a32f27', fontSize: 13, lineHeight: 19 },
  notice: { color: '#125e56', fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 52, marginTop: 8, borderRadius: 7, backgroundColor: '#16766c', alignItems: 'center', justifyContent: 'center' },
  submitDisabled: { backgroundColor: '#91aaa2' },
  submitPressed: { opacity: 0.85 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' },
  switchText: { color: '#52615b', fontSize: 14 },
  link: { color: '#125e56', fontSize: 14, fontWeight: '700' },
});