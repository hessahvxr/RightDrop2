import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Droplet,
  Eye,
  CheckCircle2,
  Clock,
  Bell,
  BellOff,
  AlertCircle,
  X,
  RefreshCw,
  MessageCircle,
  Camera,
  CalendarDays,
  ChevronLeft,
  FileText,
} from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import MedicationImage from '../../components/MedicationImage'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { loadDeferred, saveDeferred } from '../../lib/deferredDoses'
import { useNotifications } from '../../hooks/useNotifications'
import {
  toDateKey,
  formatTimeLabel,
  formatDurationAr,
  dosesForDay,
  indexRecords,
  getDoseStatus,
  canConfirm,
  pickNextDose,
  minutesUntil,
  summarizeDay,
  LATE_DOSE_TEXT,
  lateCountLabel,
  buildLatePrompts,
  deferredKeysFor,
  addDeferredKey,
} from '../../core'

const DOSE_STATUS = {
  upcoming: { label: 'قادمة', color: 'bg-sand-100 text-slate-700 border-sand-200', dot: 'bg-slate-400' },
  due: { label: 'حان الوقت الآن', color: 'bg-amber-100 text-amber-900 border-amber-300 font-bold', dot: 'bg-amber-500' },
  late: { label: 'متأخرة', color: 'bg-orange-100 text-orange-900 border-orange-300 font-bold', dot: 'bg-orange-500' },
  taken: { label: 'تم أخذها', color: 'bg-sage-100 text-sage-800 border-sage-200', dot: 'bg-sage-600' },
  taken_late: { label: 'أُخذت متأخرة', color: 'bg-sage-100 text-sage-800 border-sage-200', dot: 'bg-sage-600' },
  missed: { label: 'فائتة', color: 'bg-rose-100 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
}

// Timestamp -> '8:05 ص', in the same style as the schedule times.
function clockLabel(isoString) {
  const d = new Date(isoString)
  return formatTimeLabel(`${d.getHours()}:${d.getMinutes()}`)
}

function medicationTitle(dose) {
  return dose.concentration ? `${dose.medication_name} ${dose.concentration}` : dose.medication_name
}

export default function PatientToday() {
  const { user } = useAuth()
  const [prescriptions, setPrescriptions] = useState([])
  const [records, setRecords] = useState({})
  const [loadedDay, setLoadedDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [now, setNow] = useState(() => new Date())
  // "لا، ما أخذتها" answers for today, remembered on this device only.
  const [deferred, setDeferred] = useState(null)
  // Doses with a save in progress: blocks a second tap before React re-renders.
  const savingRef = useRef(new Set())
  const {
    permission,
    requestPermission,
    checkDueDoses,
    inAppReminder,
    dismissInAppReminder,
  } = useNotifications()

  // Load the prescriptions (with the doctor's dose times) and the records
  // already saved for today. Dose statuses are then worked out from the
  // current local date and time.
  const loadDoses = useCallback(async ({ silent = false } = {}) => {
    if (!user) return
    if (!silent) setLoading(true)
    const today = toDateKey()

    const [rxRes, recRes] = await Promise.all([
      supabase
        .from('prescriptions')
        .select(`
          id, medication_name, concentration, dosage, eye, frequency_per_day,
          start_date, end_date, status, created_at,
          dose_times:prescription_dose_times ( id, dose_time, sort_order, created_at )
        `)
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('dose_records')
        .select('id, prescription_id, dose_time, scheduled_date, status, taken_at')
        .eq('patient_id', user.id)
        .eq('scheduled_date', today),
    ])

    if (rxRes.error || recRes.error || !rxRes.data) {
      // Never show "no medications today" when the truth is "could not load".
      // On a background refresh keep what is already on screen.
      if (!silent) setLoadError(true)
      setLoading(false)
      return
    }

    setPrescriptions(rxRes.data)
    setRecords(indexRecords(recRes.data))
    setLoadedDay(today)
    setDeferred(loadDeferred(user.id))
    setNow(new Date())
    setLoadError(false)
    setLoading(false)
  }, [user])

  // 1) When the screen opens.
  useEffect(() => {
    loadDoses()
  }, [loadDoses])

  // 2) Keep the clock fresh every 30 seconds (a dose turns late on its own).
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  // 3) When the patient returns to the app: tab or app back in the foreground,
  //    page restored from the back/forward cache, or the connection comes back.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      setNow(new Date())
      loadDoses({ silent: true })
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [loadDoses])

  // 4) When the calendar day changes while the screen is open.
  useEffect(() => {
    if (loadedDay && loadedDay !== toDateKey(now)) loadDoses({ silent: true })
  }, [now, loadedDay, loadDoses])

  const doses = useMemo(
    () => (loadedDay ? dosesForDay(prescriptions, records, loadedDay) : []),
    [prescriptions, records, loadedDay]
  )

  // Fire a reminder for doses that are due and not yet recorded.
  useEffect(() => {
    const dueDoses = doses
      .filter((d) => getDoseStatus(d, records[d.key], now) === 'due')
      .map((d) => ({ ...d, medicationName: medicationTitle(d), dedupKey: d.key }))
    if (dueDoses.length > 0) checkDueDoses(dueDoses)
  }, [doses, records, now, checkDueDoses])

  // Save "taken" with the actual confirmation time. One record per dose:
  // guarded here against double taps, and by the database's unique rule.
  const handleTakeDose = async (dose) => {
    if (records[dose.key] || savingRef.current.has(dose.key)) return
    savingRef.current.add(dose.key)
    setActionLoading(dose.key)
    setActionError(null)
    const { data, error } = await supabase
      .from('dose_records')
      .insert({
        prescription_id: dose.prescription_id,
        patient_id: user.id,
        dose_time: dose.dose_time,
        scheduled_date: dose.scheduled_date,
        status: 'taken',
        taken_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (!error && data) {
      setRecords((prev) => ({ ...prev, [dose.key]: data }))
    } else if (error?.code === '23505') {
      // Already recorded (e.g. from another device): just show the saved state.
      await loadDoses({ silent: true })
    } else {
      setActionError('لم يتم تسجيل القطرة. تأكد من اتصال الإنترنت ثم اضغط مرة أخرى.')
    }
    savingRef.current.delete(dose.key)
    setActionLoading(null)
  }

  // "لا، ما أخذتها": nothing is saved to the database. The dose stays
  // unconfirmed and can still be recorded later today.
  const handleNotTaken = (dose) => {
    const next = addDeferredKey(deferred, toDateKey(now), dose.key)
    setDeferred(next)
    saveDeferred(user.id, next)
  }

  const summary = summarizeDay(doses, records, now)
  const latePrompts = buildLatePrompts(doses, records, now, deferredKeysFor(deferred, toDateKey(now)))
  const next = pickNextDose(doses, records, now, { includeLate: false })
  const showNotifPrompt = permission === 'default'
  const notifDenied = permission === 'denied'
  const notifUnsupported = permission === 'unsupported'

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center py-20 text-slate-400">
        <Spinner size={40} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-3xl border-2 border-rose-200 bg-rose-50/80 p-6 text-center shadow-sm">
        <AlertCircle size={48} className="mx-auto text-rose-600" />
        <h1 className="mt-3 text-2xl font-bold text-slate-900">تعذّر تحميل أدوية اليوم</h1>
        <p className="mt-2 text-lg text-slate-700">تأكد من اتصال الإنترنت ثم اضغط على الزر أدناه للمحاولة مجدداً.</p>
        <button
          onClick={() => loadDoses()}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-sage-600 py-4 text-xl font-bold text-white transition-all hover:bg-sage-700 active:scale-[0.98]"
        >
          <RefreshCw size={24} />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 4 PRIMARY OPTIONS HUB - Clearly presenting the 4 core pillars */}
      <section aria-label="الخيارات الرئيسية الأربعة" className="space-y-3">
        <h2 className="text-xl font-bold text-slate-800 px-1">الخدمات الرئيسية</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* 1. موعد القطرة (Eye Drop Reminders) */}
          <a
            href="#reminder-section"
            className="flex flex-col justify-between rounded-3xl border-2 border-sage-200 bg-sage-50/90 p-4 transition-all hover:border-sage-400 hover:shadow-sm active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-600 text-white shadow-xs">
                <Droplet size={26} strokeWidth={2.5} />
              </span>
              <span className="rounded-full bg-sage-200/70 px-2.5 py-1 text-xs font-bold text-sage-800">
                {summary.total > 0 ? `${summary.takenTotal}/${summary.total}` : 'اليوم'}
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">موعد القطرة</h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">التذكير والجرعات</p>
            </div>
          </a>

          {/* 2. المساعد الذكي (AI Assistant) */}
          <Link
            to="/patient/assistant"
            className="flex flex-col justify-between rounded-3xl border-2 border-lavender-200 bg-lavender-50/90 p-4 transition-all hover:border-lavender-400 hover:shadow-sm active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-600 text-white shadow-xs">
                <MessageCircle size={26} strokeWidth={2.5} />
              </span>
              <span className="rounded-full bg-lavender-200/70 px-2.5 py-1 text-xs font-bold text-lavender-800">
                ذكاء اصطناعي
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">المساعد الذكي</h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">استفسارات العين</p>
            </div>
          </Link>

          {/* 3. تصوير الدواء (Medication Camera) */}
          <Link
            to="/patient/scan"
            className="flex flex-col justify-between rounded-3xl border-2 border-mutedblue-200 bg-mutedblue-50/90 p-4 transition-all hover:border-mutedblue-400 hover:shadow-sm active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mutedblue-600 text-white shadow-xs">
                <Camera size={26} strokeWidth={2.5} />
              </span>
              <span className="rounded-full bg-mutedblue-200/70 px-2.5 py-1 text-xs font-bold text-mutedblue-800">
                كاميرا
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">تصوير الدواء</h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">فحص العبوة</p>
            </div>
          </Link>

          {/* 4. جدول الجرعات (Medication Schedule) */}
          <Link
            to="/patient/schedule"
            className="flex flex-col justify-between rounded-3xl border-2 border-sand-300 bg-sand-100/90 p-4 transition-all hover:border-sand-400 hover:shadow-sm active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand-600 text-white shadow-xs">
                <CalendarDays size={26} strokeWidth={2.5} />
              </span>
              <span className="rounded-full bg-sand-200 px-2.5 py-1 text-xs font-bold text-sand-800">
                أسبوعي
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">جدول الجرعات</h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">المواعيد والسجل</p>
            </div>
          </Link>
        </div>
      </section>

      {/* Action error banner */}
      {actionError && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 text-lg font-medium text-rose-800">
          <AlertCircle size={26} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* In-app reminder banner */}
      {inAppReminder && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <Bell size={24} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-amber-950">{inAppReminder.title}</p>
            <p className="text-base text-amber-900">{inAppReminder.body}</p>
          </div>
          <button
            onClick={dismissInAppReminder}
            aria-label="إغلاق التذكير"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-amber-800 hover:bg-amber-100"
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Late doses: asked about before the next dose. */}
      {latePrompts.length > 0 && (
        <section aria-label={lateCountLabel(latePrompts.length)}>
          {latePrompts.length > 1 && (
            <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold text-orange-900">
              <AlertCircle size={28} />
              {`لديك ${lateCountLabel(latePrompts.length)}`}
            </h2>
          )}
          <div className="space-y-4">
            {latePrompts.map(({ dose, deferred: answeredNo }, index) => (
              <LateDoseCard
                key={dose.key}
                dose={dose}
                answeredNo={answeredNo}
                position={latePrompts.length > 1 ? `${index + 1} من ${latePrompts.length}` : null}
                compact={latePrompts.length > 1}
                busy={actionLoading === dose.key}
                disabled={!!actionLoading}
                onYes={handleTakeDose}
                onNo={handleNotTaken}
              />
            ))}
          </div>
          {latePrompts.length > 1 && (
            <p className="mt-4 text-center text-lg font-semibold text-slate-800">{LATE_DOSE_TEXT.unsure}</p>
          )}
        </section>
      )}

      {/* PRIMARY ACTIVE DOSE CARD - Eye Drop Reminders Focus */}
      <div id="reminder-section">
        {summary.total === 0 ? (
          <div className="rounded-3xl border border-sand-200 bg-white p-6 shadow-sm">
            <EmptyState
              icon={Clock}
              title="لا توجد قطرات مقررة لليوم"
              subtitle="ستظهر قطرات العين ومواعيدها هنا فور تسجيل وصفتك الطبية من قبل طبيبك."
            />
          </div>
        ) : (
          <NextDoseCard
            next={next}
            summary={summary}
            now={now}
            hasLate={latePrompts.length > 0}
            canConfirmNext={next ? canConfirm(next.dose, records[next.dose.key], now) : false}
            busy={next ? actionLoading === next.dose.key : false}
            disabled={!!actionLoading}
            onTake={handleTakeDose}
          />
        )}
      </div>

      {/* Daily Progress Bar */}
      {summary.total > 0 && (
        <div className="rounded-3xl border border-sand-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-lg font-bold text-slate-800">
            <span>إنجاز قطرات اليوم</span>
            <span className="text-sage-700">{summary.takenTotal} من {summary.total}</span>
          </div>
          <div className="mt-3 h-4 overflow-hidden rounded-full bg-sand-200" aria-hidden="true">
            <div
              className="h-full rounded-full bg-sage-600 transition-all duration-500"
              style={{ width: `${(summary.takenTotal / summary.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Full Today List */}
      {doses.length > 0 && (
        <section aria-label="قائمة جرعات اليوم" className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold text-slate-800">جدول مواعيد اليوم</h2>
            <Link to="/patient/schedule" className="text-sm font-bold text-sage-700 hover:text-sage-800">
              عرض الجدول الكامل
            </Link>
          </div>

          <div className="space-y-3">
            {doses.map((dose) => {
              const record = records[dose.key]
              const status = getDoseStatus(dose, record, now)
              const config = DOSE_STATUS[status]
              const isNext = next?.dose.key === dose.key
              // Late doses are answered in the section at the top; the next due
              // dose has its big button above. Any other due dose is confirmed here.
              const showButton = status === 'due' && !isNext

              return (
                <div
                  key={dose.key}
                  className={`rounded-3xl border-2 bg-white p-4 transition-all shadow-xs ${
                    status === 'due' || status === 'late'
                      ? 'border-amber-300 bg-amber-50/30'
                      : 'border-sand-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Visual Medication Drop Image */}
                    <MedicationImage
                      medicationName={dose.medication_name}
                      concentration={dose.concentration}
                      size="sm"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-lg font-bold text-slate-900 truncate">
                          {medicationTitle(dose)}
                        </p>
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${config.color}`}>
                          {config.label}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                        <span className="flex items-center gap-1 font-semibold text-slate-800">
                          <Clock size={16} className="text-sage-600" />
                          {dose.timeLabel}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye size={16} />
                          {dose.eyeLabel}
                        </span>
                        <span className="flex items-center gap-1">
                          <Droplet size={16} />
                          {dose.dosage}
                        </span>
                      </div>
                    </div>
                  </div>

                  {record?.status === 'taken' && record.taken_at && (
                    <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-sage-50 px-3 py-1.5 text-sm font-semibold text-sage-800">
                      <CheckCircle2 size={18} className="text-sage-600 shrink-0" />
                      <span>تم أخذها الساعة {clockLabel(record.taken_at)}</span>
                    </div>
                  )}

                  {showButton && (
                    <button
                      onClick={() => handleTakeDose(dose)}
                      disabled={!!actionLoading}
                      className="mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-sage-600 py-3 text-lg font-bold text-white transition-colors hover:bg-sage-700 active:scale-[0.98] disabled:opacity-60"
                    >
                      {actionLoading === dose.key ? <Spinner size={22} /> : <CheckCircle2 size={24} />}
                      <span>أخذت القطرة الآن</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* The way into "وصفاتي". The page is no longer in the bottom bar, so it is linked from here,
          below the doses so that it never pushes a dose question further down the screen. */}
      <Link
        to="/patient/prescriptions"
        className="flex min-h-[72px] items-center gap-3 rounded-3xl border-2 border-sand-300 bg-white p-4 transition-all hover:border-sand-400 hover:shadow-sm active:scale-[0.98]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sage-600 text-white">
          <FileText size={26} strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg sm:text-xl font-bold text-slate-900">وصفاتي</span>
          <span className="block text-xs sm:text-sm text-slate-600 mt-0.5">تعليمات الطبيب وتواريخ الوصفة</span>
        </span>
        <ChevronLeft size={26} className="shrink-0 text-slate-500" aria-hidden="true" />
      </Link>

      {/* Notification permission prompt */}
      {showNotifPrompt && (
        <div className="rounded-3xl border-2 border-sage-200 bg-sage-50/80 p-5">
          <div className="flex items-start gap-3">
            <Bell size={28} className="mt-1 shrink-0 text-sage-700" />
            <div>
              <p className="text-lg font-bold text-sage-900">تفعيل التذكيرات لمواعيد القطرات</p>
              <p className="mt-1 text-sm text-sage-800 leading-relaxed">
                يرسل لك التطبيق تنبيهاً لطيفاً في الوقت المحدد حتى لا تفوتك قطرة العين.
              </p>
            </div>
          </div>
          <button
            onClick={requestPermission}
            className="mt-4 w-full rounded-2xl bg-sage-700 py-3.5 text-lg font-bold text-white transition-colors hover:bg-sage-800 active:scale-[0.98]"
          >
            تفعيل التذكيرات
          </button>
        </div>
      )}

      {/* Notification status info */}
      {(notifDenied || notifUnsupported) && (
        <div className="flex items-center gap-2 rounded-2xl bg-sand-100 px-4 py-3 text-sm text-slate-700">
          <BellOff size={18} className="shrink-0 text-slate-500" />
          <span>
            {notifUnsupported
              ? 'المتصفح لا يدعم الإشعارات. ستظهر التذكيرات داخل التطبيق فقط.'
              : 'تم رفض إشعارات المتصفح. ستظهر التذكيرات داخل التطبيق فقط.'}
          </span>
        </div>
      )}
    </div>
  )
}

// The next dose that is on time: due now (one big button), coming up later
// today, or the "all done" message. Late doses are handled by LateDoseCard.
function NextDoseCard({ next, summary, now, hasLate, canConfirmNext, busy, disabled, onTake }) {
  if (!next) {
    // With late doses still open the day is not finished: say nothing here.
    if (hasLate) return null
    const allTaken = summary.takenTotal === summary.total
    return (
      <section className="rounded-3xl border-2 border-sage-200 bg-sage-50/80 p-7 text-center shadow-sm">
        <CheckCircle2 size={64} className="mx-auto text-sage-600" strokeWidth={2.2} />
        <h1 className="mt-4 text-3xl font-bold text-slate-900">
          {allTaken ? 'أكملت جميع قطرات اليوم' : 'انتهت مواعيد قطرات اليوم'}
        </h1>
        <p className="mt-2 text-xl font-medium text-slate-700">
          سجلت {summary.takenTotal} من {summary.total} قطرة بنجاح
        </p>
      </section>
    )
  }

  const { dose, status } = next
  const isNow = status === 'due'
  const tone = isNow
    ? 'border-amber-300 bg-amber-50/50 shadow-md'
    : 'border-sand-200 bg-white shadow-sm'
  const heading = isNow ? 'حان وقت القطرة الآن' : 'القطرة القادمة'

  return (
    <section className={`rounded-3xl p-6 border-2 transition-all ${tone}`} aria-live="polite">
      {/* Header status */}
      <div className="flex items-center justify-between gap-2 border-b border-sand-200/80 pb-3">
        <p className="flex items-center gap-2 text-lg sm:text-xl font-bold text-slate-800">
          <Clock size={22} className={isNow ? 'text-amber-600' : 'text-sage-600'} />
          <span>{heading}</span>
        </p>
        {!isNow && (
          <span className="rounded-full bg-sand-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {formatDurationAr(minutesUntil(dose, now))}
          </span>
        )}
      </div>

      {/* Medication visual and name side-by-side */}
      <div className="mt-4 flex items-center gap-4">
        <MedicationImage
          medicationName={dose.medication_name}
          concentration={dose.concentration}
          size="lg"
        />

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-slate-900">
            {dose.medication_name}
          </h1>
          {dose.concentration && (
            <p className="text-xl font-semibold text-slate-600 mt-0.5" dir="ltr" style={{ textAlign: 'right' }}>
              {dose.concentration}
            </p>
          )}

          <div className="mt-3 space-y-1.5 text-base sm:text-lg font-semibold text-slate-800">
            <p className="flex items-center gap-2">
              <Clock size={20} className="text-slate-500 shrink-0" />
              <span>الموعد: {dose.timeLabel}</span>
            </p>
            <p className="flex items-center gap-2">
              <Eye size={20} className="text-slate-500 shrink-0" />
              <span>{dose.eyeLabel}</span>
            </p>
            <p className="flex items-center gap-2">
              <Droplet size={20} className="text-slate-500 shrink-0" />
              <span>{dose.dosage}</span>
            </p>
          </div>
        </div>
      </div>

      {/* THE REDESIGNED TAKEN BUTTON - Large, high-contrast, comfortable touch target */}
      {canConfirmNext && (
        <div className="mt-6 pt-2">
          <button
            onClick={() => onTake(dose)}
            disabled={disabled}
            className={`flex min-h-[68px] sm:min-h-[74px] w-full items-center justify-center gap-3 rounded-2xl px-4 text-2xl font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-60 ${
              isNow
                ? 'bg-sage-600 text-white hover:bg-sage-700 ring-4 ring-sage-200/60'
                : 'border-2 border-sage-600 bg-white text-sage-800 hover:bg-sage-50'
            }`}
          >
            {busy ? (
              <Spinner size={32} />
            ) : (
              <CheckCircle2 size={34} strokeWidth={2.4} />
            )}
            <span>{isNow ? 'أخذت القطرة الآن' : 'أخذت القطرة مبكراً'}</span>
          </button>
        </div>
      )}
    </section>
  )
}

// One late, unconfirmed dose. Before an answer it asks "هل أخذت القطرة؟" with
// two large buttons. After "لا، ما أخذتها" it becomes a quiet card that still
// lets the patient record the dose later the same day.
// It only ever asks and records: it never says to take, skip or double a dose.
// `compact` is set when several late doses are listed at once.
function LateDoseCard({ dose, answeredNo, position, compact, busy, disabled, onYes, onNo }) {
  if (answeredNo) {
    return (
      <article className="rounded-3xl border-2 border-sand-300 bg-white p-5 shadow-xs">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-bold text-slate-800">
          <Clock size={22} className="shrink-0 text-slate-500" />
          <span>{dose.timeLabel}</span>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-800">
            {LATE_DOSE_TEXT.notRecorded}
          </span>
        </p>

        <div className="mt-3 flex items-center gap-3">
          <MedicationImage
            medicationName={dose.medication_name}
            concentration={dose.concentration}
            size="sm"
          />
          <div>
            <h3 className="text-xl font-bold text-slate-900">{medicationTitle(dose)}</h3>
            <p className="text-base font-semibold text-slate-600">{dose.eyeLabel} — {dose.dosage}</p>
          </div>
        </div>

        <p className="mt-3 text-base text-slate-700">{LATE_DOSE_TEXT.recordLater}</p>
        <button
          onClick={() => onYes(dose)}
          disabled={disabled}
          className="mt-3 flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-sage-600 bg-white py-3 text-xl font-bold text-sage-800 transition-colors hover:bg-sage-50 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Spinner size={24} /> : <CheckCircle2 size={26} />}
          <span>{LATE_DOSE_TEXT.recordNow}</span>
        </button>
        {!compact && <p className="mt-3 text-base font-semibold text-slate-700">{LATE_DOSE_TEXT.unsure}</p>}
      </article>
    )
  }

  return (
    <article
      className="rounded-3xl border-2 border-orange-400 bg-orange-50/70 p-5 shadow-sm"
      role="group"
      aria-label={`${LATE_DOSE_TEXT.title}: ${dose.medication_name} ${dose.timeLabel}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-orange-200 pb-3">
        <p className="flex items-center gap-2 text-xl font-bold text-orange-900">
          <AlertCircle size={26} className="shrink-0" />
          <span>{LATE_DOSE_TEXT.title}</span>
        </p>
        {position && (
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-orange-900 shadow-2xs">
            {position}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <MedicationImage
          medicationName={dose.medication_name}
          concentration={dose.concentration}
          size="md"
        />
        <div>
          <p className="text-base font-semibold text-slate-600">
            {LATE_DOSE_TEXT.scheduledAt} {dose.timeLabel}
          </p>
          <h3 className="text-2xl font-bold text-slate-900 leading-tight">
            {medicationTitle(dose)}
          </h3>
          <p className="text-base font-semibold text-slate-700 mt-1">
            {dose.eyeLabel} — {dose.dosage}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xl font-bold text-slate-900">{LATE_DOSE_TEXT.question}</p>
      
      {/* Visual, large touch buttons for Yes / No */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          onClick={() => onYes(dose)}
          disabled={disabled}
          className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-sage-600 px-3 text-xl font-bold text-white shadow-sm transition-colors hover:bg-sage-700 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Spinner size={24} /> : <CheckCircle2 size={24} />}
          <span>{LATE_DOSE_TEXT.yes}</span>
        </button>
        <button
          onClick={() => onNo(dose)}
          disabled={disabled}
          className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border-2 border-slate-400 bg-white px-3 text-xl font-bold text-slate-800 transition-colors hover:bg-sand-100 active:scale-[0.98] disabled:opacity-60"
        >
          <X size={24} />
          <span>{LATE_DOSE_TEXT.no}</span>
        </button>
      </div>
      {!compact && <p className="mt-4 text-base font-semibold text-slate-800">{LATE_DOSE_TEXT.unsure}</p>}
    </article>
  )
}
