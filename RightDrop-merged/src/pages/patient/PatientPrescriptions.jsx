import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Eye, Calendar, Droplet, Clock, User, ArrowRight } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import MedicationImage from '../../components/MedicationImage'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import {
  EYE_LABELS, STATUS_LABELS, STATUS_COLORS, deriveStatus, formatDate,
} from '../../lib/prescriptionHelpers'

export default function PatientPrescriptions() {
  const { user } = useAuth()
  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('prescriptions')
      .select(`
        id, medication_name, concentration, dosage, frequency_per_day,
        eye, start_date, end_date, instructions, status, created_at,
        doctor:profiles!prescriptions_doctor_id_fkey ( id, full_name )
      `)
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setPrescriptions(data)
        setLoading(false)
      })
  }, [user])

  // Group by derived status for clear display.
  const active = prescriptions.filter((rx) => deriveStatus(rx) === 'active')
  const completed = prescriptions.filter((rx) => deriveStatus(rx) === 'completed')
  const discontinued = prescriptions.filter((rx) => deriveStatus(rx) === 'discontinued')

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
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">وصفاتي الطبية</h1>
        <p className="mt-1 text-base text-slate-600">قائمة قطرات العين المعتمدة من قبل أطبائك</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Spinner size={36} />
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="rounded-3xl border border-sand-200 bg-white p-6 shadow-sm">
          <EmptyState
            icon={FileText}
            title="لا توجد وصفات طبية مسجلة بعد"
            subtitle="ستظهر الوصفات الطبية هنا فور إرسالها من قبل طبيبك."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <Section title="الوصفات النشطة" count={active.length}>
              {active.map((rx) => (
                <PrescriptionCard key={rx.id} rx={rx} />
              ))}
            </Section>
          )}
          {completed.length > 0 && (
            <Section title="الوصفات المكتملة" count={completed.length}>
              {completed.map((rx) => (
                <PrescriptionCard key={rx.id} rx={rx} />
              ))}
            </Section>
          )}
          {discontinued.length > 0 && (
            <Section title="الوصفات المتوقفة" count={discontinued.length}>
              {discontinued.map((rx) => (
                <PrescriptionCard key={rx.id} rx={rx} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <span className="rounded-full bg-sand-200 px-3 py-0.5 text-xs font-bold text-slate-700">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function PrescriptionCard({ rx }) {
  const status = deriveStatus(rx)
  return (
    <div className="rounded-3xl border border-sand-200 bg-white p-5 shadow-xs">
      <div className="flex items-center gap-4">
        <MedicationImage
          medicationName={rx.medication_name}
          concentration={rx.concentration}
          size="md"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold text-slate-900">{rx.medication_name}</h3>
            {rx.concentration && (
              <span className="text-base font-semibold text-slate-600" dir="ltr">{rx.concentration}</span>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLORS[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
            <User size={16} />
            <span>الطبيب: {rx.doctor?.full_name || 'الطبيب المشرف'}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-sand-100 pt-3 sm:grid-cols-2 text-base">
        <Detail label="الجرعة" value={rx.dosage} icon={Droplet} />
        <Detail label="التكرار" value={`${rx.frequency_per_day} مرات يومياً`} icon={Clock} />
        <Detail label="العين المعنية" value={EYE_LABELS[rx.eye]} icon={Eye} />
        <Detail label="بداية الوصفة" value={formatDate(rx.start_date)} icon={Calendar} />
        <Detail label="نهاية الوصفة" value={formatDate(rx.end_date)} icon={Calendar} />
      </div>

      {rx.instructions && (
        <div className="mt-3 rounded-2xl bg-sand-50 p-3 text-base text-slate-700 border border-sand-200">
          <span className="font-bold text-slate-900">إرشادات الطبيب: </span>
          <span>{rx.instructions}</span>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-sand-100/60 pb-1.5">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
        {Icon && <Icon size={16} className="text-sage-600" />}
        {label}
      </span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  )
}
