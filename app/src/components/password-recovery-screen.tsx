import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { KlippButton, KlippField } from '@/design-system';
import { KlippTokens } from '@/design-system/tokens';
import { KlippColors } from '@/lib/brand';

export function PasswordRecoveryScreen() {
  const router = useRouter();
  const { passwordRecovery, resetPassword, updatePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setNotice(null);
    if (!passwordRecovery) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizedEmail)) {
        setError('Introduce un correo electrónico válido.');
        return;
      }
      setBusy(true);
      try {
        await resetPassword(normalizedEmail);
        setNotice('Si existe una cuenta asociada a ese correo, recibirás un enlace para cambiar la contraseña.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No pudimos enviar la solicitud. Inténtalo de nuevo.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar la contraseña.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>K</Text></View>
            <Text style={styles.eyebrow}>CUENTA KLIPP</Text>
            <Text style={styles.title}>{passwordRecovery ? 'Crea una nueva contraseña' : 'Recupera tu acceso'}</Text>
            <Text style={styles.subtitle}>
              {passwordRecovery
                ? 'Elige una contraseña nueva para volver a entrar en tu cuenta.'
                : 'Te enviaremos un enlace seguro al correo asociado a tu cuenta.'}
            </Text>

            {!passwordRecovery ? (
              <KlippField
                label="Correo electrónico"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="nombre@correo.com"
                value={email}
                mode="light"
              />
            ) : (
              <>
                <KlippField
                  label="Nueva contraseña"
                  autoComplete="new-password"
                  onChangeText={setPassword}
                  placeholder="Mínimo 6 caracteres"
                  secureTextEntry
                  value={password}
                  mode="light"
                />
                <KlippField
                  label="Repite la contraseña"
                  autoComplete="new-password"
                  onChangeText={setConfirmation}
                  placeholder="Confirma tu nueva contraseña"
                  secureTextEntry
                  value={confirmation}
                  mode="light"
                />
              </>
            )}

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {notice ? <Text accessibilityRole="status" style={styles.notice}>{notice}</Text> : null}

            <KlippButton
              label={passwordRecovery ? 'Guardar contraseña' : 'Enviar enlace'}
              onPress={() => void handleSubmit()}
              loading={busy}
              disabled={passwordRecovery
                ? !password || !confirmation
                : !email.trim()}
              mode="light"
            />
            <View style={styles.backRow}>
              <Link href="/(auth)/login" asChild>
                <Text style={styles.backLink}>Volver a iniciar sesión</Text>
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
  safeArea: { flex: 1, backgroundColor: KlippTokens.color.light.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 26,
    gap: 16,
    borderWidth: 1,
    borderColor: KlippTokens.color.light.border,
    borderRadius: KlippTokens.radius.xl,
    backgroundColor: KlippTokens.color.light.surface,
    shadowColor: '#17243D',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 26,
    elevation: 3,
  },
  brandMark: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.navy },
  brandMarkText: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  eyebrow: { color: KlippColors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: KlippColors.navy, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  error: { padding: 12, borderWidth: 1, borderColor: '#FECACA', borderRadius: 13, backgroundColor: '#FEF2F2', color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  notice: { padding: 12, borderWidth: 1, borderColor: '#B7E4D1', borderRadius: 13, backgroundColor: '#ECFDF5', color: '#067647', fontSize: 13, lineHeight: 19 },
  backRow: { alignItems: 'center', minHeight: 36, justifyContent: 'center' },
  backLink: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '800' },
});
