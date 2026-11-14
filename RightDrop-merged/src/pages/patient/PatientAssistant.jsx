import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, MessageCircle, Phone, RefreshCw, Send, X } from 'lucide-react'
import Spinner from '../../components/Spinner'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { callAssistant } from '../../lib/assistantClient'
import { loadConversation, saveConversation, clearConversation } from '../../lib/assistantStore'
import {
  ASSISTANT_TEXT as T,
  SUGGESTED_QUESTIONS,
  ASSISTANT_LIMITS,
  CLARIFY_ANSWERS,
  CLARIFY_QUESTIONS,
  SAFETY_LABELS,
  assessMessage,
  clarifyCategoryOf,
  clarifyMessageFor,
  detectLanguage,
  urgentMessageFor,
  validateMessageText,
  assistantErrorMessage,
} from '../../core'

let nextId = 0
const newId = () => `${Date.now()}-${nextId++}`

// Message roles: 'user' and 'assistant' are the conversation (and the only
// ones sent to the server). 'notice' is a note from the app itself.
// Assistant messages carry `lang` ('ar' | 'en'): the assistant answers in the
// language the patient wrote in, and the fixed safety texts follow it.
export default function PatientAssistant() {
  const { user, session } = useAuth()
  const [messages, setMessages] = useState(() => (user ? loadConversation(user.id) : []))
  const [draft, setDraft] = useState('')
  const [inputError, setInputError] = useState(null)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState(null)
  const [doctors, setDoctors] = useState([])
  const [share, setShare] = useState(null)
  const endRef = useRef(null)
  const busyRef = useRef(false)

  // Keep the conversation for this session on this device.
  useEffect(() => {
    if (user) saveConversation(user.id, messages)
  }, [user, messages])

  // The patient's connected doctors (id + name only), for sharing a summary.
  // If this is unavailable the share button is simply not offered.
  useEffect(() => {
    if (!user) return
    supabase.rpc('my_doctors').then(({ data, error: rpcError }) => {
      if (!rpcError && Array.isArray(data)) setDoctors(data)
    })
  }, [user])

  // Keep the newest thing in view. An emergency warning is shown from its
  // first line, so its heading and instruction are never scrolled off screen.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last?.urgent && !waiting && !error && !share) {
      document.getElementById(`assistant-message-${last.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, waiting, error, share])

  const append = (message) => setMessages((prev) => [...prev, { id: newId(), ...message }])

  // Ask the server for a reply to the conversation as it stands.
  const requestReply = useCallback(async (conversation) => {
    if (busyRef.current) return
    busyRef.current = true
    setWaiting(true)
    setError(null)
    const result = await callAssistant(session, 'chat', conversation)
    if (result.ok && typeof result.data.reply === 'string' && result.data.reply.trim()) {
      setMessages((prev) => [...prev, {
        id: newId(),
        role: 'assistant',
        content: result.data.reply,
        urgent: result.data.urgent === true,
        contactDoctor: result.data.contactDoctor === true,
        clarify: CLARIFY_QUESTIONS.ar[result.data.clarify] ? result.data.clarify : null,
        lang: detectLanguage(result.data.reply),
      }])
    } else {
      // A clear error. Never a made-up answer.
      setError({ message: assistantErrorMessage(result.ok ? 'unknown' : result.code) })
    }
    setWaiting(false)
    busyRef.current = false
  }, [session])

  const send = (text) => {
    if (waiting || busyRef.current) return
    const problem = validateMessageText(text)
    if (problem) {
      setInputError(problem)
      return
    }
    setInputError(null)
    setError(null)
    setShare(null)
    setDraft('')
    const userMessage = { id: newId(), role: 'user', content: text.trim() }

    // Emergencies are decided on the device by fixed rules, before any network
    // call, so the patient is told what to do even when the assistant service
    // is unavailable. A negated or unsure description of a serious symptom
    // gets one fixed clarifying question instead.
    const previous = messages[messages.length - 1]
    const pendingClarify = previous?.role === 'assistant'
      ? previous.clarify || clarifyCategoryOf(previous.content)
      : null
    const assessment = assessMessage(userMessage.content, { pendingClarify })
    if (assessment.level === 'urgent') {
      setMessages((prev) => [...prev, userMessage, {
        id: newId(), role: 'assistant', content: urgentMessageFor(assessment.categories, assessment.lang), urgent: true, lang: assessment.lang,
      }])
      return
    }
    if (assessment.level === 'clarify') {
      setMessages((prev) => [...prev, userMessage, {
        id: newId(), role: 'assistant', content: clarifyMessageFor(assessment.clarify, assessment.lang), clarify: assessment.clarify, lang: assessment.lang,
      }])
      return
    }

    const conversation = [...messages, userMessage]
    setMessages(conversation)
    requestReply(conversation)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    send(draft)
  }

  const startNew = () => {
    if (messages.length > 0 && !window.confirm('بدء محادثة جديدة؟ ستُمسح المحادثة الحالية من هذا الجهاز.')) return
    setMessages([])
    setError(null)
    setShare(null)
    setDraft('')
    setInputError(null)
    if (user) clearConversation(user.id)
  }

  // ---- Summary for the doctor: drafted, shown, and sent only on "yes" ---------
  const prepareSummary = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setError(null)
    setShare({ status: 'preparing' })
    const result = await callAssistant(session, 'summary', messages)
    busyRef.current = false
    if (!result.ok) {
      setShare(null)
      setError({ message: assistantErrorMessage(result.code), noRetry: true })
      return
    }
    if (result.data.urgent && result.data.urgentMessage) {
      append({ role: 'assistant', content: result.data.urgentMessage, urgent: true, lang: detectLanguage(result.data.urgentMessage) })
    }
    const summary = typeof result.data.summary === 'string' ? result.data.summary.trim() : ''
    if (!summary) {
      setShare(null)
      append({ role: 'notice', content: T.shareEmpty })
      return
    }
    setShare({ status: 'review', summary: summary.slice(0, ASSISTANT_LIMITS.maxSummaryChars), doctorId: doctors[0]?.doctor_id })
  }

  const approveShare = async () => {
    if (!share || share.status !== 'review' || !share.doctorId) return
    setShare({ ...share, status: 'sending' })
    const { data, error: insertError } = await supabase
      .from('patient_reports')
      .insert({ patient_id: user.id, doctor_id: share.doctorId, summary: share.summary })
      .select('id')
      .single()
    if (insertError || !data) {
      setShare({ ...share, status: 'review' })
      setError({
        message: insertError?.message?.includes('report_limit_reached')
          ? 'أرسلت الحد الأعلى من الملخصات اليوم. حاول غداً، أو تواصل مع طبيبك مباشرة.'
          : 'تعذّر إرسال الملخص. لم يصل شيء إلى طبيبك. حاول مرة أخرى.',
        noRetry: true,
      })
      return
    }
    const doctor = doctors.find((d) => d.doctor_id === share.doctorId)
    setShare(null)
    append({ role: 'notice', content: T.shareSent, tone: 'success', reportId: data.id, detail: doctor?.full_name || null })
  }

  const declineShare = () => {
    setShare(null)
    append({ role: 'notice', content: T.shareCancelled })
  }

  const undoShare = async (message) => {
    const { error: deleteError } = await supabase.from('patient_reports').delete().eq('id', message.reportId)
    if (deleteError) {
      setError({ message: 'تعذّر سحب الملخص. حاول مرة أخرى.', noRetry: true })
      return
    }
    setMessages((prev) => prev.map((m) => (
      m.id === message.id ? { ...m, content: T.shareUndone, tone: undefined, reportId: undefined, detail: null } : m
    )))
  }

  const hasPatientMessage = messages.some((m) => m.role === 'user')
  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === 'user'
  // Right after an emergency warning the only next step shown is the warning
  // itself: sending a note to the doctor must not look like an alternative.
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const lastMessage = messages[messages.length - 1]
  const canShare = hasPatientMessage && doctors.length > 0 && !waiting && !share
    && !lastAssistant?.urgent && !lastMessage?.clarify

  return (
    <div className="space-y-4">
      {/* Top action header */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/patient"
          className="inline-flex items-center gap-2 rounded-2xl border border-sand-300 bg-white px-3.5 py-2 text-base font-bold text-slate-800 hover:bg-sand-100 transition-colors"
        >
          <ArrowRight size={20} />
          <span>{T.backToToday}</span>
        </Link>

        {messages.length > 0 && (
          <button
            onClick={startNew}
            className="flex items-center gap-2 rounded-2xl border border-sand-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-sand-100 active:scale-[0.98]"
          >
            <RefreshCw size={18} />
            <span>{T.newConversation}</span>
          </button>
        )}
      </div>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{T.title}</h1>
        <p className="mt-1 text-base text-slate-600">اطرح أي سؤال حول مواعيد وطريقة استخدام قطرات العين</p>
      </div>

      {/* Reassuring disclaimer banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-sand-200 bg-sand-100/80 p-4 text-base text-slate-700">
        <AlertCircle size={22} className="mt-0.5 shrink-0 text-slate-500" />
        <span className="leading-relaxed">{T.disclaimer}</span>
      </div>

      {/* Suggested Questions */}
      {messages.length === 0 && (
        <div className="space-y-4 pt-2">
          <p className="text-xl font-medium leading-relaxed text-slate-800">{T.intro}</p>
          <h2 className="text-lg font-bold text-slate-800">{T.suggestedTitle}</h2>
          <div className="space-y-3">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={waiting}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-lavender-200 bg-white p-4 text-right text-lg sm:text-xl font-bold text-slate-900 shadow-xs transition-all hover:border-lavender-400 hover:bg-lavender-50 active:scale-[0.99] disabled:opacity-60"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lavender-100 text-lavender-700">
                  <MessageCircle size={24} />
                </span>
                <span>{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation Thread */}
      <div className="space-y-4 pt-2" aria-live="polite">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onUndo={undoShare}
            onAnswer={m.id === lastMessage?.id && !waiting ? send : null}
          />
        ))}

        {waiting && (
          <div className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white px-5 py-4 text-xl text-slate-700 shadow-xs" role="status">
            <Spinner size={26} />
            <span>{T.thinking}</span>
          </div>
        )}

        {share?.status === 'preparing' && (
          <div className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white px-5 py-4 text-xl text-slate-700 shadow-xs" role="status">
            <Spinner size={26} />
            <span>{T.sharePreparing}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-3xl border-2 border-rose-300 bg-rose-50 p-5">
            <p className="flex items-start gap-3 text-xl font-semibold text-rose-900">
              <AlertCircle size={28} className="mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </p>
            {!error.noRetry && lastIsUser && (
              <button
                onClick={() => requestReply(messages)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-sage-600 py-3.5 text-xl font-bold text-white active:scale-[0.98]"
              >
                <RefreshCw size={22} />
                <span>{T.retry}</span>
              </button>
            )}
          </div>
        )}

        {/* Doctor Summary Review Dialog */}
        {(share?.status === 'review' || share?.status === 'sending') && (
          <section className="rounded-3xl border-2 border-sage-400 bg-sage-50/80 p-5 shadow-sm" aria-label={T.shareReviewTitle}>
            <h2 className="text-2xl font-bold text-sage-900">{T.shareReviewTitle}</h2>
            <p className="mt-3 whitespace-pre-line rounded-2xl bg-white p-4 text-xl leading-relaxed text-slate-900 border border-sage-200">
              {share.summary}
            </p>

            {doctors.length > 1 && (
              <fieldset className="mt-4">
                <legend className="mb-2 text-lg font-bold text-slate-800">{T.shareChooseDoctor}</legend>
                <div className="space-y-2">
                  {doctors.map((d) => (
                    <label key={d.doctor_id} className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-sand-300 bg-white px-4 py-3 text-xl font-semibold text-slate-900">
                      <input
                        type="radio"
                        name="share-doctor"
                        className="h-6 w-6 text-sage-600"
                        checked={share.doctorId === d.doctor_id}
                        onChange={() => setShare({ ...share, doctorId: d.doctor_id })}
                      />
                      <span>{d.full_name || 'طبيبك'}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <p className="mt-4 text-xl font-bold text-slate-900">{T.shareQuestion}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                onClick={approveShare}
                disabled={share.status === 'sending'}
                className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-sage-600 px-4 text-xl font-bold text-white hover:bg-sage-700 active:scale-[0.98] disabled:opacity-60"
              >
                {share.status === 'sending' ? <Spinner size={24} /> : <CheckCircle2 size={26} />}
                <span>{T.shareYes}</span>
              </button>
              <button
                onClick={declineShare}
                disabled={share.status === 'sending'}
                className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border-2 border-slate-400 bg-white px-4 text-xl font-bold text-slate-800 hover:bg-sand-100 active:scale-[0.98] disabled:opacity-60"
              >
                <X size={26} />
                <span>{T.shareNo}</span>
              </button>
            </div>
            <p className="mt-4 text-base text-slate-700">{T.shareNotice}</p>
          </section>
        )}

        {canShare && (
          <button
            onClick={prepareSummary}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-sage-600 bg-white px-4 py-3.5 text-xl font-bold text-sage-800 hover:bg-sage-50 active:scale-[0.98]"
          >
            <Phone size={22} />
            <span>{T.shareButton}</span>
          </button>
        )}
      </div>

      {/* Large, Easy-to-use Message Composer */}
      <form
        onSubmit={handleSubmit}
        className={`rounded-3xl border-2 border-sand-300 bg-white p-3 shadow-lg ${
          // In reach while chatting; out of the way of an emergency warning.
          messages.length > 0 && !lastMessage?.urgent ? 'sticky bottom-20 z-20' : ''
        }`}
      >
        {inputError && (
          <p className="mb-2 flex items-center gap-2 text-lg font-semibold text-rose-700" role="alert">
            <AlertCircle size={22} />
            {inputError}
          </p>
        )}
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="assistant-input">{T.inputPlaceholder}</label>
          <textarea
            id="assistant-input"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (inputError) setInputError(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(draft)
              }
            }}
            rows={2}
            maxLength={ASSISTANT_LIMITS.maxMessageChars}
            placeholder={T.inputPlaceholder}
            className="min-h-[64px] flex-1 resize-none rounded-2xl border-2 border-sand-200 bg-sand-50/70 px-4 py-3 text-xl text-slate-900 outline-none placeholder:text-slate-400 focus:border-sage-500 focus:bg-white"
          />
          <button
            type="submit"
            disabled={waiting || !draft.trim()}
            className="flex min-h-[64px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-sage-600 px-5 text-xl font-bold text-white hover:bg-sage-700 active:scale-[0.98] disabled:opacity-40 shadow-xs"
          >
            <Send size={24} />
            <span>{T.send}</span>
          </button>
        </div>
      </form>
      <div ref={endRef} className="scroll-mb-24" />
    </div>
  )
}

function MessageBubble({ message, onUndo, onAnswer }) {
  if (message.role === 'notice') {
    const success = message.tone === 'success'
    return (
      <div className={`rounded-2xl border-2 px-4 py-3 text-lg font-semibold ${
        success ? 'border-sage-300 bg-sage-50 text-sage-900' : 'border-sand-300 bg-sand-100 text-slate-800'
      }`}>
        <p className="flex items-start gap-2">
          {success && <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-sage-600" />}
          <span>
            {message.content}
            {message.detail ? ` (${message.detail})` : ''}
          </span>
        </p>
        {message.reportId && (
          <button onClick={() => onUndo(message)} className="mt-2 rounded-lg px-1 py-1 text-base font-bold text-slate-800 underline">
            {T.shareUndo}
          </button>
        )}
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-start">
        <p dir="auto" className="max-w-[88%] whitespace-pre-line rounded-3xl rounded-tr-md bg-sage-700 px-5 py-4 text-xl leading-relaxed text-white shadow-xs">
          {message.content}
        </p>
      </div>
    )
  }

  // English replies are laid out left-to-right, with English labels.
  const lang = (message.lang || detectLanguage(message.content)) === 'en' ? 'en' : 'ar'
  const labels = SAFETY_LABELS[lang]
  const dir = lang === 'en' ? 'ltr' : undefined

  if (message.urgent) {
    return (
      <div id={`assistant-message-${message.id}`} role="alert" dir={dir} className="scroll-mt-4 rounded-3xl border-4 border-rose-600 bg-rose-50 p-5 shadow-sm">
        <p className="flex items-center gap-2 text-2xl font-bold text-rose-800">
          <AlertCircle size={32} className="shrink-0" />
          {labels.urgentTitle}
        </p>
        <p className="mt-3 whitespace-pre-line text-2xl font-semibold leading-relaxed text-slate-900">{message.content}</p>
      </div>
    )
  }

  // A fixed clarifying question about a possibly serious symptom, with two
  // ready answers (the patient can also type).
  if (message.clarify && CLARIFY_ANSWERS[lang][message.clarify]) {
    const answers = CLARIFY_ANSWERS[lang][message.clarify]
    return (
      <div dir={dir} className="rounded-3xl border-2 border-amber-400 bg-amber-50 p-5 shadow-xs">
        <p className="flex items-center gap-2 text-xl font-bold text-amber-900">
          <AlertCircle size={28} className="shrink-0" />
          {labels.clarifyTitle}
        </p>
        <p className="mt-2 whitespace-pre-line text-xl font-semibold leading-relaxed text-slate-900">{message.content}</p>
        {onAnswer && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => onAnswer(answers.yes)}
              className="min-h-[64px] rounded-2xl border-2 border-slate-400 bg-white px-4 text-xl font-bold text-slate-900 hover:bg-sand-100 active:scale-[0.98]"
            >
              {answers.yes}
            </button>
            <button
              onClick={() => onAnswer(answers.no)}
              className="min-h-[64px] rounded-2xl border-2 border-slate-400 bg-white px-4 text-xl font-bold text-slate-900 hover:bg-sand-100 active:scale-[0.98]"
            >
              {answers.no}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <div dir={dir} className="max-w-[92%] rounded-3xl rounded-tl-md border border-sand-200 bg-white px-5 py-4 shadow-xs">
        <p dir="auto" className="whitespace-pre-line text-xl leading-relaxed text-slate-900">{message.content}</p>
        {message.contactDoctor && (
          <p className="mt-3 flex items-start gap-2 border-t border-sand-200 pt-3 text-lg font-semibold text-sage-800">
            <Phone size={22} className="mt-0.5 shrink-0" />
            <span>{labels.contactDoctor}</span>
          </p>
        )}
      </div>
    </div>
  )
}
