export type OperationsMapPoint = {
  bookingId: string;
  professionalName: string | null;
  serviceName: string | null;
  status: string;
  latitude: number;
  longitude: number;
  updatedAt: string | null;
  selected: boolean;
  onSelect: () => void;
};
