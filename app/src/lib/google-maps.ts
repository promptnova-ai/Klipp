import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

let mapsLibraryPromise: Promise<google.maps.MapsLibrary> | null = null;

export function loadGoogleMapsLibrary() {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('Falta EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
  if (!mapsLibraryPromise) {
    setOptions({ key, v: 'weekly' });
    mapsLibraryPromise = importLibrary('maps') as Promise<google.maps.MapsLibrary>;
  }
  return mapsLibraryPromise;
}
