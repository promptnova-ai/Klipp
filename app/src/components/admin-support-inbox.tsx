import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';

type SupportCase = {
  id: string;
  booking_id: string | null;
  category: string;
  subject: string;
  status: 'open' | 'in_review' | 'resolved';
  handoff_requested: boolean;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};
type SupportMessage = { id: number; sender_type: 'client' | 'admin' | 'assistant' | 'system'; content: string; created_at: string };
type KnowledgeArticle = { id: string; slug: string; title: string; content: string; category: string; published: boolean; updated_at: string };

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

function statusLabel(status: SupportCase['status']) {
  return status === 'resolved' ? 'Resuelta' : status === 'in_review' ? 'En revisión' : 'Abierta';
}

export function AdminSupportInbox() {
  const { session } = useAuth();
  const [tab, setTab] = useState<'cases' | 'knowledge'>('cases');
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [filter, setFilter] = useState<'all' | SupportCase['status']>('all');
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [articleTitle, setArticleTitle] = useState('');
  const [articleCategory, setArticleCategory] = useState('general');
  const [articleContent, setArticleContent] = useState('');
  const [articlePublished, setArticlePublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('support_conversations')
      .select('id, booking_id, category, subject, status, handoff_requested, resolution_note, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(80);
    if (queryError) setError(queryError.message);
    else {
      const rows = (data ?? []) as SupportCase[];
      setCases(rows);
      if (selectedId && !rows.some((row) => row.id === selectedId)) setSelectedId(null);
    }
    setLoading(false);
  }, [selectedId]);

  const loadArticles = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('support_knowledge_articles')
      .select('id, slug, title, content, category, published, updated_at')
      .order('updated_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else setArticles((data ?? []) as KnowledgeArticle[]);
  }, []);

  useEffect(() => { void loadCases(); void loadArticles(); }, [loadCases, loadArticles]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let active = true;
    void supabase.from('support_messages')
      .select('id, sender_type, content, created_at')
      .eq('conversation_id', selectedId)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(queryError.message);
        else setMessages((data ?? []) as SupportMessage[]);
      });
    return () => { active = false; };
  }, [selectedId]);

  const filteredCases = useMemo(
    () => cases.filter((item) => filter === 'all' || item.status === filter),
    [cases, filter],
  );
  const selectedCase = cases.find((item) => item.id === selectedId) ?? null;
  const counts = useMemo(() => ({
    open: cases.filter((item) => item.status === 'open').length,
    in_review: cases.filter((item) => item.status === 'in_review').length,
    resolved: cases.filter((item) => item.status === 'resolved').length,
  }), [cases]);

  async function sendReply() {
    if (!selectedCase || !session?.user.id || reply.trim().length < 2 || busy) return;
    setBusy(true); setError(null); setNotice(null);
    const { error: messageError } = await supabase.from('support_messages').insert({
      conversation_id: selectedCase.id,
      sender_id: session.user.id,
      sender_type: 'admin',
      content: reply.trim(),
    });
    if (messageError) setError(messageError.message);
    else {
      const { error: updateError } = await supabase.from('support_conversations').update({
        status: 'in_review',
        assigned_admin_id: session.user.id,
        handoff_requested: false,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedCase.id);
      if (updateError) setError(updateError.message);
      else {
        setReply('');
        setNotice('Respuesta enviada al cliente.');
        await loadCases();
        const { data } = await supabase.from('support_messages')
          .select('id, sender_type, content, created_at')
          .eq('conversation_id', selectedCase.id)
          .order('created_at', { ascending: true }).limit(100);
        setMessages((data ?? []) as SupportMessage[]);
      }
    }
    setBusy(false);
  }

  async function updateCaseStatus(status: SupportCase['status']) {
    if (!selectedCase || !session?.user.id || busy) return;
    if (status === 'resolved' && resolutionNote.trim().length < 8) {
      setError('Añade una nota de resolución de al menos 8 caracteres.');
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    const { error: updateError } = await supabase.from('support_conversations').update({
      status,
      assigned_admin_id: status === 'open' ? null : session.user.id,
      handoff_requested: false,
      resolution_note: status === 'resolved' ? resolutionNote.trim() : null,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      resolved_by: status === 'resolved' ? session.user.id : null,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedCase.id);
    if (updateError) setError(updateError.message);
    else {
      setNotice(status === 'resolved' ? 'Caso resuelto y registrado.' : status === 'in_review' ? 'Caso asignado a tu bandeja.' : 'Caso reabierto.');
      await loadCases();
      if (status === 'resolved') setResolutionNote('');
    }
    setBusy(false);
  }

  function selectArticle(article: KnowledgeArticle) {
    setArticleId(article.id);
    setArticleTitle(article.title);
    setArticleCategory(article.category);
    setArticleContent(article.content);
    setArticlePublished(article.published);
  }

  function resetArticle() {
    setArticleId(null); setArticleTitle(''); setArticleCategory('general'); setArticleContent(''); setArticlePublished(false);
  }

  async function saveArticle() {
    if (!articleTitle.trim() || articleContent.trim().length < 20 || busy) {
      setError('Completa el título y un contenido de al menos 20 caracteres.');
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    const payload = {
      slug: slugify(articleTitle),
      title: articleTitle.trim(),
      category: articleCategory.trim().toLowerCase() || 'general',
      content: articleContent.trim(),
      published: articlePublished,
      updated_by: session?.user.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const result = articleId
      ? await supabase.from('support_knowledge_articles').update(payload).eq('id', articleId)
      : await supabase.from('support_knowledge_articles').insert(payload);
    if (result.error) setError(result.error.message);
    else {
      setNotice(articlePublished ? 'Artículo guardado y publicado.' : 'Artículo guardado como borrador.');
      resetArticle();
      await loadArticles();
    }
    setBusy(false);
  }

  async function toggleArticle(article: KnowledgeArticle) {
    setBusy(true); setError(null);
    const { error: updateError } = await supabase.from('support_knowledge_articles')
      .update({ published: !article.published, updated_at: new Date().toISOString(), updated_by: session?.user.id ?? null })
      .eq('id', article.id);
    if (updateError) setError(updateError.message);
    else await loadArticles();
    setBusy(false);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('cases')} style={[styles.tab, tab === 'cases' && styles.tabActive]}><Text style={[styles.tabText, tab === 'cases' && styles.tabTextActive]}>Conversaciones</Text></Pressable>
        <Pressable onPress={() => setTab('knowledge')} style={[styles.tab, tab === 'knowledge' && styles.tabActive]}><Text style={[styles.tabText, tab === 'knowledge' && styles.tabTextActive]}>Base de conocimiento</Text></Pressable>
      </View>

      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

      {tab === 'cases' && (
        <View style={styles.section}>
          <Text style={styles.heading}>Atención al cliente</Text>
          <Text style={styles.muted}>Consulta los casos, responde y registra la resolución. No se muestran teléfonos, direcciones ni datos de pago en esta bandeja.</Text>
          <View style={styles.counts}>
            <Count label="Abiertas" value={counts.open} />
            <Count label="En revisión" value={counts.in_review} />
            <Count label="Resueltas" value={counts.resolved} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {(['all', 'open', 'in_review', 'resolved'] as const).map((value) => (
              <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}>
                <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value === 'all' ? 'Todas' : statusLabel(value)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {loading ? <ActivityIndicator color={KlippColors.blue} /> : filteredCases.length === 0 ? <Text style={styles.muted}>No hay casos en esta vista.</Text> : filteredCases.map((item) => (
            <Pressable key={item.id} onPress={() => { setSelectedId(item.id); setResolutionNote(item.resolution_note ?? ''); }} style={[styles.caseCard, selectedId === item.id && styles.caseSelected]}>
              <View style={styles.caseHeader}><Text style={styles.caseTitle}>{item.subject}</Text><Text style={styles.caseStatus}>{statusLabel(item.status)}</Text></View>
              <Text style={styles.muted}>{item.category.toUpperCase()} · {new Date(item.created_at).toLocaleString()}</Text>
              <Text style={styles.muted}>{item.booking_id ? `Reserva vinculada · ${item.booking_id.slice(0, 8)}` : 'Consulta general'}{item.handoff_requested ? ' · Requiere atención' : ''}</Text>
            </Pressable>
          ))}
          {selectedCase && (
            <View style={styles.detail}>
              <View style={styles.caseHeader}><Text style={styles.heading}>{selectedCase.subject}</Text><Text style={styles.caseStatus}>{statusLabel(selectedCase.status)}</Text></View>
              <Text style={styles.muted}>Conversación · {selectedCase.category} · {selectedCase.booking_id ? selectedCase.booking_id.slice(0, 8) : 'Sin reserva vinculada'}</Text>
              <View style={styles.messages}>
                {messages.map((item) => (
                  <View key={item.id} style={[styles.message, item.sender_type === 'client' ? styles.clientMessage : styles.staffMessage]}>
                    <Text style={styles.messageSender}>{item.sender_type === 'client' ? 'Cliente' : item.sender_type === 'admin' ? 'Equipo Klipp' : item.sender_type === 'assistant' ? 'Asistente Klipp' : 'Sistema'}</Text>
                    <Text style={styles.messageText}>{item.content}</Text>
                    <Text style={styles.messageTime}>{new Date(item.created_at).toLocaleString()}</Text>
                  </View>
                ))}
                {messages.length === 0 && <Text style={styles.muted}>Todavía no hay mensajes en este caso.</Text>}
              </View>
              {selectedCase.status !== 'resolved' && (
                <>
                  <TextInput multiline value={reply} onChangeText={setReply} placeholder="Escribe una respuesta para el cliente..." style={[styles.input, styles.multiline]} />
                  <Pressable disabled={busy || reply.trim().length < 2} onPress={() => void sendReply()} style={[styles.primaryButton, (busy || reply.trim().length < 2) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Enviando...' : 'Enviar respuesta'}</Text></Pressable>
                  <Text style={styles.fieldLabel}>Nota de resolución</Text>
                  <TextInput multiline value={resolutionNote} onChangeText={setResolutionNote} placeholder="Resume la solución aplicada (obligatorio para cerrar)" style={[styles.input, styles.multiline]} />
                  <View style={styles.actions}>
                    <Pressable disabled={busy} onPress={() => void updateCaseStatus('in_review')} style={styles.secondaryButton}><Text style={styles.secondaryText}>Tomar caso</Text></Pressable>
                    <Pressable disabled={busy || resolutionNote.trim().length < 8} onPress={() => void updateCaseStatus('resolved')} style={[styles.primaryButton, (busy || resolutionNote.trim().length < 8) && styles.disabled]}><Text style={styles.primaryText}>Resolver caso</Text></Pressable>
                  </View>
                </>
              )}
              {selectedCase.status === 'resolved' && (
                <View style={styles.resolution}><Text style={styles.fieldLabel}>Resolución registrada</Text><Text style={styles.messageText}>{selectedCase.resolution_note}</Text><Pressable disabled={busy} onPress={() => void updateCaseStatus('open')} style={styles.secondaryButton}><Text style={styles.secondaryText}>Reabrir caso</Text></Pressable></View>
              )}
            </View>
          )}
        </View>
      )}

      {tab === 'knowledge' && (
        <View style={styles.section}>
          <Text style={styles.heading}>Base de conocimiento</Text>
          <Text style={styles.muted}>El asistente solo recupera artículos publicados. Mantén aquí las respuestas oficiales de Klipp y deja en borrador las políticas que aún no estén aprobadas.</Text>
          <Text style={styles.fieldLabel}>Título</Text>
          <TextInput value={articleTitle} onChangeText={setArticleTitle} placeholder="Ej. Cómo funciona una reserva" style={styles.input} />
          <Text style={styles.fieldLabel}>Categoría</Text>
          <TextInput value={articleCategory} onChangeText={setArticleCategory} placeholder="general, reservas, pagos..." style={styles.input} />
          <Text style={styles.fieldLabel}>Contenido</Text>
          <TextInput multiline value={articleContent} onChangeText={setArticleContent} placeholder="Escribe la información oficial que puede consultar el asistente..." style={[styles.input, styles.multiline]} />
          <View style={styles.switchRow}><Text style={styles.fieldLabel}>Publicado y disponible para la IA</Text><Switch value={articlePublished} onValueChange={setArticlePublished} /></View>
          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={resetArticle} style={styles.secondaryButton}><Text style={styles.secondaryText}>Nuevo artículo</Text></Pressable>
            <Pressable disabled={busy || !articleTitle.trim() || articleContent.trim().length < 20} onPress={() => void saveArticle()} style={[styles.primaryButton, (busy || !articleTitle.trim() || articleContent.trim().length < 20) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Guardando...' : articleId ? 'Guardar cambios' : 'Crear artículo'}</Text></Pressable>
          </View>
          <Text style={styles.fieldLabel}>Artículos existentes</Text>
          {articles.map((article) => (
            <View key={article.id} style={styles.articleCard}>
              <Pressable style={styles.articleCopy} onPress={() => selectArticle(article)}>
                <Text style={styles.caseTitle}>{article.title}</Text>
                <Text style={styles.muted}>{article.category} · {article.published ? 'Publicado' : 'Borrador'}</Text>
              </Pressable>
              <Pressable onPress={() => void toggleArticle(article)} disabled={busy} style={styles.filter}>
                <Text style={styles.filterText}>{article.published ? 'Despublicar' : 'Publicar'}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return <View style={styles.count}><Text style={styles.countValue}>{value}</Text><Text style={styles.countLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { minHeight: 40, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: '#FFFFFF' },
  tabActive: { backgroundColor: '#27213F', borderColor: '#27213F' },
  tabText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },
  section: { gap: 12 },
  heading: { color: KlippColors.navy, fontSize: 18, fontWeight: '800' },
  muted: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  counts: { flexDirection: 'row', gap: 8 },
  count: { flex: 1, padding: 11, borderRadius: 11, backgroundColor: '#F3F6FA', gap: 3 },
  countValue: { color: KlippColors.navy, fontSize: 21, fontWeight: '800' },
  countLabel: { color: KlippColors.muted, fontSize: 10, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 7, paddingVertical: 2 },
  filter: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: '#FFFFFF' },
  filterActive: { backgroundColor: '#E9EEFF', borderColor: KlippColors.blue },
  filterText: { color: KlippColors.slate, fontSize: 11, fontWeight: '700' },
  filterTextActive: { color: KlippColors.blue },
  caseCard: { padding: 13, gap: 5, borderRadius: 14, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: '#FFFFFF' },
  caseSelected: { borderColor: KlippColors.blue, backgroundColor: '#F5F8FF' },
  caseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  caseTitle: { flex: 1, color: KlippColors.navy, fontSize: 13, fontWeight: '800' },
  caseStatus: { color: KlippColors.blue, fontSize: 10, fontWeight: '800' },
  detail: { padding: 14, gap: 11, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: '#F9FBFF' },
  messages: { gap: 8, maxHeight: 420 },
  message: { padding: 11, borderRadius: 12, gap: 5 },
  clientMessage: { backgroundColor: '#E8F0FF', alignSelf: 'flex-start', maxWidth: '92%' },
  staffMessage: { backgroundColor: '#FFFFFF', alignSelf: 'flex-end', maxWidth: '92%', borderWidth: 1, borderColor: KlippColors.border },
  messageSender: { color: KlippColors.slate, fontSize: 10, fontWeight: '800' },
  messageText: { color: KlippColors.navy, fontSize: 12, lineHeight: 18 },
  messageTime: { color: KlippColors.muted, fontSize: 9 },
  fieldLabel: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 11, backgroundColor: '#FFFFFF', color: KlippColors.navy, fontSize: 13 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: KlippColors.blue },
  primaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  secondaryButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#EEF2F7' },
  secondaryText: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  resolution: { padding: 12, gap: 8, borderRadius: 12, backgroundColor: '#EDF8F0' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  articleCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, backgroundColor: '#FFFFFF' },
  articleCopy: { flex: 1, gap: 4 },
  error: { color: KlippColors.danger, fontSize: 12 },
  notice: { color: '#067647', fontSize: 12 },
});
