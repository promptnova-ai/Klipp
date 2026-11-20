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
import { DominicanPhoneField, OnboardingChoiceCard, OnboardingProgress } from '@/components/onboarding-primitives';
import { KlippColors } from '@/lib/brand';
import type { ExtractRole } from '@/lib/types';

type AuthScreenProps = { mode: 'login' | 'register' };

const registrationSteps = ['Perfil', 'Contacto', 'Cuenta'];

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'words';
  error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A5B5"
        secureTextEntry={secureTextEntry}
        style={[styles.input, error && styles.inputError]}
        value={value}
      />
      {error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const isRegister = mode === 'register';
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const narrow = width < 370;
  const { session, signIn, signUp, authError } = useAuth();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<ExtractRole>('client');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace('/');
  }, [router, session]);

  function validateStep() {
    if (step === 0 && fullName.trim().length < 2) return 'Escribe tu nombre y apellido para continuar.';
    if (step === 1) {
      if (phone.replace(/\D/g, '').length !== 10) return 'Introduce un número dominicano válido de 10 dígitos.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Escribe un correo electrónico válido.';
    }
    if (step === 2) {
      if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
      if (password !== confirmPassword) return 'Las contraseñas no coinciden.';
    }
    return null;
  }

  function continueRegistration() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, registrationSteps.length - 1));
  }

  async function handleSubmit() {
    setError(null);
    setNotice(null);
    if (isRegister) {
      const validationError = validateStep();
      if (validationError) {
        setError(validationError);
        return;
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('Escribe un correo electrónico válido.');
        return;
      }
      if (!password) {
        setError('Escribe tu contraseña.');
        return;
      }
    }

    setBusy(true);
    try {
      if (isRegister) {
        const hasSession = await signUp(email.trim(), password, fullName.trim(), role, {
          phone: `+1${phone.replace(/\D/g, '')}`,
        });
        if (hasSession) router.replace('/');
        else setNotice('Te enviamos un correo para confirmar tu cuenta. Después podrás iniciar sesión.');
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0} style={styles.flex}>
        <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} contentContainerStyle={[styles.scrollContent, compact && styles.scrollCompact]} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <View style={[styles.topBar, narrow && styles.topBarNarrow]}>
              <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backButton}>
                <Text style={styles.backArrow}>‹</Text>
              </Pressable>
              <View style={styles.brandLockup}>
                <View style={styles.brandMark}><Text style={styles.brandMarkText}>K</Text></View>
                <View>
                  <Text style={styles.brandName}>KLIPP</Text>
                  {!narrow && <Text style={styles.brandRegion}>REPÚBLICA DOMINICANA</Text>}
                </View>
              </View>
              <View style={styles.topRight}>
                {!narrow && <Text style={styles.topRightText}>{isRegister ? '¿Ya tienes cuenta?' : '¿Primera vez?'}</Text>}
                <Link href={isRegister ? '/(auth)/login' : '/(auth)/register'} asChild>
                  <Text style={styles.topLink}>{isRegister ? 'Entrar' : 'Crear cuenta'}</Text>
                </Link>
              </View>
            </View>

            <View style={[styles.content, !compact && styles.contentWide]}>
              <View style={[styles.intro, !compact && styles.introWide]}>
                <View style={styles.introTag}><View style={styles.introDot} /><Text style={styles.introTagText}>SERVICIOS A DOMICILIO</Text></View>
                <Text style={[styles.headline, compact && styles.headlineCompact]}>{isRegister ? 'Todo lo que necesitas, empieza aquí.' : 'Qué bueno verte de nuevo.'}</Text>
                <Text style={styles.introText}>
                  {isRegister
                    ? 'Reserva servicios en casa con profesionales de tu zona. Crea tu cuenta en unos pasos.'
                    : 'Accede a tus reservas, mensajes y profesionales desde un mismo lugar.'}
                </Text>
                {!compact && (
                  <View style={styles.valueList}>
                    <View style={styles.valueItem}><Text style={styles.valueNumber}>01</Text><Text style={styles.valueText}>Elige el servicio que necesitas</Text></View>
                    <View style={styles.valueItem}><Text style={styles.valueNumber}>02</Text><Text style={styles.valueText}>Conoce el precio antes de reservar</Text></View>
                    <View style={styles.valueItem}><Text style={styles.valueNumber}>03</Text><Text style={styles.valueText}>Sigue la llegada del profesional</Text></View>
                  </View>
                )}
              </View>

              <View style={[styles.formCard, compact && styles.formCardCompact]}>
                {isRegister ? (
                  <>
                    <OnboardingProgress steps={registrationSteps} current={step} />
                    <View style={styles.formHeading}>
                      <Text style={styles.eyebrow}>CREAR CUENTA</Text>
                      <Text style={styles.formTitle}>
                        {step === 0 ? '¿Cómo usarás Klipp?' : step === 1 ? 'Tus datos de contacto' : 'Protege tu cuenta'}
                      </Text>
                      <Text style={styles.formSubtitle}>
                        {step === 0 ? 'Elige el tipo de cuenta y dinos cómo te llamas.'
                          : step === 1 ? 'Usaremos estos datos para identificarte y mantenerte al tanto de tus reservas.'
                          : 'Crea una contraseña segura para acceder a Klipp.'}
                      </Text>
                    </View>

                    {step === 0 && (
                      <View style={styles.stepBody}>
                        <OnboardingChoiceCard title="Quiero contratar servicios" description="Buscar profesionales y reservar desde casa." icon="⌂" selected={role === 'client'} onPress={() => setRole('client')} />
                        <OnboardingChoiceCard title="Soy profesional" description="Ofrecer mis servicios y recibir solicitudes." icon="▣" selected={false} accent={KlippColors.teal} onPress={() => router.push('/(auth)/pro-register')} />
                        <FormField label="Nombre y apellido" value={fullName} onChangeText={setFullName} placeholder="Ej. Ana Pérez" autoCapitalize="words" />
                      </View>
                    )}

                    {step === 1 && (
                      <View style={styles.stepBody}>
                        <DominicanPhoneField value={phone} onChangeText={setPhone} />
                        <FormField label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" />
                        <Text style={styles.helper}>El teléfono se guarda como contacto de la cuenta. La verificación SMS se habilitará cuando el proveedor de mensajería esté configurado en Supabase.</Text>
                      </View>
                    )}

                    {step === 2 && (
                      <View style={styles.stepBody}>
                        <FormField label="Contraseña" value={password} onChangeText={setPassword} placeholder="Mínimo 8 caracteres" secureTextEntry={!showPassword} />
                        <FormField label="Confirmar contraseña" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repite la contraseña" secureTextEntry={!showPassword} error={confirmPassword && password !== confirmPassword ? 'Las contraseñas no coinciden.' : undefined} />
                        <Pressable accessibilityRole="button" onPress={() => setShowPassword((current) => !current)} style={styles.passwordToggle}>
                          <Text style={styles.passwordToggleText}>{showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}</Text>
                        </Pressable>
                        <View style={styles.accountNote}><Text style={styles.accountNoteIcon}>✓</Text><Text style={styles.accountNoteText}>Podrás editar tus datos de perfil después de crear la cuenta.</Text></View>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.formHeading}>
                      <Text style={styles.eyebrow}>TU CUENTA KLIPP</Text>
                      <Text style={styles.formTitle}>Inicia sesión</Text>
                      <Text style={styles.formSubtitle}>Entra para consultar tus reservas y continuar donde lo dejaste.</Text>
                    </View>
                    <View style={styles.stepBody}>
                      <FormField label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" />
                      <FormField label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secureTextEntry={!showPassword} />
                      <Pressable accessibilityRole="button" onPress={() => setShowPassword((current) => !current)} style={styles.passwordToggle}>
                        <Text style={styles.passwordToggleText}>{showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}</Text>
                      </Pressable>
                      <View style={styles.forgotRow}><Link href="/(auth)/reset-password" asChild><Text style={styles.textLink}>¿Olvidaste tu contraseña?</Text></Link></View>
                    </View>
                  </>
                )}

                {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                {authError && <Text accessibilityRole="alert" style={styles.error}>{authError}</Text>}
                {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

                {isRegister && step < registrationSteps.length - 1 ? (
                  <Pressable accessibilityRole="button" onPress={continueRegistration} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
                    <Text style={styles.primaryButtonText}>Continuar</Text><Text style={styles.primaryArrow}>→</Text>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => void handleSubmit()} style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && !busy && styles.primaryPressed]}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{isRegister ? 'Crear mi cuenta' : 'Entrar'}</Text>}
                    {!busy && <Text style={styles.primaryArrow}>→</Text>}
                  </Pressable>
                )}

                {isRegister && step > 0 && (
                  <Pressable accessibilityRole="button" onPress={() => { setError(null); setStep((current) => current - 1); }} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Volver al paso anterior</Text>
                  </Pressable>
                )}
                <Text style={styles.legal}>Al continuar, aceptas las condiciones de uso y la política de privacidad de Klipp.</Text>
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
  safeArea: { flex: 1, backgroundColor: '#F5F7FA' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 20 },
  scrollCompact: { paddingHorizontal: 18, paddingVertical: 12 },
  shell: { width: '100%', maxWidth: 1180, alignSelf: 'center', flex: 1 },
  topBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, gap: 8 },
  topBarNarrow: { minHeight: 52, marginBottom: 16 },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  backArrow: { color: KlippColors.navy, fontSize: 34, lineHeight: 38 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 'auto' },
  brandMark: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.navy },
  brandMarkText: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  brandName: { color: KlippColors.navy, fontSize: 19, fontWeight: '900', letterSpacing: 1.2 },
  brandRegion: { color: '#718096', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  topRightText: { color: '#718096', fontSize: 12 },
  topLink: { color: KlippColors.navy, fontSize: 12, fontWeight: '900' },
  content: { flex: 1, justifyContent: 'center', gap: 24 },
  contentWide: { flexDirection: 'row', alignItems: 'center', gap: 70 },
  intro: { gap: 15 },
  introWide: { flex: 1, maxWidth: 450 },
  introTag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: KlippColors.teal },
  introTagText: { color: KlippColors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  headline: { color: KlippColors.navy, fontSize: 34, lineHeight: 41, fontWeight: '900', letterSpacing: -0.8, maxWidth: 470 },
  headlineCompact: { fontSize: 29, lineHeight: 35, letterSpacing: -0.55 },
  introText: { color: '#526579', fontSize: 15, lineHeight: 23, maxWidth: 430 },
  valueList: { gap: 15, marginTop: 10 },
  valueItem: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  valueNumber: { color: KlippColors.tealDark, fontSize: 11, fontWeight: '900' },
  valueText: { color: KlippColors.navy, fontSize: 13, fontWeight: '700' },
  formCard: { width: '100%', maxWidth: 500, alignSelf: 'center', padding: 28, borderRadius: 24, borderWidth: 1, borderColor: '#E0E7EF', backgroundColor: '#FFFFFF', gap: 22, shadowColor: '#153B66', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 14 }, shadowRadius: 28, elevation: 4 },
  formCardCompact: { padding: 18, borderRadius: 20, gap: 18 },
  formHeading: { gap: 7 },
  eyebrow: { color: KlippColors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  formTitle: { color: KlippColors.navy, fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.5 },
  formSubtitle: { color: '#66788B', fontSize: 13, lineHeight: 20 },
  stepBody: { gap: 17 },
  field: { gap: 8 },
  label: { color: '#344054', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 56, paddingHorizontal: 16, borderWidth: 1, borderColor: '#DCE5EC', borderRadius: 15, backgroundColor: '#FFFFFF', color: KlippColors.navy, fontSize: 15 },
  inputError: { borderColor: '#B42318' },
  fieldError: { color: '#B42318', fontSize: 11 },
  helper: { color: '#718096', fontSize: 11, lineHeight: 17 },
  passwordToggle: { alignSelf: 'flex-end', paddingVertical: 3 },
  passwordToggleText: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  forgotRow: { alignItems: 'flex-end' },
  textLink: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  primaryButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 16, backgroundColor: KlippColors.navy },
  primaryPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  primaryArrow: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#66788B', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  accountNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, backgroundColor: '#F0F7F5' },
  accountNoteIcon: { color: KlippColors.tealDark, fontSize: 14, fontWeight: '900' },
  accountNoteText: { flex: 1, color: '#526579', fontSize: 11, lineHeight: 16 },
  error: { padding: 12, borderRadius: 13, backgroundColor: '#FDECEA', color: '#B42318', fontSize: 12, lineHeight: 18 },
  notice: { padding: 12, borderRadius: 13, backgroundColor: '#E4F8F6', color: '#0D9189', fontSize: 12, lineHeight: 18 },
  legal: { color: '#8794A4', fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
