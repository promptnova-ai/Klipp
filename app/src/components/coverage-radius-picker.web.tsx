/// <reference types="google.maps" />

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KlippColors } from '@/theme/tokens';
import { loadGoogleMapsLibrary } from '@/lib/google-maps';

export type CoverageCoordinate = { latitude: number; longitude: number };

const hasApiKey = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

function getZoomForRadius(radiusMeters: number) {
  return Math.max(9, Math.min(16, Math.round(15 - Math.log2(radiusMeters / 1000))));
}

export function CoverageRadiusPicker({
  center,
  radiusMeters,
  onChange,
}: {
  center: CoverageCoordinate;
  radiusMeters: number;
  onChange: (center: CoverageCoordinate) => void;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.Marker | null>(null);
  const circle = useRef<google.maps.Circle | null>(null);
  const centerRef = useRef(center);
  const radiusRef = useRef(radiusMeters);
  const onChangeRef = useRef(onChange);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [latitude, setLatitude] = useState(String(center.latitude));
  const [longitude, setLongitude] = useState(String(center.longitude));
  const [coordinateError, setCoordinateError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    centerRef.current = center;
    radiusRef.current = radiusMeters;
    onChangeRef.current = onChange;
    setLatitude(String(center.latitude));
    setLongitude(String(center.longitude));
  }, [center, radiusMeters, onChange]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!mapElement.current || !hasApiKey) return;
    let active = true;
    let mapClickListener: google.maps.MapsEventListener | null = null;
    let markerDragListener: google.maps.MapsEventListener | null = null;

    void loadGoogleMapsLibrary()
      .then(({ Map }) => {
        if (!active || !mapElement.current) return;
        const initialCenter = {
          lat: centerRef.current.latitude,
          lng: centerRef.current.longitude,
        };
        const googleMap = new Map(mapElement.current, {
          center: initialCenter,
          zoom: getZoomForRadius(radiusRef.current),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        const centerMarker = new google.maps.Marker({
          map: googleMap,
          position: initialCenter,
          draggable: true,
          title: 'Centro de cobertura',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: KlippColors.cobalt,
            fillOpacity: 1,
            strokeColor: KlippColors.white,
            strokeWeight: 3,
            scale: 8,
          },
        });
        const coverageCircle = new google.maps.Circle({
          map: googleMap,
          center: initialCenter,
          radius: radiusRef.current,
          fillColor: KlippColors.cobalt,
          fillOpacity: 0.14,
          strokeColor: KlippColors.cobalt,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          clickable: false,
        });

        map.current = googleMap;
        marker.current = centerMarker;
        circle.current = coverageCircle;
        mapClickListener = googleMap.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) return;
          const nextCenter = { latitude: event.latLng.lat(), longitude: event.latLng.lng() };
          centerMarker.setPosition(event.latLng);
          coverageCircle.setCenter(event.latLng);
          setLatitude(nextCenter.latitude.toFixed(5));
          setLongitude(nextCenter.longitude.toFixed(5));
          setCoordinateError(null);
          onChangeRef.current(nextCenter);
        });
        markerDragListener = centerMarker.addListener('dragend', () => {
          const position = centerMarker.getPosition();
          if (!position) return;
          const nextCenter = { latitude: position.lat(), longitude: position.lng() };
          coverageCircle.setCenter(position);
          setLatitude(nextCenter.latitude.toFixed(5));
          setLongitude(nextCenter.longitude.toFixed(5));
          setCoordinateError(null);
          onChangeRef.current(nextCenter);
        });
        setMapReady(true);
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadError(cause instanceof Error
            ? `No se pudo cargar Google Maps: ${cause.message}`
            : 'No se pudo cargar Google Maps. Verifica la clave y la API habilitada.');
        }
      });

    return () => {
      active = false;
      mapClickListener?.remove();
      markerDragListener?.remove();
      marker.current?.setMap(null);
      circle.current?.setMap(null);
      map.current = null;
      marker.current = null;
      circle.current = null;
    };
  }, []);

  function applyCoordinates() {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (Number.isFinite(parsedLatitude) && parsedLatitude >= -90 && parsedLatitude <= 90
      && Number.isFinite(parsedLongitude) && parsedLongitude >= -180 && parsedLongitude <= 180) {
      setCoordinateError(null);
      onChange({ latitude: parsedLatitude, longitude: parsedLongitude });
      return;
    }
    setCoordinateError('Introduce una latitud entre -90 y 90 y una longitud entre -180 y 180.');
  }

  useEffect(() => {
    if (!mapReady) return;
    const position = { lat: center.latitude, lng: center.longitude };
    map.current?.panTo(position);
    map.current?.setZoom(getZoomForRadius(radiusMeters));
    marker.current?.setPosition(position);
    circle.current?.setCenter(position);
    circle.current?.setRadius(radiusMeters);
  }, [center, radiusMeters, mapReady]);

  return (
    <View style={styles.container}>
      {hasApiKey ? (
        <View style={styles.mapFrame}>
          <div ref={mapElement} style={{ width: '100%', height: '100%' }} />
          {!mapReady && !loadError && (
            <View pointerEvents="none" style={styles.overlay}>
              <Text style={styles.overlayText}>Cargando Google Maps…</Text>
            </View>
          )}
          {loadError && (
            <View accessibilityRole="alert" style={styles.errorOverlay}>
              <Text style={styles.errorTitle}>Google Maps no está disponible</Text>
              <Text style={styles.overlayText}>{loadError}</Text>
              <Text style={styles.overlayText}>Revisa que Maps JavaScript API esté habilitada y que la clave permita este dominio.</Text>
            </View>
          )}
          {mapReady && <Text pointerEvents="none" style={styles.mapHint}>Arrastra el pin o toca el mapa para elegir el centro</Text>}
        </View>
      ) : (
        <View style={styles.missingKey}>
          <Text style={styles.errorTitle}>Mapa no disponible en esta vista</Text>
          <Text style={styles.overlayText}>Puedes introducir el centro de tu zona de trabajo manualmente.</Text>
        </View>
      )}
      <Text style={styles.coordinates}>{center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}</Text>
      <Text style={styles.hint}>El círculo muestra un radio de {Math.round(radiusMeters / 1000)} km. Mueve el pin para ajustar tu cobertura.</Text>
      {(!hasApiKey || loadError) && (
        <>
          <View style={styles.coordinateFields}>
            <View style={styles.coordinateField}>
              <Text style={styles.fieldLabel}>Latitud</Text>
              <TextInput accessibilityLabel="Latitud del centro de cobertura" keyboardType="numbers-and-punctuation" onChangeText={setLatitude} style={styles.coordinateInput} value={latitude} />
            </View>
            <View style={styles.coordinateField}>
              <Text style={styles.fieldLabel}>Longitud</Text>
              <TextInput accessibilityLabel="Longitud del centro de cobertura" keyboardType="numbers-and-punctuation" onChangeText={setLongitude} style={styles.coordinateInput} value={longitude} />
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={applyCoordinates} style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}>
            <Text style={styles.applyText}>Aplicar centro de cobertura</Text>
          </Pressable>
          {coordinateError && <Text accessibilityRole="alert" style={styles.coordinateError}>{coordinateError}</Text>}
        </>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  mapFrame: { height: 245, overflow: 'hidden', borderRadius: 16, backgroundColor: KlippColors.surfaceBlue },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFFD9' },
  errorOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8, backgroundColor: '#FFFFFFF2' },
  missingKey: { minHeight: 150, alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16, backgroundColor: KlippColors.surfaceWarning, gap: 8 },
  errorTitle: { color: KlippColors.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  overlayText: { color: KlippColors.slate, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  mapHint: { position: 'absolute', right: 8, bottom: 8, left: 8, alignSelf: 'center', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: '#FFFFFFE8', color: KlippColors.slate, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  coordinates: { color: KlippColors.slate, fontSize: 12, textAlign: 'center' },
  coordinateFields: { flexDirection: 'row', gap: 8 },
  coordinateField: { flex: 1, minWidth: 0, gap: 4 },
  fieldLabel: { color: KlippColors.muted, fontSize: 10, fontWeight: '800' }
  coordinateInput: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, backgroundColor: KlippColors.white, color: KlippColors.slate, fontSize: 12 },
  applyButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: KlippColors.cobalt },
  applyText: { color: KlippColors.white, fontSize: 12, fontWeight: '800' },
  coordinateError: { color: KlippColors.danger, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.88 },
  hint: { color: KlippColors.muted, fontSize: 11, textAlign: 'center' },
});
