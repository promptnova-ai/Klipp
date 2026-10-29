import React, { useEffect, useState } from 'react';
import { View, Text, Button, Alert, StyleSheet } from 'react-native';
import { subscribeToProfessionalOffers, respondToBookingOffer } from '../services/bookingSubscription';

export default function ProfessionalDashboard({ professionalId }: { professionalId: string }) {
  const [currentOffer, setCurrentOffer] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = subscribeToProfessionalOffers(professionalId, (offer) => {
      if (offer.status === 'pending') {
        setCurrentOffer(offer);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [professionalId]);

  const handleResponse = async (accept: boolean) => {
    try {
      await respondToBookingOffer(currentOffer.id, accept);
      setCurrentOffer(null);
      Alert.alert(accept ? '¡Servicio aceptado!' : 'Has rechazado la oferta.');
    } catch (err) {
      Alert.alert('Error', 'No se pudo procesar tu respuesta a tiempo.');
    }
  };

  return (
    <View style={styles.container}>
      {currentOffer ? (
        <View style={styles.offerCard}>
          <Text style={styles.title}>¡Nueva Solicitud de Servicio!</Text>
          <Text style={styles.subtitle}>Tienes 45 segundos para aceptar o rechazar.</Text>
          
          <View style={styles.buttonContainer}>
            <Button title="Aceptar" onPress={() => handleResponse(true)} color="#28a745" />
            <Button title="Rechazar" onPress={() => handleResponse(false)} color="#dc3545" />
          </View>
        </View>
      ) : (
        <Text style={styles.waitingText}>Buscando servicios cercanos y esperando ofertas...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f9f9f9' },
  offerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 10, width: '100%', alignItems: 'center', elevation: 3 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  waitingText: { fontSize: 16, color: '#888', textAlign: 'center' }
});
