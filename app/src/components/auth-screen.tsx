import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
  const wideLayout = width >= 900;
  const router = useRouter();
  const { session, signIn, signUp, authError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ExtractRole>('client');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stepMotion] = useState(() => new Animated.Value(1));
  const stepTranslate = stepMotion.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

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

  const [registerStep, setRegisterStep] = useState(0);

  function moveRegisterStep(nextStep: number) {
    stepMotion.stopAnimation();
    Animated.timing(stepMotion, { toValue: 0, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (!finished) return;
      setRegisterStep(nextStep);
      stepMotion.setValue(0);
      Animated.spring(stepMotion, { toValue: 1, speed: 20, bounciness: 2, useNativeDriver: Platform.OS !== 'web' }).start();
    });
  }

  function continueRegister() {
    if (!fullName.trim()) { setError('Escribe tu nombre completo para continuar.'); return; }
    setError(null);
    moveRegisterStep(1);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
              <Text style={styles.brand}>Klipp</Text>
            </View>
            <Text style={styles.topHint}>{isRegister ? 'ÚNETE A KLIPP' : 'BIENVENIDO DE NUEVO'}</Text>
          </View>

          <View style={[styles.layout, !wideLayout && styles.layoutCompact]}>
            {wideLayout && <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1500&q=88' }} imageStyle={styles.storyImage} style={styles.storyPanel}><View style={styles.storyScrim} />
              <View style={styles.storyBadge}><Text style={styles.storyBadgeText}>SERVICIOS, A TU MANERA</Text></View>
              <Text style={styles.storyTitle}>{isRegister ? 'Tu próximo gran servicio empieza aquí.' : 'Todo lo que necesitas, en un solo lugar.'}</Text>
              <Text style={styles.storyCopy}>{isRegister ? 'Conecta con profesionales de confianza o haz crecer tu propio negocio con Klipp.' : 'Entra para descubrir profesionales, gestionar tus reservas y seguir cada servicio.'}</Text>
              <View style={styles.storyDivider} />
              <View style={styles.storyFeature}><Text style={styles.featureMark}>✓</Text><Text style={styles.featureText}>Profesionales cerca de ti</Text></View>
              <View style={styles.storyFeature}><Text style={styles.featureMark}>✓</Text><Text style={styles.featureText}>Reservas sencillas y seguras</Text></View>
              <View style={styles.storyFeature}><Text style={styles.featureMark}>✓</Text><Text style={styles.featureText}>Todo desde una sola app</Text></View>
              <View style={styles.storyAccent}><Text style={styles.storyAccentText}>KLIPP · REPÚBLICA DOMINICANA</Text></View>
            </ImageBackground>}

            {!wideLayout && <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=85' }} imageStyle={styles.mobileHeroImage} style={styles.mobileHero}><View style={styles.mobileHeroScrim} /><Text style={styles.mobileHeroEyebrow}>KLIPP · SERVICIOS A TU MANERA</Text><Text style={styles.mobileHeroTitle}>Tu tiempo. Tu estilo. Tu Klipp.</Text></ImageBackground>}

            <Animated.View style={[styles.formColumn, !wideLayout && styles.formColumnCompact, { opacity: stepMotion, transform: [{ translateY: stepTranslate }] }]}>
              <View style={styles.formHeader}>
                <Text style={styles.eyebrow}>{isRegister ? (registerStep === 0 ? '01 / ELIGE TU EXPERIENCIA' : '02 / CREA TU CUENTA') : 'TU ESPACIO KLIPP'}</Text>
                <Text style={styles.title}>{isRegister ? (registerStep === 0 ? '¿Cómo quieres usar Klipp?' : 'Empecemos por ti.') : 'Qué bueno verte.'}</Text>
                <Text style={styles.subtitle}>{isRegister ? (registerStep === 0 ? 'Selecciona el perfil que mejor describe lo que necesitas.' : 'Completa tus datos para crear tu cuenta.') : 'Accede a tus servicios y continúa donde lo dejaste.'}</Text>
              </View>

              {isRegister && registerStep === 0 && (
                <View style={styles.roleGrid}>
                  <Pressable accessibilityRole="radio" accessibilityState={{ selected: role === 'client' }} onPress={() => { setRole('client'); setError(null); moveRegisterStep(1); }} style={[styles.roleCard, role === 'client' && styles.roleCardSelected]}>
                    <View style={styles.roleIcon}><Text style={styles.roleIconText}>⌂</Text></View>
                    <View style={styles.roleCardCopy}><Text style={styles.roleTitle}>Soy cliente</Text><Text style={styles.roleDescription}>Quiero contratar servicios de confianza.</Text></View>
                    <View style={[styles.radio, role === 'client' && styles.radioSelected]} />
                  </Pressable>
                  <Pressable accessibilityRole="radio" accessibilityState={{ selected: role === 'pro' }} onPress={() => router.push('/(auth)/pro-register')} style={styles.roleCard}>
                    <View style={[styles.roleIcon, styles.roleIconPro]}><Text style={styles.roleIconText}>✦</Text></View>
                    <View style={styles.roleCardCopy}><Text style={styles.roleTitle}>Soy profesional</Text><Text style={styles.roleDescription}>Quiero ofrecer mis habilidades en Klipp.</Text></View>
                    <Text style={styles.roleArrow}>›</Text>
                  </Pressable>
                </View>
              )}

              {(!isRegister || registerStep === 1) && (
                <View style={styles.fieldsPanel}>
                  {isRegister && (
                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Nombre completo</Text>
                      <TextInput autoComplete="name" autoCapitalize="words" onChangeText={setFullName} placeholder="Ej. María Rodríguez" placeholderTextColor="#9A9A9A" style={styles.input} value={fullName} />
                    </View>
                  )}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Correo electrónico</Text>
                    <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="nombre@correo.com" placeholderTextColor="#9A9A9A" style={styles.input} value={email} />
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Contraseña</Text>
                    <TextInput autoComplete={isRegister ? 'new-password' : 'current-password'} onChangeText={setPassword} placeholder="Mínimo 8 caracteres" placeholderTextColor="#9A9A9A" secureTextEntry style={styles.input} value={password} />
                  </View>
                  <Text style={styles.secureNote}><Text style={styles.secureMark}>●</Text> Tus datos se transmiten de forma segura.</Text>
                </View>
              )}

              {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              {authError && <Text accessibilityRole="alert" style={styles.error}>{authError}</Text>}
              {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

              <View style={styles.actions}>
                {isRegister && registerStep === 1 && <Pressable onPress={() => moveRegisterStep(0)} style={styles.backAction}><Text style={styles.backActionText}>← Atrás</Text></Pressable>}
                <Pressable accessibilityRole="button" disabled={busy || (!isRegister && (!email.trim() || !password)) || (isRegister && registerStep === 1 && (!email.trim() || !password))} onPress={() => isRegister && registerStep === 0 ? continueRegister() : void handleSubmit()} style={({ pressed }) => [styles.submit, (busy || (!isRegister && (!email.trim() || !password)) || (isRegister && registerStep === 1 && (!email.trim() || !password))) && styles.submitDisabled, pressed && styles.submitPressed]}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{isRegister ? (registerStep === 0 ? 'Continuar' : 'Crear cuenta') : 'Iniciar sesión'}</Text>}
                  {!busy && <Text style={styles.submitArrow}>→</Text>}
                </Pressable>
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchText}>{isRegister ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}</Text>
                <Link href={isRegister ? '/(auth)/login' : '/(auth)/register'} asChild><Text style={styles.link}>{isRegister ? 'Inicia sesión' : 'Regístrate'}</Text></Link>
              </View>
            </Animated.View>
          </View>
          <View style={styles.bottomNote}><Text style={styles.bottomNoteText}>KLIPP · TU SERVICIO, EN CAMINO</Text><Text style={styles.bottomNoteText}>República Dominicana</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  page: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  topBar: { width: '100%', maxWidth: 1180, alignSelf: 'center', minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 34 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#FF5A5F', alignItems: 'center', justifyContent: 'center' },
  logoLetter: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  brand: { color: '#222222', fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  topHint: { color: '#717171', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  layout: { width: '100%', maxWidth: 1180, alignSelf: 'center', flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 48 },
  layoutCompact: { flex: 0, flexDirection: 'column', justifyContent: 'flex-start', gap: 24 },
  storyPanel: { flex: 1, minHeight: 600, borderRadius: 30, backgroundColor: '#222222', padding: 38, justifyContent: 'center', overflow: 'hidden' },
  storyImage: { borderRadius: 30 },
  storyScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22, 16, 18, 0.58)' },
  mobileHero: { width: '100%', height: 228, justifyContent: 'flex-end', padding: 24, borderRadius: 24, overflow: 'hidden', backgroundColor: '#222222' },
  mobileHeroImage: { borderRadius: 24 },
  mobileHeroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22, 16, 18, 0.42)' },
  mobileHeroEyebrow: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  mobileHeroTitle: { maxWidth: 290, marginTop: 9, color: '#FFFFFF', fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  storyBadge: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  storyBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  storyTitle: { marginTop: 28, color: '#FFFFFF', fontSize: 42, lineHeight: 48, fontWeight: '900', letterSpacing: -1.6 },
  storyCopy: { marginTop: 16, color: 'rgba(255,255,255,0.86)', fontSize: 16, lineHeight: 25, maxWidth: 430 },
  storyDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.28)', marginVertical: 28 },
  storyFeature: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
  featureMark: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: '#FFFFFF', backgroundColor: '#00A699', fontWeight: '900' },
  featureText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  storyAccent: { marginTop: 30, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  storyAccentText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  formColumn: { width: '100%', maxWidth: 480, justifyContent: 'center', paddingVertical: 20 },
  formColumnCompact: { maxWidth: 560, alignSelf: 'center', paddingVertical: 8 },
  formHeader: { marginBottom: 28, gap: 10 },
  eyebrow: { color: '#E31C5F', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#222222', fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: '#717171', fontSize: 14, lineHeight: 21 },
  roleGrid: { gap: 14 },
  roleCard: { minHeight: 116, flexDirection: 'row', alignItems: 'center', gap: 15, padding: 18, borderWidth: 1, borderColor: '#EBEBEB', borderRadius: 20, backgroundColor: '#FFFFFF' },
  roleCardSelected: { borderColor: '#FF5A5F', backgroundColor: '#FFF8F8' },
  roleIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F1' },
  roleIconPro: { backgroundColor: '#E8F6F4' },
  roleIconText: { color: '#E31C5F', fontSize: 26, fontWeight: '800' },
  roleCardCopy: { flex: 1, gap: 5 },
  roleTitle: { color: '#222222', fontSize: 16, fontWeight: '900' },
  roleDescription: { color: '#717171', fontSize: 12, lineHeight: 18 },
  radio: { width: 21, height: 21, borderWidth: 1.5, borderColor: '#B0B0B0', borderRadius: 11 },
  radioSelected: { borderWidth: 6, borderColor: '#FF5A5F' },
  roleArrow: { color: '#717171', fontSize: 27 },
  fieldsPanel: { gap: 18 },
  fieldGroup: { gap: 8 },
  label: { color: '#484848', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 58, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 14, paddingHorizontal: 16, color: '#222222', backgroundColor: '#FFFFFF', fontSize: 15 },
  secureNote: { color: '#717171', fontSize: 11, marginTop: 2 },
  secureMark: { color: '#00A699' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  backAction: { minHeight: 54, paddingHorizontal: 14, justifyContent: 'center' },
  backActionText: { color: '#484848', fontSize: 13, fontWeight: '800' },
  submit: { flex: 1, minHeight: 56, borderRadius: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FF5A5F' },
  submitDisabled: { opacity: 0.5 },
  submitPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  submitArrow: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  error: { color: '#C13515', fontSize: 13, marginTop: 12 },
  notice: { color: '#008A70', fontSize: 13, marginTop: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginTop: 25 },
  switchText: { color: '#717171', fontSize: 13 },
  link: { color: '#E31C5F', fontSize: 13, fontWeight: '900' },
  bottomNote: { width: '100%', maxWidth: 1180, alignSelf: 'center', marginTop: 30, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0', flexDirection: 'row', justifyContent: 'space-between' },
  bottomNoteText: { color: '#999999', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
