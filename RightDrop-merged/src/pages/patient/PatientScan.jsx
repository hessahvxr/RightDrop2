import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Camera,
  Upload,
  X,
  RefreshCw,
  ScanLine,
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
  Phone,
  ArrowRight,
} from 'lucide-react'
import Spinner from '../../components/Spinner'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { EYE_LABELS } from '../../lib/prescriptionHelpers'
import { cleanConfigValue } from '../../core/config.js'

const SCAN_FUNCTION_URL = `${cleanConfigValue(import.meta.env.VITE_SUPABASE_URL)}/functions/v1/scan-medication`
// The project's public key, sent in the `apikey` header as the Supabase client does. Not a secret.
const PUBLIC_KEY = cleanConfigValue(import.meta.env.VITE_SUPABASE_ANON_KEY)

export default function PatientScan() {
  const { user, session } = useAuth()
  const [state, setState] = useState('idle')
  const [imageData, setImageData] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [consentGiven, setConsentGiven] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const handleFileSelected = useCallback((file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('الرجاء اختيار صورة فقط.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setImageData(e.target?.result)
      setState('preview')
      setError(null)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelected(file)
  }

  const handleUploadSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelected(file)
  }

  const handleRetake = () => {
    setImageData(null)
    setState('idle')
    setResult(null)
    setError(null)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAnalyze = async () => {
    if (!imageData || !user || !session) return
    setState('analyzing')
    setError(null)

    try {
      const base64 = imageData.split(',')[1]
      const byteChars = atob(base64)
      const byteNumbers = new Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const file = new Blob([byteArray], { type: 'image/jpeg' })

      const fileName = `${user.id}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('medication-scans')
        .upload(fileName, file, { contentType: 'image/jpeg' })

      if (uploadError) {
        setError('تعذّر رفع الصورة. حاول مرة أخرى.')
        setState('preview')
        return
      }

      const response = await fetch(SCAN_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          ...(PUBLIC_KEY ? { apikey: PUBLIC_KEY } : {}),
        },
        body: JSON.stringify({
          imagePath: fileName,
          patientId: user.id,
        }),
      })

      const data = await response.json()

      await supabase.storage.from('medication-scans').remove([fileName])

      if (!response.ok) {
        if (data.error === 'ai_not_configured') {
          setError(data.message || 'خدمة التعرف على الأدوية غير مفعّلة.')
        } else if (data.error === 'ai_service_error') {
          setError(data.message || 'تعذّر الاتصال بخدمة التعرف.')
        } else {
          setError(data.message || 'حدث خطأ أثناء التحليل. حاول مرة أخرى.')
        }
        setState('preview')
        return
      }

      setResult(data)
      setState('result')
    } catch {
      setError('حدث خطأ غير متوقع. حاول مرة أخرى.')
      setState('preview')
    }
  }

  if (state === 'idle') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/patient"
            className="inline-flex items-center gap-2 rounded-2xl border border-sand-300 bg-white px-3.5 py-2 text-base font-bold text-slate-800 hover:bg-sand-100 transition-colors"
          >
            <ArrowRight size={20} />
            <span>العودة لليوم</span>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">تصوير عبوة الدواء</h1>
          <p className="mt-1 text-base text-slate-600">
            صوّر علبة أو زجاجة قطرة العين للتحقق من تطابقها مع وصفتك الطبية المعتمدة
          </p>
        </div>

        {/* Privacy and consent: the photo is only taken after the patient agrees (as in the original). */}
        <div className="rounded-3xl border border-sand-200 bg-sand-100/70 p-5">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck size={22} className="text-sage-700 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">خصوصية وأمان صورتك</h2>
          </div>
          <p className="text-base leading-relaxed text-slate-700">
            سيتم استخدام صورتك مؤقتاً للتعرف على الدواء ومقارنته بوصفتك فقط.
            لا يتم تخزين الصورة بشكل دائم — تُحذف فور انتهاء التحليل.
            لا تُشارك الصورة مع أي مستخدم آخر.
          </p>
          <label className="mt-4 flex min-h-[64px] cursor-pointer items-center gap-3.5 rounded-2xl border-2 border-sage-300 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="h-8 w-8 shrink-0 rounded-lg border-2 border-sage-400 accent-sage-600 focus:ring-2 focus:ring-sage-200"
            />
            <span className="text-lg font-bold text-slate-900">
              أوافق على استخدام الصورة لهذا الغرض
            </span>
          </label>
        </div>

        {/* PROMINENT LARGE CAMERA TRIGGER BUTTON */}
        <div className={`space-y-4 pt-2 ${!consentGiven ? 'opacity-50 pointer-events-none' : ''}`}>
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={!consentGiven}
            className="flex min-h-[76px] w-full items-center justify-center gap-3.5 rounded-3xl bg-sage-600 p-5 text-2xl font-bold text-white shadow-md transition-all hover:bg-sage-700 active:scale-[0.98] disabled:opacity-50"
          >
            <Camera size={36} strokeWidth={2.4} />
            <span>التقاط صورة بالكاميرا</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!consentGiven}
            className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-sand-300 bg-white p-4 text-xl font-bold text-slate-800 transition-all hover:bg-sand-50 active:scale-[0.98] disabled:opacity-50"
          >
            <Upload size={28} />
            <span>اختيار صورة من المعرض</span>
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraCapture}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUploadSelect}
          className="hidden"
        />

        {/* Helpful Tips */}
        <div className="rounded-3xl border border-sand-200 bg-white p-5 shadow-xs">
          <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
            <ScanLine size={20} className="text-sage-600" />
            نصائح لصورة واضحة:
          </h3>
          <ul className="space-y-2.5 text-base text-slate-700">
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-sage-500" />
              صوّر العلبة في مكان ذي إضاءة جيدة
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-sage-500" />
              اجعل اسم الدواء والتركيز واضحين في منتصف الصورة
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-sage-500" />
              اقترب من العبوة حتى تظهر الكتابة بوضوح
            </li>
          </ul>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-base font-semibold text-rose-700">
            <AlertCircle size={22} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    )
  }

  if (state === 'preview') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">مراجعة الصورة</h1>
          <p className="mt-1 text-base text-slate-600">تأكد من وضوح اسم الدواء المطبوع على العلبة</p>
        </div>

        <div className="overflow-hidden rounded-3xl border-2 border-sand-300 bg-white p-2 shadow-sm">
          <img
            src={imageData || ''}
            alt="صورة الدواء الملتقطة"
            className="mx-auto max-h-96 w-full rounded-2xl object-contain"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-base font-semibold text-rose-700">
            <AlertCircle size={22} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <button
            onClick={handleAnalyze}
            className="flex min-h-[68px] w-full items-center justify-center gap-3 rounded-2xl bg-sage-600 py-4 text-2xl font-bold text-white shadow-md transition-all hover:bg-sage-700 active:scale-[0.98]"
          >
            <ScanLine size={30} />
            <span>فحص ومطابقة الدواء الآن</span>
          </button>
          <button
            onClick={handleRetake}
            className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-sand-300 bg-white py-3 text-lg font-bold text-slate-800 transition-colors hover:bg-sand-50"
          >
            <RefreshCw size={20} />
            <span>إعادة التقاط الصورة</span>
          </button>
          <button
            onClick={handleRetake}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl py-3 text-lg font-bold text-slate-600 transition-colors hover:bg-sand-100"
          >
            <X size={20} />
            <span>إلغاء</span>
          </button>
        </div>
      </div>
    )
  }

  if (state === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Spinner size={52} />
        <p className="mt-6 text-2xl font-bold text-slate-900">جارٍ قراءة وفحص الدواء...</p>
        <p className="mt-2 text-lg text-slate-600">نطابق اسم العبوة مع وصفاتك الطبية المسجلة</p>
      </div>
    )
  }

  if (state === 'result' && result) {
    const { matchResult, recognized, matchedPrescription } = result

    const resultConfig = {
      match: {
        icon: CheckCircle2,
        color: 'text-sage-700',
        bg: 'bg-sage-50 border-sage-300',
        title: 'تطابق مع وصفتك الطبية',
        explanation: matchedPrescription
          ? `الدواء المُصوّر يطابق وصفتك: ${matchedPrescription.medication_name}. استخدم الدواء حسب تعليمات طبيبك.`
          : 'يبدو أن الدواء يطابق إحدى وصفاتك.',
      },
      mismatch: {
        icon: XCircle,
        color: 'text-rose-700',
        bg: 'bg-rose-50 border-rose-300',
        title: 'لا يوجد تطابق مع الوصفة',
        explanation:
          'الدواء المُصوّر لا يطابق وصفاتك النشطة. لا تستخدم هذا الدواء قبل مراجعة طبيبك أو الصيدلي.',
      },
      unable_to_identify: {
        icon: HelpCircle,
        color: 'text-amber-800',
        bg: 'bg-amber-50 border-amber-300',
        title: 'تعذّر التعرف على الدواء',
        explanation:
          'لم يتمكن النظام من التعرف على الدواء من الصورة. الرجاء التقاط صورة أوضح أو راجع طبيبك أو الصيدلي.',
      },
    }

    const cfg = resultConfig[matchResult] || resultConfig.unable_to_identify
    const Icon = cfg.icon

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">نتيجة الفحص</h1>
        </div>

        {/* Primary Outcome Card */}
        <div className={`rounded-3xl border-2 p-6 shadow-sm ${cfg.bg}`}>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xs">
              <Icon size={32} className={cfg.color} strokeWidth={2.4} />
            </div>
            <h2 className={`text-2xl font-bold ${cfg.color}`}>{cfg.title}</h2>
          </div>
          <p className="text-lg leading-relaxed text-slate-800">{cfg.explanation}</p>
        </div>

        {/* Photographed Medication Details */}
        <div className="rounded-3xl border border-sand-200 bg-white p-5 shadow-xs">
          <h3 className="mb-3 text-lg font-bold text-slate-800">بيانات الدواء في الصورة:</h3>
          <div className="space-y-3">
            <DetailRow label="اسم الدواء" value={recognized?.medication_name} />
            <DetailRow label="التركيز" value={recognized?.concentration} />
            <DetailRow label="المادة الفعالة" value={recognized?.active_ingredient} />
            <DetailRow label="الاسم التجاري" value={recognized?.brand_name} />
          </div>
        </div>

        {/* Prescribed Medication Match */}
        {matchedPrescription && (
          <div className="rounded-3xl border-2 border-sage-200 bg-sage-50/70 p-5 shadow-xs">
            <h3 className="mb-3 text-lg font-bold text-sage-900">الدواء الموصوف لك في ملفك:</h3>
            <div className="space-y-3">
              <DetailRow label="اسم الدواء" value={matchedPrescription.medication_name} />
              <DetailRow label="التركيز" value={matchedPrescription.concentration} />
              <DetailRow label="الجرعة" value={matchedPrescription.dosage} />
              <DetailRow label="العين" value={EYE_LABELS[matchedPrescription.eye]} />
            </div>
          </div>
        )}

        {matchResult !== 'match' && (
          <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle size={26} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <p className="text-lg font-bold text-amber-900">تنبيه طبي</p>
                <p className="mt-1 text-base leading-relaxed text-amber-900">
                  لا تستخدم أي دواء إلا بعد التأكد من أنه موصوف لك من طبيبك.
                  راجع طبيبك أو الصيدلي إذا كان لديك أي شك.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <button
            onClick={handleRetake}
            className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-sage-600 py-3.5 text-xl font-bold text-white shadow-md transition-colors hover:bg-sage-700 active:scale-[0.98]"
          >
            <RefreshCw size={22} />
            <span>تصوير دواء آخر</span>
          </button>

          {matchResult !== 'match' && (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-sand-100 py-4 text-base font-semibold text-slate-700">
              <Phone size={20} className="shrink-0 text-slate-500" />
              <span>إذا كان لديك أي سؤال، راجع طبيبك أو الصيدلي.</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-sand-100 pb-2 text-base">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-bold text-slate-900">{value || 'غير متوفر'}</span>
    </div>
  )
}
