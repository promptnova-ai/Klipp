import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ComponentProps } from 'react';

const colors = {
  ink: '#0f172a',
  midnight: '#0d1b2a',
  panel: '#14283a',
  lime: '#a3e635',
  limeDark: '#84cc16',
  white: '#f8fafc',
  muted: '#9babbc',
  metal: '#cbd5e1',
};

const actionItems = [
  { label: 'Mis Llaves', icon: { ios: 'key.fill', android: 'key', web: 'vpn_key' } },
  {
    label: 'Enviar Invitación',
    icon: { ios: 'paperplane.fill', android: 'send', web: 'send' },
  },
  {
    label: 'Configuración',
    icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  },
] as const;

const recentAccesses = [
  { name: 'Maria Garcia', detail: 'Entrada principal', time: '09:15', initials: 'MG' },
  { name: 'Carlos Mendez', detail: 'Acceso de residente', time: '08:42', initials: 'CM' },
  { name: 'Lucia Santos', detail: 'Invitación temporal', time: 'Ayer', initials: 'LS' },
];

function Icon({
  name,
  size = 20,
  color = colors.lime,
}: {
  name: ComponentProps<typeof SymbolView>['name'];
  size?: number;
  color?: string;
}) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandLockup}>
      <View style={[styles.brandMark, compact && styles.brandMarkSmall]}>
        <Text style={[styles.brandK, compact && styles.brandKSmall]}>K</Text>
      </View>
      <Text style={[styles.brandName, compact && styles.brandNameSmall]}>KLIPP</Text>
    </View>
  );
}

function KioskScreen() {
  return (
    <View style={styles.kioskShell}>
      <View style={styles.kioskTop}>
        <View style={styles.kioskTopStripe} />
        <BrandMark />
        <Text style={styles.kioskModel}>ACCESS TERMINAL 01</Text>
      </View>

      <View style={styles.kioskBody}>
        <View style={styles.kioskSideRail} />
        <View style={styles.displayBezel}>
          <View style={styles.display}>
            <View style={styles.displayHeader}>
              <BrandMark compact />
              <Pressable accessibilityRole="button" accessibilityLabel="Abrir menú" style={styles.menuButton}>
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
                <View style={styles.menuLineShort} />
              </Pressable>
            </View>

            <View style={styles.welcomeBlock}>
              <View style={styles.onlineLabel}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>ACCESO INTELIGENTE</Text>
              </View>
              <Text style={styles.welcomeTitle}>¡Bienvenido A KLIPP!</Text>
              <Text style={styles.welcomeSubhead}>El Futuro del Acceso</Text>
              <Text style={styles.welcomeBody}>
                Gestione sus llaves, invitaciones y accesos de forma inteligente.
              </Text>
            </View>

            <View style={styles.actionGrid}>
              {actionItems.map((action) => (
                <Pressable key={action.label} accessibilityRole="button" style={styles.actionButton}>
                  <View style={styles.actionIconWrap}>
                    <Icon name={action.icon} size={23} color={colors.ink} />
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                  <Icon
                    name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }}
                    size={13}
                    color={colors.ink}
                  />
                </Pressable>
              ))}
            </View>

            <View style={styles.accessPanel}>
              <View style={styles.accessList}>
                <View style={styles.accessHeading}>
                  <Text style={styles.accessTitle}>ÚLTIMOS ACCESOS</Text>
                  <View style={styles.liveTag}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>EN VIVO</Text>
                  </View>
                </View>
                {recentAccesses.map((access) => (
                  <View key={access.name} style={styles.accessRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{access.initials}</Text>
                    </View>
                    <View style={styles.accessNameGroup}>
                      <Text style={styles.accessName}>{access.name}</Text>
                      <Text style={styles.accessDetail}>{access.detail}</Text>
                    </View>
                    <Text style={styles.accessTime}>{access.time}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.accessVisual}>
                <View style={styles.accessVisualTop}>
                  <Text style={styles.visualCaption}>LLAVE DIGITAL</Text>
                  <View style={styles.signalBars}>
                    <View style={styles.signalBarShort} />
                    <View style={styles.signalBarMedium} />
                    <View style={styles.signalBarTall} />
                  </View>
                </View>
                <View style={styles.miniPhone}>
                  <View style={styles.miniPhoneSpeaker} />
                  <View style={styles.miniPhoneScreen}>
                    <View style={styles.miniKeyHalo}>
                      <Icon name={{ ios: 'key.fill', android: 'key', web: 'vpn_key' }} size={28} />
                    </View>
                    <View style={styles.miniPhoneLine} />
                    <Text style={styles.miniPhoneLabel}>LISTA PARA USAR</Text>
                  </View>
                </View>
                <Text style={styles.visualFootnote}>ACCESO SEGURO · 256 BIT</Text>
              </View>
            </View>

            <View style={styles.displayFooter}>
              <View style={styles.footerStatus}>
                <View style={styles.onlineDot} />
                <Text style={styles.footerText}>Sistema conectado</Text>
              </View>
              <Text style={styles.footerText}>KLIPP OS 2.4</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.kioskShelf}>
        <View style={styles.shelfTopLine} />
        <View style={styles.readerUnit}>
          <View style={styles.readerLight} />
          <Icon name={{ ios: 'wave.3.right', android: 'contactless', web: 'contactless' }} size={24} />
          <Text style={styles.readerLabel}>NFC</Text>
        </View>
        <View style={styles.fingerprintUnit}>
          <Icon
            name={{ ios: 'touchid', android: 'fingerprint', web: 'fingerprint' }}
            size={24}
            color={colors.metal}
          />
          <Text style={styles.fingerprintLabel}>HUELLA</Text>
        </View>
        <View style={styles.shelfEdge} />
      </View>
      <View style={styles.kioskFoot}>
        <View style={styles.footVent} />
        <View style={styles.footVent} />
        <View style={styles.footVent} />
      </View>
    </View>
  );
}

