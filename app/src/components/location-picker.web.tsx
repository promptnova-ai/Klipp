/// <reference types="google.maps" />

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KlippColors } from '@/theme/tokens';
import { loadGoogleMapsLibrary } from '@/lib/google-maps';

export type MapCoordinate = { latitude: number; longitude: number };

const hasApiKey = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

export function LocationPicker({ coordinate, onChange }: { coordinate: MapCoordinate; onChange: (coordinate: MapCoordinate) => void }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialCoordinate = useRef(coordinate);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState(String(coordinate.latitude));
  const [longitude, setLongitude] = useState(String(coordinate.longitude));
  const [coordinateError, setCoordinateError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Keep editable fallback fields synchronized when the parent changes the selected point.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLatitude(String(coordinate.latitude));
    setLongitude(String(coordinate.longitude));
  }, [coordinate.latitude, coordinate.longitude]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hasApiKey) return;
    let active = true;
    let mapClickListener: google.maps.MapsEventListener | null = null;
    let markerDragListener: google.maps.MapsEventListener | null = null;

    void loadGoogleMapsLibrary().then(({ Map }) => {
      if (!active || !mapElement.current) return;
      const position = { lat: initialCoordinate.current.latitude, lng: initialCoordinate.current.longitude };
      const instance = new Map(mapElement.current, {
        center: position,
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: 'cooperative',
      });
      const pin = new google.maps.Marker({
        map: instance,
        position,
        draggable: true,
        title: 'Ubicación del servicio',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: KlippColors.cobalt,
          fillOpacity: 1,
          strokeColor: KlippColors.white,
          strokeWeight: 3,
          scale: 8,
        },
      });
      map.current = instance;
      marker.current = pin;

      const publishPosition = (next: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined) => {
        if (!next) return;
        const lat = typeof (next as google.maps.LatLng).lat === 'function'
          ? (next as google.maps.LatLng).lat()
          : (next as google.maps.LatLngLiteral).lat;
        const lng = typeof (next as google.maps.LatLng).lng === 'function'
          ? (next as google.maps.LatLng).lng()
          : (next as google.maps.LatLngLiteral).lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        pin.setPosition({ lat, lng });
        setLatitude(lat.toFixed(5));
        setLongitude(lng.toFixed(5));
        setCoordinateError(null);
        onChangeRef.current({ latitude: lat, longitude: lng });
      };

      mapClickListener = instance.addListener('click', (event: google.maps.MapMouseEvent) => publishPosition(event.latLng));
      markerDragListener = pin.addListener('dragend', () => publishPosition(pin.getPosition()));
      setMapReady(true);
    }).catch((cause: unknown) => {
      if (active) setLoadError(cause instanceof Error ? cause.message : 'No se pudo cargar Google Maps.');
    });

    return () => {
      active = false;
      mapClickListener?.remove();
      markerDragListener?.remove();
      marker.current?.setMap(null);
      marker.current = null;
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !marker.current) return;
    const position = { lat: coordinate.latitude, lng: coordinate.longitude };
    map.current.panTo(position);
    marker.current.setPosition(position);
  }, [coordinate.latitude, coordinate.longitude]);

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

  return (
    <View accessibilityLabel="Ubicación del servicio" style={styles.container}>
      {hasApiKey ? (
        <View style={styles.mapFrame}>
          <div ref={mapElement} style={{ width: '100%', height: '100%' }} />
          {!mapReady && !loadError && (
            <View pointerEvents="none" style={styles.overlay}>
              <Text style={styles.overlayText}>Cargando mapa…</Text>
            </View>
          )}
          {loadError && (
            <View accessibilityRole="alert" style={styles.errorOverlay}>
              <Text style={styles.errorTitle}>No pudimos cargar el mapa</Text>
              <Text style={styles.overlayText}>{loadError}</Text>
            </View>
          )}
          {mapReady && <Text pointerEvents="none" style={styles.mapHint}>Toca el mapa o arrastra el pin para marcar dónde será el servicio</Text>}
        </View>
      ) : (
        <View style={styles.missingKey}>
          <Text style={styles.errorTitle}>Mapa no configurado en esta vista</Text>
          <Text style={styles.overlayText}>Puedes introducir las coordenadas del lugar del servicio manualmente.</Text>
        </View>
      )}
      <View style={styles.coordinateSummary}>
        <Text style={styles.title}>Ubicación del servicio</Text>
        <Text style={styles.coordinates}>{coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}</Text>
      </View>
      {(!hasApiKey || loadError) && (
        <>
          <View style={styles.coordinateFields}>
            <View style={styles.coordinateField}>
              <Text style={styles.fieldLabel}>Latitud</Text>
              <TextInput accessibilityLabel="Latitud del servicio" keyboardType="numbers-and-punctuation" onChangeText={setLatitude} style={styles.coordinateInput} value={latitude} />
            </View>
            <View style={styles.coordinateField}>
              <Text style={styles.fieldLabel}>Longitud</Text>
              <TextInput accessibilityLabel="Longitud del servicio" keyboardType="numbers-and-punctuation" onChangeText={setLongitude} style={styles.coordinateInput} value={longitude} />
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={applyCoordinates} style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}>
            <Text style={styles.applyText}>Aplicar ubicación</Text>
          </Pressable>
          {coordinateError && <Text accessibilityRole="alert" style={styles.coordinateError}>{coordinateError}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  mapFrame: { height: 190, overflow: 'hidden', borderRadius: 16, backgroundColor: KlippColors.surfaceBlue },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.88)' },
  errorOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8, backgroundColor: 'rgba(255,255,255,0.92)' },
  mapHint: { position: 'absolute', right: 8, bottom: 8, left: 8, alignSelf: 'center', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.92)', color: KlippColors.slate, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  missingKey: { minHeight: 92, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 16, backgroundColor: KlippColors.surfaceWarning, gap: 6 },
  errorTitle: { color: KlippColors.ink, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  overlayText: { color: KlippColors.slate, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  coordinateSummary: { alignItems: 'center', gap: 2 },
  title: { color: KlippColors.ink, fontSize: 14, fontWeight: '800' },
  coordinates: { color: KlippColors.slate, fontSize: 12 },
  coordinateFields: { flexDirection: 'row', gap: 8 },
  coordinateField: { flex: 1, minWidth: 0, gap: 4 },
  fieldLabel: { color: KlippColors.muted, fontSize: 10, fontWeight: '800' },
  coordinateInput: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, backgroundColor: KlippColors.white, color: KlippColors.slate, fontSize: 12 },
  applyButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: KlippColors.cobalt },
  applyText: { color: KlippColors.white, fontSize: 12, fontWeight: '800' },
  coordinateError: { color: KlippColors.danger, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.88 },
});
