export async function configureNotificationChannelsAsync(): Promise<void> {
  // Native notification channels are not available in browsers.
}

export async function registerPushDeviceAsync(_userId: string): Promise<null> {
  return null;
}

export async function isPushDeviceRegisteredAsync(_userId: string): Promise<boolean> {
  return false;
}

export async function unregisterPushDeviceAsync(_userId: string): Promise<void> {
  // Browser sessions do not register native Expo push tokens.
}
