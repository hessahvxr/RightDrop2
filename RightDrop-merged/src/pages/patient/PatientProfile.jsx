import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Mail, Phone, Save, CheckCircle2, LogOut, Copy, Check, Hash, ArrowRight } from 'lucide-react'
import FormField from '../../components/FormField'
import Spinner from '../../components/Spinner'
import { useAuth } from '../../context/AuthContext'

export default function PatientProfile() {
  const { profile, updateProfile, signOut, refreshUser } = useAuth()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setPhone(profile.phone || '')
      setLoading(false)
    }
  }, [profile])

  // If the patient_code hasn't loaded yet (trigger may still be running),
  // refresh the auth context once after a short delay.
  useEffect(() => {
    if (profile && profile.role === 'patient' && !profile.patient_code) {
      const timer = setTimeout(() => refreshUser(), 1000)
      return () => clearTimeout(timer)
    }
  }, [profile, refreshUser])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    const { error: updateError } = await updateProfile({
      full_name: fullName.trim(),
      phone: phone.trim() || null,
    })

    setSaving(false)
    if (updateError) {
      setError('تعذّر حفظ التغييرات. حاول مرة أخرى.')
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  const handleCopyCode = async () => {
    if (!profile?.patient_code) return
    try {
      await navigator.clipboard.writeText(profile.patient_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const input = document.createElement('input')
      input.value = profile.patient_code
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Spinner size={36} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
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
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">حساب المريض</h1>
        <p className="mt-1 text-base text-slate-600">معلوماتك الشخصية ورمز ربط العيادة</p>
      </div>

      {/* Patient Code Card - High contrast, accessible copy button */}
      <div className="rounded-3xl border-2 border-sage-200 bg-sage-50/90 p-5 shadow-xs">
        <div className="flex items-center gap-2 text-sage-800">
          <Hash size={20} />
          <span className="text-base font-bold">رمز المريض الخاص بك</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-2xl sm:text-3xl font-bold tracking-wider text-sage-950 font-mono">
            {profile?.patient_code || 'جارٍ التوليد...'}
          </span>
          {profile?.patient_code && (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-2 rounded-2xl bg-sage-600 px-4 py-2.5 text-base font-bold text-white transition-all hover:bg-sage-700 active:scale-95 shadow-xs"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              <span>{copied ? 'تم النسخ' : 'نسخ الرمز'}</span>
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-sage-800 leading-relaxed">
          شارك هذا الرمز مع طبيبك لربط ملفك الطبي وإرسال مواعيد قطراتك إلى هاتفك مباشرة.
        </p>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSave} className="rounded-3xl border border-sand-200 bg-white p-6 shadow-xs space-y-4">
        <FormField
          label="الاسم الكامل"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="اسم المريض"
          icon={User}
        />
        <FormField
          label="البريد الإلكتروني"
          type="email"
          value={profile?.email || ''}
          onChange={() => {}}
          icon={Mail}
        />
        <FormField
          label="رقم الهاتف"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="٠٥xxxxxxxx"
          icon={Phone}
        />

        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-base font-semibold text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-2xl bg-sage-50 border border-sage-200 p-4 text-base font-bold text-sage-800">
            <CheckCircle2 size={20} className="text-sage-600" />
            <span>تم حفظ التعديلات بنجاح.</span>
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-sage-600 px-6 py-3.5 text-xl font-bold text-white shadow-sm transition-all hover:bg-sage-700 active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? <Spinner size={22} /> : <Save size={22} />}
            <span>{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</span>
          </button>
        </div>
      </form>

      {/* Logout Action */}
      <button
        onClick={() => signOut()}
        className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50/70 px-6 py-3 text-lg font-bold text-rose-700 transition-all hover:bg-rose-100 active:scale-[0.98]"
      >
        <LogOut size={22} />
        <span>تسجيل الخروج من الحساب</span>
      </button>
    </div>
  )
}