function MobileMockup() {
  return (
    <View style={styles.mobileComposition}>
      <View style={styles.mobileEyebrow}>
        <View style={styles.mobileEyebrowLine} />
        <Text style={styles.mobileEyebrowText}>TU ACCESO, SIEMPRE CONTIGO</Text>
      </View>
      <View style={styles.handShape} />
      <View style={styles.phoneFrame}>
        <View style={styles.phoneButtonLeft} />
        <View style={styles.phoneButtonRight} />
        <View style={styles.phoneScreen}>
          <View style={styles.phoneNotch} />
          <View style={styles.phoneStatusBar}>
            <Text style={styles.phoneTime}>9:41</Text>
            <View style={styles.phoneStatusIcons}>
              <Icon name={{ ios: 'cellularbars', android: 'signal_cellular_alt', web: 'signal_cellular_alt' }} size={12} color={colors.white} />
              <Icon name={{ ios: 'wifi', android: 'wifi', web: 'wifi' }} size={13} color={colors.white} />
              <Icon name={{ ios: 'battery.100', android: 'battery_full', web: 'battery_full' }} size={14} color={colors.white} />
            </View>
          </View>
          <View style={styles.phoneHeader}>
            <BrandMark compact />
            <View style={styles.phoneAvatar}>
              <Text style={styles.phoneAvatarText}>MG</Text>
            </View>
          </View>
          <Text style={styles.phoneGreeting}>Hola, Maria</Text>
          <Text style={styles.phonePrompt}>Tu hogar está a un toque.</Text>

          <View style={styles.mobileKeyCard}>
            <View style={styles.mobileKeyCardTop}>
              <Text style={styles.mobileKeyKicker}>LLAVE PRINCIPAL</Text>
              <View style={styles.mobileKeyActive}>
                <View style={styles.mobileKeyDot} />
                <Text style={styles.mobileKeyActiveText}>ACTIVA</Text>
              </View>
            </View>
            <View style={styles.mobileKeyGlyph}>
              <Icon name={{ ios: 'key.fill', android: 'key', web: 'vpn_key' }} size={31} color={colors.ink} />
            </View>
            <Text style={styles.mobileKeyTitle}>Mi hogar</Text>
            <Text style={styles.mobileKeyAddress}>Pi en seguridad · Entrada principal</Text>
            <Pressable accessibilityRole="button" style={styles.openDoorButton}>
              <Icon name={{ ios: 'lock.open.fill', android: 'lock_open', web: 'lock_open' }} size={16} color={colors.ink} />
              <Text style={styles.openDoorText}>Abrir puerta</Text>
            </Pressable>
          </View>

          <View style={styles.phoneSectionHeader}>
            <Text style={styles.phoneSectionTitle}>Acceso reciente</Text>
            <Text style={styles.phoneSeeAll}>Ver todos</Text>
          </View>
          <View style={styles.phoneRecentRow}>
            <View style={styles.phoneRecentIcon}>
              <Icon name={{ ios: 'door.left.hand.open', android: 'meeting_room', web: 'meeting_room' }} size={17} color={colors.lime} />
            </View>
            <View style={styles.phoneRecentCopy}>
              <Text style={styles.phoneRecentTitle}>Entrada principal</Text>
              <Text style={styles.phoneRecentSub}>Hoy, 09:15 · Con llave digital</Text>
            </View>
            <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={17} color={colors.lime} />
          </View>

          <View style={styles.phoneBottomNav}>
            <View style={styles.navItem}>
              <Icon name={{ ios: 'key.fill', android: 'key', web: 'vpn_key' }} size={18} />
              <Text style={styles.navActiveText}>Llaves</Text>
            </View>
            <View style={styles.navItem}>
              <Icon name={{ ios: 'person.2.fill', android: 'group', web: 'group' }} size={18} color={colors.muted} />
              <Text style={styles.navText}>Invitados</Text>
            </View>
            <View style={styles.navItem}>
              <Icon name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }} size={18} color={colors.muted} />
              <Text style={styles.navText}>Perfil</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.mobileCaption}>
        <Text style={styles.mobileCaptionTitle}>KLIPP EN TU BOLSILLO</Text>
        <Text style={styles.mobileCaptionBody}>Una llave segura. Cero complicaciones.</Text>
      </View>
    </View>
  );
}

