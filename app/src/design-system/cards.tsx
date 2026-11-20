import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KlippCard } from './components';
import { KlippColors } from '@/lib/brand';

export type KlippServiceCardProps = {
  title: string;
  category: string;
  description: string;
  priceLabel: string;
  durationLabel?: string;
  icon: ReactNode;
  wide?: boolean;
  onPress: () => void;
};

export function KlippServiceCard({
  title,
  category,
  description,
  priceLabel,
  durationLabel,
  icon,
  wide = false,
  onPress,
}: KlippServiceCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver detalles de ${title}`}
      accessibilityHint="Abre las modalidades y profesionales disponibles para este servicio."
      onPress={onPress}
      style={({ pressed }) => [styles.servicePressable, wide && styles.servicePressableWide, pressed && styles.pressed]}>
      <KlippCard style={styles.serviceCard}>
        <View style={styles.serviceIcon}>{icon}</View>
        <View style={styles.serviceCopy}>
          <View style={styles.serviceCardTop}>
            <Text style={styles.serviceTitle}>{title}</Text>
            <View style={styles.categoryTag}><Text style={styles.categoryTagText}>{category}</Text></View>
          </View>
          <Text numberOfLines={2} style={styles.serviceDescription}>{description}</Text>
          <View style={styles.serviceMeta}>
            <Text style={styles.servicePrice}>{priceLabel}</Text>
            {durationLabel ? <Text style={styles.metaDot}>·</Text> : null}
            {durationLabel ? <Text style={styles.serviceDuration}>{durationLabel}</Text> : null}
          </View>
          <Text style={styles.serviceLink}>Ver detalles  <Text style={styles.linkArrow}>›</Text></Text>
        </View>
      </KlippCard>
    </Pressable>
  );
}

export type KlippProfessionalCardProps = {
  name?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  jobsCompleted?: number | null;
  distanceMeters?: number | null;
  priceLabel?: string | null;
  durationMinutes?: number | null;
  transportLabel?: string | null;
  selected?: boolean;
  compact?: boolean;
  onPress?: () => void;
};

export function KlippProfessionalCard({
  name,
  avatarUrl,
  bio,
  rating,
  ratingCount,
  jobsCompleted,
  distanceMeters,
  priceLabel,
  durationMinutes,
  transportLabel,
  selected = false,
  compact = false,
  onPress,
}: KlippProfessionalCardProps) {
  const displayName = name?.trim() || 'Profesional Klipp';
  const imageUrl = avatarUrl?.trim();
  const hasRating = typeof rating === 'number' && Number.isFinite(rating) && (ratingCount ?? 0) > 0;
  const distanceLabel = typeof distanceMeters === 'number' && Number.isFinite(distanceMeters) && distanceMeters >= 0
    ? distanceMeters < 1000 ? `${Math.round(distanceMeters)} m` : `${(distanceMeters / 1000).toFixed(1)} km`
    : null;
  const summary = [
    hasRating ? `Valoración ${rating!.toFixed(1)} de 5, ${ratingCount} reseñas` : 'Sin valoraciones',
    typeof jobsCompleted === 'number' && jobsCompleted > 0 ? `${jobsCompleted} trabajos completados` : null,
    distanceLabel ? `${distanceLabel} de distancia` : null,
    transportLabel || null,
    priceLabel || null,
  ].filter(Boolean).join('. ');

  const content = (
    <KlippCard style={[styles.professionalCard, compact && styles.professionalCardCompact, selected && styles.professionalCardSelected]}>
      <View style={styles.professionalHeader}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} contentFit="cover" style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{displayName.charAt(0).toLocaleUpperCase()}</Text></View>
        )}
        <View style={styles.professionalCopy}>
          <View style={styles.professionalNameRow}>
            <Text numberOfLines={1} style={styles.professionalName}>{displayName}</Text>
            {selected ? <Text style={styles.selectedLabel}>Seleccionado</Text> : null}
          </View>
          {bio ? <Text numberOfLines={compact ? 1 : 2} style={styles.professionalBio}>{bio}</Text> : null}
          <View style={styles.professionalMeta}>
            <Text style={styles.professionalMetaText}>{hasRating ? `★ ${rating!.toFixed(1)} · ${ratingCount} reseñas` : 'Sin valoraciones'}</Text>
            {typeof jobsCompleted === 'number' && jobsCompleted > 0 ? <Text style={styles.professionalMetaText}>· {jobsCompleted} trabajos</Text> : null}
            {distanceLabel ? <Text style={styles.professionalMetaText}>· {distanceLabel}</Text> : null}
            {transportLabel ? <Text style={styles.professionalMetaText}>· {transportLabel}</Text> : null}
          </View>
        </View>
      </View>
      {priceLabel ? (
        <View style={styles.professionalPriceRow}>
          <Text style={styles.professionalPrice}>{priceLabel}</Text>
          {typeof durationMinutes === 'number' && durationMinutes > 0
            ? <Text style={styles.professionalDuration}>{durationMinutes} min aprox.</Text>
            : null}
        </View>
      ) : null}
    </KlippCard>
  );

  if (!onPress) return <View accessible accessibilityLabel={`${displayName}. ${summary}`}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${displayName}. ${summary}`}
      accessibilityState={{ selected }}
      accessibilityHint="Selecciona este profesional para la reserva."
      onPress={onPress}
      style={({ pressed }) => [styles.professionalPressable, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  servicePressable: { width: '100%' },
  servicePressableWide: { width: '48%' },
  serviceCard: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 18, borderRadius: 20 },
  serviceIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: KlippColors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  serviceCopy: { flex: 1, gap: 7 },
  serviceCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  serviceTitle: { flex: 1, color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  categoryTag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: KlippColors.surfaceMuted },
  categoryTagText: { color: KlippColors.muted, fontSize: 10, fontWeight: '700' },
  serviceDescription: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 1 },
  servicePrice: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '800' },
  metaDot: { color: KlippColors.muted },
  serviceDuration: { color: KlippColors.muted, fontSize: 12 },
  serviceLink: { color: KlippColors.blue, fontSize: 12, fontWeight: '700', marginTop: 1 },
  linkArrow: { fontSize: 16 },
  professionalPressable: { width: '100%' },
  professionalCard: { gap: 11, padding: 13, borderRadius: 16, borderColor: KlippColors.border },
  professionalCardCompact: { padding: 11 },
  professionalCardSelected: { borderColor: KlippColors.teal, backgroundColor: '#F0FBF9' },
  professionalHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: KlippColors.surfaceBlue },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.surfaceBlue },
  avatarInitial: { color: KlippColors.blueDark, fontSize: 17, fontWeight: '800' },
  professionalCopy: { flex: 1, gap: 3 },
  professionalNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  professionalName: { flex: 1, color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  selectedLabel: { color: KlippColors.tealDark, fontSize: 10, fontWeight: '800' },
  professionalBio: { color: KlippColors.muted, fontSize: 12, lineHeight: 17 },
  professionalMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  professionalMetaText: { color: KlippColors.muted, fontSize: 11, fontWeight: '600' },
  professionalPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 9, borderTopWidth: 1, borderTopColor: KlippColors.border },
  professionalPrice: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '800' },
  professionalDuration: { color: KlippColors.muted, fontSize: 12 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
