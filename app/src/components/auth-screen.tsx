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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import type { ExtractRole } from '@/lib/types';

type AuthScreenProps = { mode: 'login' | 'register' };

const quickActions = [
  { title: 'Mis Llaves', icon: { ios: 'key.fill', android: 'key', web: 'vpn_key' } },
  { title: 'Invitaciones', icon: { ios: 'paperplane.fill', android: 'send', web: 'send' } },
  { title: 'Ajustes', icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' } },
] as const;

function LoginShowcase({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.showcase, compact && styles.showcaseCompact]}>
      <View style={styles.terminal}>
        <View style={styles.terminalTop}>
          <View style={styles.terminalStripe} />
          <View style={styles.terminalBrand}>
            <View style={styles.terminalMark}><Text style={styles.terminalMarkLetter}>K</Text></View>
            <Text style={styles.terminalBrandName}>KLIPP</Text>
          </View>
          <Text style={styles.terminalId}>ACCESS TERMINAL 01</Text>
        </View>
        <View style={styles.terminalDisplay}>
          <View style={styles.screenHeader}>
            <Text style={styles.screenBrand}>KLIPP</Text>
            <View style={styles.screenMenu}><View /><View /><View /></View>
          </View>
          <Text style={styles.screenKicker}>ACCESO INTELIGENTE · EN LÍNEA</Text>
          <Text style={styles.screenTitle}>¡Bienvenido A KLIPP!</Text>
          <Text style={styles.screenSubtitle}>El Futuro del Acceso</Text>
          <Text style={styles.screenDescription}>
            Gestione sus llaves, invitaciones y accesos de forma inteligente.
          </Text>
          <View style={styles.quickActions}>
            {quickActions.map((action) => (
              <View key={action.title} style={styles.quickAction}>
                <SymbolView name={action.icon} tintColor="#0f172a" size={18} />
                <Text style={styles.quickActionText}>{action.title}</Text>
              </View>
            ))}
          </View>
          <View style={styles.accessPanel}>
            <View style={styles.accessPanelTitleRow}>
              <Text style={styles.accessPanelTitle}>ÚLTIMOS ACCESOS</Text>
              <View style={styles.liveStatus}><View style={styles.liveDot} /><Text style={styles.liveText}>EN VIVO</Text></View>
            </View>
            <View style={styles.accessRow}>
              <View style={styles.accessAvatar}><Text style={styles.accessInitials}>MG</Text></View>
              <View style={styles.accessPerson}><Text style={styles.accessName}>Maria Garcia</Text><Text style={styles.accessDetail}>Entrada principal</Text></View>
              <Text style={styles.accessTime}>09:15</Text>
            </View>
            <View style={styles.accessRow}>
              <View style={styles.accessAvatar}><Text style={styles.accessInitials}>CM</Text></View>
              <View style={styles.accessPerson}><Text style={styles.accessName}>Carlos Mendez</Text><Text style={styles.accessDetail}>Acceso de residente</Text></View>
              <Text style={styles.accessTime}>08:42</Text>
            </View>
          </View>
        </View>
        <View style={styles.readerShelf}>
          <View style={styles.readerUnit}><View style={styles.readerGlow} /><SymbolView name={{ ios: 'wave.3.right', android: 'contactless', web: 'contactless' }} tintColor="#a3e635" size={18} /><Text style={styles.readerText}>NFC</Text></View>
          <View style={styles.readerUnit}><SymbolView name={{ ios: 'touchid', android: 'fingerprint', web: 'fingerprint' }} tintColor="#dce5ed" size={19} /><Text style={styles.readerSecondary}>HUELLA</Text></View>
        </View>
      </View>

      {!compact && (
        <View style={styles.phone}>
          <View style={styles.phoneScreen}>
            <View style={styles.phoneNotch} />
            <View style={styles.phoneStatus}><Text style={styles.phoneTime}>9:41</Text><Text style={styles.phoneSignal}>● ● ●</Text></View>
            <View style={styles.phoneBrandRow}><Text style={styles.phoneBrand}>K KLIPP</Text><View style={styles.phoneProfile}><Text style={styles.phoneProfileText}>MG</Text></View></View>
            <Text style={styles.phoneGreeting}>Hola, Maria</Text>
            <Text style={styles.phoneMessage}>Tu hogar está a un toque.</Text>
            <View style={styles.digitalKey}>
              <Text style={styles.digitalKeyLabel}>LLAVE PRINCIPAL</Text>
              <View style={styles.digitalKeyIcon}><SymbolView name={{ ios: 'key.fill', android: 'key', web: 'vpn_key' }} tintColor="#0f172a" size={22} /></View>
              <Text style={styles.digitalKeyName}>Mi hogar</Text>
              <Text style={styles.digitalKeyAddress}>Entrada principal</Text>
              <View style={styles.openButton}><SymbolView name={{ ios: 'lock.open.fill', android: 'lock_open', web: 'lock_open' }} tintColor="#0f172a" size={14} /><Text style={styles.openButtonText}>Abrir puerta</Text></View>
            </View>
            <Text style={styles.phoneRecentTitle}>ACCESO RECIENTE</Text>
            <View style={styles.phoneRecent}><View style={styles.phoneRecentDot} /><View><Text style={styles.phoneRecentName}>Entrada principal</Text><Text style={styles.phoneRecentTime}>Hoy, 09:15</Text></View></View>
            <View style={styles.phoneNav}><Text style={styles.phoneNavActive}>Llaves</Text><Text style={styles.phoneNavText}>Invitados</Text><Text style={styles.phoneNavText}>Perfil</Text></View>
          </View>
        </View>
      )}
    </View>
  );
}

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
                <Text style={[styles.brand, !isRegister && styles.loginBrand]}>KLIPP</Text>
              </View>
              <Text style={[styles.location, !isRegister && styles.loginLocation]}>SANTO DOMINGO, RD</Text>
            </View>

            <View style={[styles.loginMain, wideLogin && styles.loginMainWide]}>
              {!isRegister && <LoginShowcase compact={!wideLogin} />}
          <View style={[styles.form, !isRegister && styles.loginForm, wideLogin && styles.loginFormWide]}>
            <Text style={[styles.eyebrow, !isRegister && styles.loginEyebrow]}>{isRegister ? 'EMPIEZA CON KLIPP' : 'CUENTA KLIPP'}</Text>
            <Text style={[styles.title, !isRegister && styles.loginTitle]}>{isRegister ? 'Crea tu cuenta' : 'Inicia sesión'}</Text>
            <Text style={[styles.subtitle, !isRegister && styles.loginSubtitle]}>
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
                <Text style={[styles.link, !isRegister && styles.loginLink]}>{isRegister ? 'Inicia sesión' : 'Regístrate'}</Text>
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
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  loginScrollContent: { backgroundColor: '#0f172a', paddingHorizontal: 20, paddingVertical: 22 },
  loginScrollContentWide: { justifyContent: 'center', minHeight: '100%' },
  loginShell: { width: '100%', maxWidth: 1400, alignSelf: 'center' },
  loginShellWide: { paddingHorizontal: 16 },
  brandBlock: { marginBottom: 30, gap: 4 },
  loginBrandBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  loginBrand: { color: '#f8fafc', fontSize: 24, letterSpacing: 1.5 },
  loginLocation: { color: '#9babbc', fontSize: 9, letterSpacing: 1.4 },
  loginMain: { gap: 20 },
  loginMainWide: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  showcase: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 18, borderWidth: 1, borderColor: '#334155', borderRadius: 12, backgroundColor: '#121f30' },
  showcaseCompact: { padding: 12 },
  terminal: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#64748b', borderRadius: 12, padding: 7, backgroundColor: '#364354' },
  terminalTop: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 7, borderBottomWidth: 1, borderBottomColor: '#253244' },
  terminalStripe: { position: 'absolute', top: -7, left: -7, right: -7, height: 3, backgroundColor: '#a3e635', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  terminalBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  terminalMark: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#a3e635' },
  terminalMarkLetter: { color: '#0f172a', fontSize: 14, fontWeight: '900' },
  terminalBrandName: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  terminalId: { color: '#a8b5c5', fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  terminalDisplay: { padding: 13, backgroundColor: '#0d1b2a' },
  screenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  screenBrand: { color: '#f8fafc', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  screenMenu: { width: 26, height: 25, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: '#405267', borderRadius: 4 },
  screenKicker: { color: '#a3e635', fontSize: 7, fontWeight: '900', letterSpacing: 1.3 },
  screenTitle: { color: '#fff', fontSize: 20, lineHeight: 24, fontWeight: '900', marginTop: 6 },
  screenSubtitle: { color: '#a3e635', fontSize: 16, lineHeight: 20, fontWeight: '800' },
  screenDescription: { color: '#a9b7c6', fontSize: 9, lineHeight: 14, maxWidth: 350, marginTop: 5 },
  quickActions: { flexDirection: 'row', gap: 6, marginTop: 12 },
  quickAction: { flex: 1, minHeight: 51, padding: 7, alignItems: 'flex-start', justifyContent: 'space-between', borderRadius: 4, backgroundColor: '#a3e635' },
  quickActionText: { color: '#0f172a', fontSize: 8, fontWeight: '900' },
  accessPanel: { marginTop: 10, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 4, backgroundColor: '#172b3e' },
  accessPanelTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  accessPanelTitle: { color: '#f8fafc', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  liveStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#a3e635' },
  liveText: { color: '#a3e635', fontSize: 6, fontWeight: '900' },
  accessRow: { minHeight: 33, flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: '#2d4053' },
  accessAvatar: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#31465a' },
  accessInitials: { color: '#e2e8f0', fontSize: 6, fontWeight: '900' },
  accessPerson: { flex: 1 },
  accessName: { color: '#fff', fontSize: 8, fontWeight: '800' },
  accessDetail: { color: '#95a6b8', fontSize: 6, marginTop: 2 },
  accessTime: { color: '#e2e8f0', fontSize: 8, fontWeight: '800' },
  readerShelf: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#738194', backgroundColor: '#465466' },
  readerUnit: { minWidth: 75, height: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#68788c', borderRadius: 4, backgroundColor: '#142235' },
  readerGlow: { position: 'absolute', top: -3, left: 9, right: 9, height: 2, backgroundColor: '#a3e635' },
  readerText: { color: '#a3e635', fontSize: 7, fontWeight: '900' },
  readerSecondary: { color: '#dce5ed', fontSize: 6, fontWeight: '900' },
  phone: { width: 150, height: 310, padding: 5, borderWidth: 1.5, borderColor: '#8794a3', borderRadius: 24, backgroundColor: '#384455', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  phoneScreen: { flex: 1, position: 'relative', overflow: 'hidden', paddingHorizontal: 9, paddingTop: 6, borderRadius: 19, backgroundColor: '#0d1b2a' },
  phoneNotch: { position: 'absolute', top: 0, left: '50%', marginLeft: -22, width: 44, height: 11, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: '#050b12', zIndex: 2 },
  phoneStatus: { height: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  phoneTime: { color: '#fff', fontSize: 6, fontWeight: '900' },
  phoneSignal: { color: '#fff', fontSize: 6 },
  phoneBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  phoneBrand: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  phoneProfile: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#304457' },
  phoneProfileText: { color: '#a3e635', fontSize: 5, fontWeight: '900' },
  phoneGreeting: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 12 },
  phoneMessage: { color: '#9babbc', fontSize: 6, marginTop: 3 },
  digitalKey: { marginTop: 10, padding: 8, borderRadius: 8, backgroundColor: '#182b3d', borderWidth: 1, borderColor: '#34495c' },
  digitalKeyLabel: { color: '#b8c5d1', fontSize: 5, fontWeight: '900', letterSpacing: 0.7 },
  digitalKeyIcon: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#a3e635', marginTop: 7 },
  digitalKeyName: { color: '#fff', fontSize: 9, fontWeight: '900', marginTop: 5 },
  digitalKeyAddress: { color: '#9babbc', fontSize: 5, marginTop: 2 },
  openButton: { height: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 4, backgroundColor: '#a3e635', marginTop: 7 },
  openButtonText: { color: '#0f172a', fontSize: 6, fontWeight: '900' },
  phoneRecentTitle: { color: '#b9c5d2', fontSize: 5, fontWeight: '900', letterSpacing: 0.8, marginTop: 10 },
  phoneRecent: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  phoneRecentDot: { width: 19, height: 19, borderRadius: 5, backgroundColor: '#263b4e' },
  phoneRecentName: { color: '#fff', fontSize: 5, fontWeight: '800' },
  phoneRecentTime: { color: '#9babbc', fontSize: 5, marginTop: 2 },
  phoneNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#293a4c', backgroundColor: '#0b1723' },
  phoneNavActive: { color: '#a3e635', fontSize: 5, fontWeight: '900' },
  phoneNavText: { color: '#9babbc', fontSize: 5 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 42, height: 42, borderRadius: 12, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: KlippColors.teal },
  logoLetter: { color: KlippColors.white, fontSize: 23, fontWeight: '900' },
  brand: { color: KlippColors.navy, fontSize: 30, fontWeight: '900' },
  location: { color: KlippColors.muted, fontSize: 10, fontWeight: '700', marginTop: 5, letterSpacing: 0.5 },
  form: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 10, padding: 18, borderRadius: 10, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  loginForm: { maxWidth: 400, borderColor: '#35495d', backgroundColor: '#142638' },
  loginFormWide: { width: 360, alignSelf: 'auto', padding: 22 },
  eyebrow: { color: KlippColors.blue, fontSize: 11, fontWeight: '800', marginBottom: 2 },
  loginEyebrow: { color: '#a3e635' },
  title: { color: KlippColors.navy, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  loginTitle: { color: '#f8fafc' },
  subtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  loginSubtitle: { color: '#9babbc' },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700', marginTop: 5 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 7, paddingHorizontal: 14, color: KlippColors.navy, backgroundColor: KlippColors.white, fontSize: 15 },
  loginInput: { borderColor: '#41556a', color: '#f8fafc', backgroundColor: '#0f1d2c' },
  roleOptions: { flexDirection: 'row', gap: 10 },
  roleOption: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 7, backgroundColor: '#fff', paddingHorizontal: 8 },
  roleOptionSelected: { borderColor: KlippColors.blue, backgroundColor: '#EEF4FF' },
  roleText: { color: KlippColors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  roleTextSelected: { color: KlippColors.blueDark },
  error: { color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  notice: { color: '#067647', fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 52, marginTop: 8, borderRadius: 7, backgroundColor: KlippColors.blue, alignItems: 'center', justifyContent: 'center' },
  loginSubmit: { backgroundColor: '#a3e635' },
  submitDisabled: { backgroundColor: '#93B0FF' },
  submitPressed: { opacity: 0.85 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginSubmitText: { color: '#0f172a', fontWeight: '900' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' },
  switchText: { color: '#52615b', fontSize: 14 },
  loginSwitchText: { color: '#9babbc' },
  link: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  loginLink: { color: '#a3e635' },
});