export default function TabTwoScreen() {
  const { width } = useWindowDimensions();
  const stacked = width < 960;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.topBar}>
        <View style={styles.topBarBrand}>
          <BrandMark compact />
          <View style={styles.topBarDivider} />
          <Text style={styles.topBarContext}>CONTROL DE ACCESO</Text>
        </View>
        <View style={styles.topBarStatus}>
          <View style={styles.statusPulse} />
          <Text style={styles.topBarStatusText}>SISTEMA OPERATIVO</Text>
        </View>
      </View>
      <View style={[styles.stage, stacked && styles.stageStacked]}>
        <View style={[styles.kioskWrap, stacked && styles.kioskWrapStacked]}>
          <KioskScreen />
          <View style={styles.floorShadow} />
        </View>
        <MobileMockup />
      </View>
      <View style={styles.pageFooter}>
        <Text style={styles.pageFooterText}>KLIPP SMART ACCESS</Text>
        <View style={styles.footerCenter}>
          <View style={styles.footerCenterDot} />
          <Text style={styles.pageFooterText}>DISEÑADO PARA TU DÍA A DÍA</Text>
        </View>
        <Text style={styles.pageFooterText}>SANTO DOMINGO · 2025</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ink },
  pageContent: { minHeight: '100%', paddingHorizontal: 28, paddingTop: 16, paddingBottom: 22 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
  },
  topBarBrand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topBarDivider: { width: 1, height: 18, backgroundColor: '#334155' },
  topBarContext: { color: '#bdc8d3', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  topBarStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 2,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  statusPulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.lime },
  topBarStatusText: { color: colors.lime, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  stage: {
    flex: 1,
    width: '100%',
    maxWidth: 1400,
    minHeight: 680,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 62,
    paddingVertical: 30,
  },
  stageStacked: { flexDirection: 'column', gap: 42, paddingTop: 28 },
  kioskWrap: { width: '61%', maxWidth: 720, minWidth: 560, alignItems: 'center' },
  kioskWrapStacked: { width: '100%', maxWidth: 720, minWidth: 0 },
  kioskShell: {
    width: '100%',
    borderRadius: 22,
    padding: 12,
    paddingTop: 0,
    backgroundColor: '#344153',
    borderWidth: 1,
    borderColor: '#667385',
    shadowColor: '#000000',
    shadowOpacity: 0.42,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 22 },
    elevation: 18,
  },
  kioskTop: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  kioskTopStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: colors.lime },
  kioskModel: { color: '#aab6c5', fontSize: 8, fontWeight: '800', letterSpacing: 1.8 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkSmall: { width: 25, height: 25, borderRadius: 6 },
  brandK: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  brandKSmall: { fontSize: 15 },
  brandName: { color: colors.white, fontSize: 16, fontWeight: '900', letterSpacing: 1.6 },
  brandNameSmall: { fontSize: 13, letterSpacing: 1.3 },
  kioskBody: { flexDirection: 'row', paddingTop: 10 },
  kioskSideRail: { width: 5, marginRight: 9, backgroundColor: colors.lime, borderRadius: 4 },
  displayBezel: { flex: 1, padding: 7, borderRadius: 11, backgroundColor: '#080f19' },
  display: { backgroundColor: colors.midnight, borderRadius: 6, padding: 18, overflow: 'hidden' },
  displayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  menuButton: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#34475b',
    borderRadius: 5,
  },
  menuLine: { width: 14, height: 1.5, backgroundColor: colors.white, borderRadius: 2 },
  menuLineShort: { width: 9, height: 1.5, alignSelf: 'flex-start', marginLeft: 10, backgroundColor: colors.white, borderRadius: 2 },
  welcomeBlock: { paddingTop: 24, paddingBottom: 18 },
  onlineLabel: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  onlineDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: colors.lime },
  onlineText: { color: colors.lime, fontSize: 9, fontWeight: '800', letterSpacing: 1.7 },
  welcomeTitle: { color: colors.white, fontSize: 26, lineHeight: 31, fontWeight: '800' },
  welcomeSubhead: { color: colors.lime, fontSize: 20, lineHeight: 26, fontWeight: '800' },
  welcomeBody: { color: '#a8b5c5', fontSize: 12, lineHeight: 18, maxWidth: 425, marginTop: 7 },
  actionGrid: { flexDirection: 'row', gap: 9, marginBottom: 18 },
  actionButton: {
    flex: 1,
    minHeight: 74,
    padding: 10,
    backgroundColor: colors.lime,
    borderRadius: 5,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  actionIconWrap: {
    width: 31,
    height: 31,
    borderRadius: 4,
    backgroundColor: '#b8f261',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: colors.ink, fontSize: 10, fontWeight: '800', lineHeight: 13 },
  accessPanel: { flexDirection: 'row', gap: 14, padding: 13, backgroundColor: colors.panel, borderRadius: 5 },
  accessList: { flex: 1.45 },
  accessHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  accessTitle: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.lime },
  liveText: { color: colors.lime, fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  accessRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#26394b' },
  avatar: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#304457', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#dce6ee', fontSize: 8, fontWeight: '800' },
  accessNameGroup: { flex: 1, minWidth: 0 },
  accessName: { color: colors.white, fontSize: 9, fontWeight: '700' },
  accessDetail: { color: colors.muted, fontSize: 8, marginTop: 2 },
  accessTime: { color: '#d7e1eb', fontSize: 9, fontWeight: '700' },
  accessVisual: { flex: 0.8, minWidth: 122, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  accessVisualTop: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  visualCaption: { color: colors.muted, fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  signalBars: { height: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  signalBarShort: { width: 3, height: 5, backgroundColor: colors.lime, borderRadius: 1 },
  signalBarMedium: { width: 3, height: 8, backgroundColor: colors.lime, borderRadius: 1 },
  signalBarTall: { width: 3, height: 11, backgroundColor: colors.lime, borderRadius: 1 },
  miniPhone: { width: 72, height: 96, padding: 4, borderRadius: 11, borderWidth: 1.5, borderColor: '#718197', backgroundColor: '#0c1826', alignItems: 'center' },
  miniPhoneSpeaker: { width: 19, height: 2, borderRadius: 2, backgroundColor: '#718197', marginBottom: 4 },
  miniPhoneScreen: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#12273a' },
  miniKeyHalo: { width: 46, height: 46, borderRadius: 24, backgroundColor: '#263b4e', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4c6731' },
  miniPhoneLine: { width: 26, height: 2, borderRadius: 2, backgroundColor: '#526477', marginTop: 8 },
  miniPhoneLabel: { color: colors.lime, fontSize: 5, fontWeight: '900', letterSpacing: 0.8, marginTop: 5 },
  visualFootnote: { color: '#6f8092', fontSize: 6, fontWeight: '800', letterSpacing: 0.7 },
  displayFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 13 },
  footerStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerText: { color: '#8292a3', fontSize: 7, fontWeight: '700', letterSpacing: 0.7 },
  kioskShelf: {
    minHeight: 63,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    borderTopWidth: 1,
    borderTopColor: '#788596',
    borderBottomWidth: 5,
    borderBottomColor: '#243041',
    borderRadius: 0,
    backgroundColor: '#455365',
    position: 'relative',
  },
  shelfTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#9aacba' },
  readerUnit: { width: 104, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 5, backgroundColor: '#172333', borderWidth: 1, borderColor: '#65758a' },
  readerLight: { position: 'absolute', top: -4, left: 12, right: 12, height: 2, borderRadius: 2, backgroundColor: colors.lime, shadowColor: colors.lime, shadowOpacity: 0.9, shadowRadius: 6 },
  readerLabel: { color: colors.lime, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  fingerprintUnit: { width: 82, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 5, backgroundColor: '#253244', borderWidth: 1, borderColor: '#637288' },
  fingerprintLabel: { color: '#dce5ed', fontSize: 7, fontWeight: '800', letterSpacing: 0.6 },
  shelfEdge: { position: 'absolute', bottom: -5, left: 8, right: 8, height: 4, borderRadius: 2, backgroundColor: '#172334' },
  kioskFoot: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  footVent: { width: 26, height: 2, backgroundColor: '#788698', borderRadius: 2 },
  floorShadow: { position: 'absolute', bottom: -14, width: '82%', height: 13, borderRadius: 100, backgroundColor: '#050a12', opacity: 0.65 },
  mobileComposition: { width: 286, minHeight: 625, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  mobileEyebrow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 17 },
  mobileEyebrowLine: { width: 20, height: 2, backgroundColor: colors.lime },
  mobileEyebrowText: { color: '#b9c5d2', fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  handShape: {
    position: 'absolute',
    right: -14,
    top: 178,
    width: 97,
    height: 310,
    borderTopLeftRadius: 50,
    borderBottomLeftRadius: 46,
    borderTopRightRadius: 35,
    borderBottomRightRadius: 54,
    backgroundColor: '#806959',
    opacity: 0.5,
    transform: [{ rotate: '-8deg' }],
  },
  phoneFrame: { width: 258, height: 548, padding: 7, borderRadius: 34, backgroundColor: '#303b49', borderWidth: 2, borderColor: '#8a97a6', shadowColor: '#000', shadowOpacity: 0.48, shadowRadius: 20, shadowOffset: { width: 0, height: 15 }, elevation: 16 },
  phoneButtonLeft: { position: 'absolute', left: -4, top: 110, width: 4, height: 42, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, backgroundColor: '#8995a2' },
  phoneButtonRight: { position: 'absolute', right: -4, top: 132, width: 4, height: 66, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: '#8995a2' },
  phoneScreen: { flex: 1, overflow: 'hidden', position: 'relative', borderRadius: 27, backgroundColor: colors.midnight, paddingHorizontal: 15, paddingTop: 9 },
  phoneNotch: { position: 'absolute', top: 6, left: '50%', marginLeft: -34, width: 68, height: 17, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: '#050b12', zIndex: 2 },
  phoneStatusBar: { height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5 },
  phoneTime: { color: colors.white, fontSize: 9, fontWeight: '800' },
  phoneStatusIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phoneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  phoneAvatar: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#26394b', borderWidth: 1, borderColor: '#44576a', alignItems: 'center', justifyContent: 'center' },
  phoneAvatarText: { color: colors.lime, fontSize: 8, fontWeight: '900' },
  phoneGreeting: { color: colors.white, fontSize: 21, fontWeight: '800', marginTop: 20 },
  phonePrompt: { color: colors.muted, fontSize: 10, marginTop: 4 },
  mobileKeyCard: { marginTop: 17, padding: 13, borderRadius: 12, backgroundColor: '#182b3d', borderWidth: 1, borderColor: '#2c4054' },
  mobileKeyCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mobileKeyKicker: { color: '#b1bfcc', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  mobileKeyActive: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#293d2a', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 4 },
  mobileKeyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.lime },
  mobileKeyActiveText: { color: colors.lime, fontSize: 6, fontWeight: '900', letterSpacing: 0.6 },
  mobileKeyGlyph: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 28, backgroundColor: colors.lime, marginTop: 15 },
  mobileKeyTitle: { color: colors.white, fontSize: 16, fontWeight: '800', marginTop: 10 },
  mobileKeyAddress: { color: colors.muted, fontSize: 8, marginTop: 4 },
  openDoorButton: { height: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 6, backgroundColor: colors.lime, marginTop: 13 },
  openDoorText: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  phoneSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19, marginBottom: 9 },
  phoneSectionTitle: { color: colors.white, fontSize: 11, fontWeight: '800' },
  phoneSeeAll: { color: colors.lime, fontSize: 8, fontWeight: '700' },
  phoneRecentRow: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderRadius: 7, backgroundColor: '#142638' },
  phoneRecentIcon: { width: 29, height: 29, borderRadius: 7, backgroundColor: '#263b4e', alignItems: 'center', justifyContent: 'center' },
  phoneRecentCopy: { flex: 1 },
  phoneRecentTitle: { color: colors.white, fontSize: 8, fontWeight: '800' },
  phoneRecentSub: { color: colors.muted, fontSize: 7, marginTop: 3 },
  phoneBottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#293a4c', backgroundColor: '#0b1723' },
  navItem: { alignItems: 'center', gap: 3 },
  navActiveText: { color: colors.lime, fontSize: 7, fontWeight: '800' },
  navText: { color: colors.muted, fontSize: 7 },
  mobileCaption: { alignItems: 'center', marginTop: 13 },
  mobileCaptionTitle: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  mobileCaptionBody: { color: colors.muted, fontSize: 9, marginTop: 4 },
  pageFooter: { width: '100%', maxWidth: 1400, alignSelf: 'center', minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#293548' },
  pageFooterText: { color: '#718096', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  footerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerCenterDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.lime },
});
