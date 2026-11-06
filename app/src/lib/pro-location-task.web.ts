export const PRO_LOCATION_TASK = 'KLIPP_PRO_LOCATION_TRACKING';

export async function updateActiveProTrackingBookings(_bookingIds: string[]): Promise<void> {
  // Background GPS tracking is a native-only capability.
}

export async function getProLocationTaskError(): Promise<string | null> {
  return null;
}
