import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';

type BookingOption = { id: string; status: string; scheduled_start: string; service_types: { name: string } | null };
type SupportCase = { id: string; subject: string; category: string; status: 'open' | 'in_review' | 'resolved'; handoff_requested: boolean; created_at: string };
type SupportMessage = { id: number; sender_type: 'client' | 'admin' | 'assistant' | 'system'; content: string; created_at: string };

const topics = [
  { id: 'booking', title: 'Mi reserva', detail: 'Cambios, retrasos o cancelaciones', icon: 'calendar' },
  { id: 'professional', title: 'El profesional', detail: 'Comportamiento o calidad del servicio', icon: 'person' },
  { id: 'payment', title: 'Pago y reembolso', detail: 'Cobros, pagos o devolución', icon: 'creditcard' },
  { id: 'safety', title: 'Seguridad', detail: 'Reportar una situación urgente', icon: 'shield' },
  { id: 'other', title: 'Otra consulta', detail: 'Cualquier otra pregunta', icon: 'questionmark.circle' },
] as const;

export function ClientSupportScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('booking');
  const [selectedBooking, setSelectedBooking] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [bookingResult, caseResult] = await Promise.all([
      supabase.from('bookings').select('id, status, scheduled_start, service_types(name)').eq('client_id', userId).order('created_at', { ascending: false }).limit(8),
      supabase.from('support_conversations').select('id, subject, category, status, handoff_requested, created_at').eq('client_id', userId).order('created_at', { ascending: false }).limit(5),
    ]);
    if (bookingResult.error || caseResult.error) setError(bookingResult.error?.message ?? caseResult.error?.message ?? 'No pudimos cargar el centro de ayuda.');
    else {
      setBookings((bookingResult.data ?? []) as unknown as BookingOption[]);
      setCases((caseResult.data ?? []) as SupportCase[]);
    }
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!selectedCaseId) { setMessages([]); return; }
    let active = true;
    void supabase.from('support_messages')
      .select('id, sender_type, content, created_at')
      .eq('conversation_id', selectedCaseId)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(queryError.message);
        else setMessages((data ?? []) as SupportMessage[]);
      });
    return () => { active = false; };
  }, [selectedCaseId]);

  async function submitCase() {
    if (!userId || description.trim().length < 12 || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    const topic = topics.find((item) => item.id === selectedTopic);
    const { data: conversation, error: createError } = await supabase
      .from('support_conversations')
      .insert({
        client_id: userId,
        booking_id: selectedBooking,
        category: selectedTopic,
        subject: topic?.title ?? 'Consulta',
        status: 'open',
        handoff_requested: false,
      })
      .select('id')
      .single();
    if (createError || !conversation) {
      setError(createError?.message ?? 'No pudimos registrar tu consulta.');
      setSending(false);
      return;
    }
    const initialMessage = description.trim();
    setSelectedCaseId(conversation.id);
    setChatDraft(initialMessage);
    const { error: chatError } = await supabase.functions.invoke('support-chat', {
      body: { conversationId: conversation.id, message: initialMessage },
    });
    if (chatError) {
      setError('El caso se ha creado, pero no pudimos activar el chat. Tu mensaje sigue preparado para que puedas reintentarlo.');
    } else {
      setDescription('');
      setChatDraft('');
      setNotice('Tu consulta está registrada. Si hace falta, el equipo Klipp continuará contigo por este chat.');
      await load();
      const { data } = await supabase.from('support_messages')
        .select('id, sender_type, content, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true }).limit(100);
      setMessages((data ?? []) as SupportMessage[]);
    }
    setSending(false);
  }

  async function sendChatMessage() {
    if (!userId || !selectedCaseId || chatDraft.trim().length < 2 || sending) return;
    setSending(true); setError(null); setNotice(null);
    const { error: chatError } = await supabase.functions.invoke('support-chat', {
      body: { conversationId: selectedCaseId, message: chatDraft.trim() },
    });
    if (chatError) {
      setError('No se pudo enviar el mensaje. Conservamos el texto para que puedas reintentarlo.');
    } else {
      setChatDraft('');
      await load();
      const { data, error: queryError } = await supabase.from('support_messages')
        .select('id, sender_type, content, created_at')
        .eq('conversation_id', selectedCaseId)
        .order('created_at', { ascending: true }).limit(100);
      if (queryError) setError(queryError.message);
      else setMessages((data ?? []) as SupportMessage[]);
    }
    setSending(false);
  }

  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? null;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader eyebrow="ESTAMOS PARA AYUDARTE" title="Centro de ayuda" subtitle="Cuéntanos qué ha ocurrido. Si hace falta, nuestro equipo continuará contigo." />
      <View style={styles.content}>
        <View style={styles.assistantCard}>
          <View style={styles.assistantIcon}><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor="#EAB308" size={22} /></View>
          <View style={styles.assistantCopy}>
            <Text style={styles.assistantTitle}>Asistente Klipp</Text>
            <Text style={styles.assistantText}>El asistente consulta la información oficial de Klipp y solo los datos necesarios de tu reserva. Si no encuentra una respuesta fiable, deriva el caso a nuestro equipo.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>¿En qué podemos ayudarte?</Text>
        <View style={styles.topicList}>
          {topics.map((topic) => (
            <Pressable key={topic.id} accessibilityRole="radio" accessibilityState={{ selected: selectedTopic === topic.id }} onPress={() => setSelectedTopic(topic.id)} style={[styles.topic, selectedTopic === topic.id && styles.topicSelected]}>
              <View style={[styles.topicIcon, selectedTopic === topic.id && styles.topicIconSelected]}>
                <SymbolView name={{ ios: topic.icon, android: topic.id === 'booking' ? 'calendar_month' : topic.id === 'payment' ? 'payments' : topic.id === 'safety' ? 'shield' : topic.id === 'professional' ? 'person' : 'help_outline', web: topic.id === 'booking' ? 'event' : topic.id === 'payment' ? 'payments' : topic.id === 'safety' ? 'shield' : topic.id === 'professional' ? 'person' : 'help_outline' }} tintColor={selectedTopic === topic.id ? KlippColors.blue : KlippColors.muted} size={19} />
              </View>
              <View style={styles.topicCopy}><Text style={styles.topicTitle}>{topic.title}</Text><Text style={styles.topicDetail}>{topic.detail}</Text></View>
              <SymbolView name={{ ios: selectedTopic === topic.id ? 'checkmark.circle.fill' : 'circle', android: selectedTopic === topic.id ? 'radio_button_checked' : 'radio_button_unchecked', web: selectedTopic === topic.id ? 'check_circle' : 'radio_button_unchecked' }} tintColor={selectedTopic === topic.id ? KlippColors.blue : '#A5AFBC'} size={20} />
            </Pressable>
          ))}
        </View>

        {bookings.length > 0 && (
          <View style={styles.fieldGroup}>
            <Text style={styles.sectionTitle}>¿Está relacionado con una reserva?</Text>
            <View style={styles.bookingList}>
              <Pressable onPress={() => setSelectedBooking(null)} style={[styles.bookingOption, !selectedBooking && styles.bookingOptionSelected]}>
                <Text style={styles.bookingText}>No está relacionada con una reserva</Text>
              </Pressable>
              {bookings.map((booking) => (
                <Pressable key={booking.id} onPress={() => setSelectedBooking(booking.id)} style={[styles.bookingOption, selectedBooking === booking.id && styles.bookingOptionSelected]}>
                  <Text style={styles.bookingText}>{booking.service_types?.name ?? 'Servicio'} · {new Date(booking.scheduled_start).toLocaleDateString('es-DO')}</Text>
                  <Text style={styles.bookingStatus}>{booking.status.replace(/_/g, ' ')}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.sectionTitle}>Describe lo ocurrido</Text>
          <TextInput accessibilityLabel="Describe tu consulta o reclamación" multiline maxLength={3000} value={description} onChangeText={setDescription} placeholder="Incluye los detalles que nos ayuden a entender tu caso..." placeholderTextColor="#8A96A5" style={styles.messageInput} textAlignVertical="top" />
          <Text style={styles.counter}>{description.length}/3000 · No incluyas datos de tarjetas ni contraseñas.</Text>
        </View>

        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}
        <Pressable accessibilityRole="button" disabled={sending || description.trim().length < 12} onPress={() => void submitCase()} style={[styles.submit, (sending || description.trim().length < 12) && styles.submitDisabled]}>
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Enviar consulta al equipo Klipp</Text>}
        </Pressable>

        <View style={styles.casesHeader}><Text style={styles.sectionTitle}>Tus consultas recientes</Text><Pressable onPress={() => void load()}><Text style={styles.refresh}>Actualizar</Text></Pressable></View>
        {loading ? <ActivityIndicator color={KlippColors.blue} /> : cases.length === 0 ? <Text style={styles.emptyText}>Todavía no has abierto ninguna consulta.</Text> : cases.map((item) => (
          <Pressable key={item.id} onPress={() => { setSelectedCaseId(item.id); setNotice(null); }} style={[styles.caseRow, selectedCaseId === item.id && styles.caseSelected]}>
            <View style={styles.caseCopy}><Text style={styles.caseTitle}>{item.subject}</Text><Text style={styles.caseDate}>{new Date(item.created_at).toLocaleDateString('es-DO')} · {item.category}</Text></View>
            <View style={[styles.caseStatus, item.status === 'resolved' && styles.caseResolved, item.status === 'in_review' && styles.caseReview]}><Text style={styles.caseStatusText}>{item.status === 'resolved' ? 'Resuelta' : item.status === 'in_review' ? 'En revisión' : 'Abierta'}</Text></View>
          </Pressable>
        ))}
        {selectedCase && (
          <View style={styles.thread}>
            <View style={styles.casesHeader}>
              <Text style={styles.sectionTitle}>{selectedCase.subject}</Text>
              <Text style={styles.caseDate}>{selectedCase.status === 'resolved' ? 'Resuelta' : selectedCase.handoff_requested ? 'Atención humana' : selectedCase.status === 'in_review' ? 'En revisión' : 'Asistente activo'}</Text>
            </View>
            <View style={styles.threadMessages}>
              {messages.map((message) => (
                <View key={message.id} style={[styles.threadMessage, message.sender_type === 'client' ? styles.threadClient : styles.threadStaff]}>
                  <Text style={styles.threadSender}>{message.sender_type === 'client' ? 'Tú' : message.sender_type === 'admin' ? 'Equipo Klipp' : message.sender_type === 'assistant' ? 'Asistente Klipp' : 'Klipp'}</Text>
                  <Text style={styles.threadText}>{message.content}</Text>
                  <Text style={styles.threadTime}>{new Date(message.created_at).toLocaleString('es-DO')}</Text>
                </View>
              ))}
              {messages.length === 0 && <Text style={styles.emptyText}>Cargando conversación...</Text>}
            </View>
            {selectedCase.status !== 'resolved' ? (
              <>
                <TextInput accessibilityLabel="Escribe un mensaje al equipo Klipp" multiline maxLength={1800} value={chatDraft} onChangeText={setChatDraft} placeholder="Escribe tu mensaje..." placeholderTextColor="#8A96A5" style={styles.messageInput} textAlignVertical="top" />
                <Pressable accessibilityRole="button" disabled={sending || chatDraft.trim().length < 2} onPress={() => void sendChatMessage()} style={[styles.submit, (sending || chatDraft.trim().length < 2) && styles.submitDisabled]}>
                  {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Enviar mensaje</Text>}
                </Pressable>
              </>
            ) : <Text style={styles.emptyText}>Este caso está resuelto. Si necesitas más ayuda, abre una nueva consulta.</Text>}
          </View>
        )}
        <Text style={styles.footnote}>Las reclamaciones relacionadas con un servicio quedan vinculadas a su reserva para facilitar la revisión.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingBottom: 44, backgroundColor: KlippColors.canvas },
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 18, gap: 15 },
  assistantCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 17, borderRadius: 18, backgroundColor: '#17191D', borderWidth: 1, borderColor: '#34302A' },
  assistantIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#332B16', alignItems: 'center', justifyContent: 'center' },
  assistantCopy: { flex: 1, gap: 5 },
  assistantTitle: { color: '#F5D98B', fontSize: 15, fontWeight: '800' },
  assistantText: { color: '#D1D5DB', fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '800' },
  topicList: { gap: 8 },
  topic: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 15, backgroundColor: KlippColors.white },
  topicSelected: { borderColor: KlippColors.blue, backgroundColor: '#F1F6FF' },
  topicIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F4F8' },
  topicIconSelected: { backgroundColor: '#E0EAFF' },
  topicCopy: { flex: 1, gap: 3 },
  topicTitle: { color: KlippColors.navy, fontSize: 13, fontWeight: '800' },
  topicDetail: { color: KlippColors.muted, fontSize: 11 },
  fieldGroup: { gap: 9 },
  bookingList: { gap: 7 },
  bookingOption: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 4 },
  bookingOptionSelected: { borderColor: KlippColors.blue, backgroundColor: '#F1F6FF' },
  bookingText: { color: KlippColors.navy, fontSize: 12, fontWeight: '700' },
  bookingStatus: { color: KlippColors.muted, fontSize: 10, textTransform: 'capitalize' },
  messageInput: { minHeight: 132, padding: 14, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 15, backgroundColor: KlippColors.white, color: KlippColors.navy, fontSize: 13, lineHeight: 20 },
  counter: { color: KlippColors.muted, fontSize: 10 },
  submit: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: KlippColors.blue },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  error: { color: KlippColors.danger, fontSize: 12 },
  notice: { color: '#087443', fontSize: 12, lineHeight: 18 },
  casesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  refresh: { color: KlippColors.blue, fontSize: 12, fontWeight: '700' },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  caseSelected: { borderColor: KlippColors.blue, backgroundColor: '#F1F6FF' },
  caseReview: { backgroundColor: '#EAF2FF' },
  thread: { padding: 14, gap: 11, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: '#F8FAFD' },
  threadMessages: { gap: 8, maxHeight: 420 },
  threadMessage: { padding: 11, borderRadius: 12, gap: 5, maxWidth: '92%' },
  threadClient: { alignSelf: 'flex-end', backgroundColor: '#E8F0FF' },
  threadStaff: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: KlippColors.border },
  threadSender: { color: KlippColors.slate, fontSize: 10, fontWeight: '800' },
  threadText: { color: KlippColors.navy, fontSize: 12, lineHeight: 18 },
  threadTime: { color: KlippColors.muted, fontSize: 9 },
  caseCopy: { flex: 1, gap: 4 },
  caseTitle: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  caseDate: { color: KlippColors.muted, fontSize: 10 },
  caseStatus: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF3D6' },
  caseResolved: { backgroundColor: '#E8F6F1' },
  caseStatusText: { color: KlippColors.navy, fontSize: 9, fontWeight: '800' },
  emptyText: { color: KlippColors.muted, fontSize: 12 },
  footnote: { color: KlippColors.muted, fontSize: 10, lineHeight: 16, marginTop: 3 },
});
