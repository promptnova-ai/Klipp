import { createClient } from "npm:@supabase/supabase-js@2";

const OFFER_TIMEOUT_MS = 45000;

Deno.serve(async (req) => {
  try {
    const { bookingId, sectorId, lat, lng } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: candidates, error } = await supabase.rpc(
      "find_available_professionals",
      { p_sector_id: sectorId, p_lat: lat, p_lng: lng, p_radius_km: 15.0 }
    );

    if (error || !candidates || candidates.length === 0) {
      await supabase
        .from("bookings")
        .update({ status: "no_professionals_available" })
        .eq("id", bookingId);

      return new Response(
        JSON.stringify({ success: false, message: "No hay profesionales disponibles en el área." }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }

    for (const candidate of candidates) {
      const { data: offer } = await supabase
        .from("booking_offers")
        .insert({
          booking_id: bookingId,
          professional_id: candidate.professional_id,
          status: "pending",
          expires_at: new Date(Date.now() + OFFER_TIMEOUT_MS).toISOString(),
        })
        .select()
        .single();

      const accepted = await awaitOfferResponse(supabase, offer.id, OFFER_TIMEOUT_MS);

      if (accepted) {
        await supabase
          .from("bookings")
          .update({
            professional_id: candidate.professional_id,
            status: "assigned",
          })
          .eq("id", bookingId);

        return new Response(
          JSON.stringify({ success: true, professionalId: candidate.professional_id }),
          { headers: { "Content-Type": "application/json" }, status: 200 }
        );
      } else {
        await supabase
          .from("booking_offers")
          .update({ status: "expired" })
          .eq("id", offer.id);
      }
    }

    await supabase
      .from("bookings")
      .update({ status: "rejected_by_all" })
      .eq("id", bookingId);

    return new Response(
      JSON.stringify({ success: false, message: "Ningún profesional aceptó la solicitud." }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

async function awaitOfferResponse(supabase: any, offerId: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const { data: offer } = await supabase
      .from("booking_offers")
      .select("status")
      .eq("id", offerId)
      .single();

    if (offer?.status === "accepted") return true;
    if (offer?.status === "rejected") return false;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return false;
}
