import { supabase } from '../lib/supabase'; // Ajusta la ruta si tu cliente de Supabase está en otro lugar

export function subscribeToProfessionalOffers(
  professionalId: string,
  onNewOffer: (offer: any) => void
) {
  const channel = supabase
    .channel(`professional-offers-${professionalId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_offers',
        filter: `professional_id=eq.${professionalId}`,
      },
      (payload) => {
        console.log('¡Nueva oferta recibida!', payload.new);
        onNewOffer(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function respondToBookingOffer(offerId: string, accept: boolean) {
  const newStatus = accept ? 'accepted' : 'rejected';

  const { error } = await supabase
    .from('booking_offers')
    .update({ status: newStatus })
    .eq('id', offerId);

  if (error) {
    console.error('Error al responder a la oferta:', error);
    throw error;
  }

  return { success: true };
}
