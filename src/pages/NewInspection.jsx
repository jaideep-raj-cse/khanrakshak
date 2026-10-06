import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X, UploadCloud, FileCheck2, ShieldAlert } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import WizardSteps from '../components/inspection/WizardSteps';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';
import { getVisibleMines } from '../services/accessService';
import { submitInspection } from '../workflows/submissionPipeline';
import {
  INSPECTION_TYPES,
  ISSUE_CATEGORY_GROUPS,
  SEVERITY_OPTIONS,
  EXPOSURE_LEVEL_OPTIONS,
} from '../data/constants';

const STEPS = [
  'Select Mine',
  'Inspection Type',
  'Category',
  'Observation',
  'Severity',
  'Recurrence',
  'Exposure',
  'Evidence',
  'Review',
  'Submit',
];

const INITIAL_FORM = {
  mineId: '',
  inspectionType: '',
  category: '',
  observation: '',
  severity: null,
  recurrenceCount: 0,
  exposureLevel: '',
  exposureWorkers: '',
  evidence: null, // { fileName, fileType, fileSizeKB, note, previewUrl }
};

function fieldClasses(hasError) {
  return `w-full bg-bg border rounded-input px-3 h-10 text-sm outline-none focus:border-amber ${
    hasError ? 'border-risk-critical' : 'border-border'
  }`;
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="text-xs text-risk-critical mt-1">{message}</p>;
}

export default function NewInspection() {
  const { role, roleDetails } = useRole();
  const navigate = useNavigate();
  const mines = useMemo(() => getVisibleMines(role), [role]);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  if (role !== ROLES.FIELD_OFFICER) {
    return (
      <div>
        <PageHeader title="New Inspection" />
        <Card>
          <div className="flex flex-col items-center text-center py-10 gap-3">
            <ShieldAlert size={26} className="text-text-secondary" />
            <p className="text-sm text-text-secondary max-w-sm">
              Only the Field Officer persona can create a new inspection. Switch persona from the
              topbar to try this workflow.
            </p>
            <Link to="/inspections" className="text-sm text-amber hover:underline">
              Back to Inspections
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  const validateStep = (idx, data) => {
    const e = {};
    if (idx === 0 && !data.mineId) e.mineId = 'Select a mine to continue.';
    if (idx === 1 && !data.inspectionType) e.inspectionType = 'Select an inspection type.';
    if (idx === 2 && !data.category) e.category = 'Select a compliance category.';
    if (idx === 3 && data.observation.trim().length < 10) {
      e.observation = 'Describe the observation in at least 10 characters.';
    }
    if (idx === 4 && !data.severity) e.severity = 'Select a severity rating.';
    if (idx === 6 && !data.exposureLevel) e.exposureLevel = 'Select a worker exposure level.';
    return e;
  };

  const goNext = () => {
    const stepErrors = validateStep(step, form);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  };

  const handleEvidenceChange = (file) => {
    if (!file) {
      update({ evidence: { ...(form.evidence ?? {}), fileName: null, fileType: null, fileSizeKB: null, previewUrl: null } });
      return;
    }
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    update({
      evidence: {
        fileName: file.name,
        fileType: file.type || 'unknown',
        fileSizeKB: Math.max(1, Math.round(file.size / 1024)),
        note: form.evidence?.note ?? '',
        previewUrl,
      },
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const evidence = form.evidence?.fileName
        ? {
            fileName: form.evidence.fileName,
            fileType: form.evidence.fileType,
            fileSizeKB: form.evidence.fileSizeKB,
            note: form.evidence.note || '',
          }
        : form.evidence?.note
        ? { fileName: null, fileType: null, fileSizeKB: null, note: form.evidence.note }
        : null;

      const result = submitInspection({
        mineId: form.mineId,
        inspectionType: form.inspectionType,
        category: form.category,
        observation: form.observation.trim(),
        severity: form.severity,
        recurrenceCount: Number(form.recurrenceCount) || 0,
        exposureLevel: form.exposureLevel,
        exposureWorkers: form.exposureWorkers ? Number(form.exposureWorkers) : null,
        evidence,
        inspector: { name: roleDetails.demoUser.name, role: roleDetails.name, roleId: role },
      });

      navigate(`/issues/${result.issue.id}`);
    } catch (err) {
      console.error(err);
      setSubmitError('Something went wrong while submitting this inspection. Please try again.');
      setSubmitting(false);
    }
  };

  const selectedMine = mines.find((m) => m.id === form.mineId);

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate('/inspections')}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
      >
        <ArrowLeft size={15} /> Back to Inspections
      </button>

      <PageHeader title="New Inspection" subtitle="Field inspection wizard — prototype/demonstration workflow" />

      <Card>
        <WizardSteps steps={STEPS} currentIndex={step} />

        <div className="min-h-[220px]">
          {step === 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Which mine are you inspecting?</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mines.map((mine) => (
                  <button
                    key={mine.id}
                    onClick={() => update({ mineId: mine.id })}
                    className={`text-left border rounded-card p-3 transition-colors ${
                      form.mineId === mine.id
                        ? 'border-amber bg-elevated'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <div className="text-sm font-medium">{mine.name}</div>
                    <div className="text-xs font-mono text-text-secondary">{mine.id} · {mine.region}</div>
                  </button>
                ))}
              </div>
              <FieldError message={errors.mineId} />
            </div>
          )}

          {step === 1 && (
            <div>
              <label className="block text-sm font-medium mb-2">Inspection type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INSPECTION_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => update({ inspectionType: type })}
                    className={`text-left border rounded-card p-3 text-sm transition-colors ${
                      form.inspectionType === type
                        ? 'border-amber bg-elevated'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <FieldError message={errors.inspectionType} />
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="block text-sm font-medium mb-2">Compliance category</label>
              <select
                value={form.category}
                onChange={(e) => update({ category: e.target.value })}
                className={fieldClasses(errors.category)}
              >
                <option value="">Select a category…</option>
                {Object.entries(ISSUE_CATEGORY_GROUPS).map(([domain, categories]) => (
                  <optgroup key={domain} label={domain}>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <FieldError message={errors.category} />
            </div>
          )}

          {step === 3 && (
            <div>
              <label className="block text-sm font-medium mb-2">Observation</label>
              <textarea
                value={form.observation}
                onChange={(e) => update({ observation: e.target.value })}
                rows={6}
                placeholder="Describe exactly what was observed, where, and why it's a concern…"
                className={`${fieldClasses(errors.observation)} h-auto py-2 resize-none`}
              />
              <FieldError message={errors.observation} />
            </div>
          )}

          {step === 4 && (
            <div>
              <label className="block text-sm font-medium mb-2">Severity</label>
              <div className="space-y-2">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update({ severity: opt.value })}
                    className={`w-full text-left border rounded-card px-3 py-2.5 text-sm transition-colors ${
                      form.severity === opt.value
                        ? 'border-amber bg-elevated'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <FieldError message={errors.severity} />
            </div>
          )}

          {step === 5 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Has this exact issue been observed before at this mine?
              </label>
              <p className="text-xs text-text-secondary mb-3">
                Enter the number of prior occurrences. Enter 0 if this is the first time.
              </p>
              <input
                type="number"
                min={0}
                max={10}
                value={form.recurrenceCount}
                onChange={(e) => update({ recurrenceCount: e.target.value })}
                className={`${fieldClasses(false)} max-w-[140px]`}
              />
            </div>
          )}

          {step === 6 && (
            <div>
              <label className="block text-sm font-medium mb-2">Worker exposure</label>
              <div className="space-y-2 mb-4">
                {EXPOSURE_LEVEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update({ exposureLevel: opt.value })}
                    className={`w-full text-left border rounded-card px-3 py-2.5 text-sm transition-colors ${
                      form.exposureLevel === opt.value
                        ? 'border-amber bg-elevated'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <FieldError message={errors.exposureLevel} />
              <label className="block text-xs text-text-secondary mb-1.5">
                Approximate workers exposed (optional)
              </label>
              <input
                type="number"
                min={0}
                value={form.exposureWorkers}
                onChange={(e) => update({ exposureWorkers: e.target.value })}
                className={`${fieldClasses(false)} max-w-[140px]`}
                placeholder="e.g. 12"
              />
            </div>
          )}

          {step === 7 && (
            <div>
              <label className="block text-sm font-medium mb-2">Evidence (optional)</label>
              <p className="text-xs text-text-secondary mb-3">
                Attach a demonstration photo/document, or just describe the evidence in words.
                This is a prototype — files are recorded as metadata only, never uploaded.
              </p>

              <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-card py-6 cursor-pointer hover:border-amber transition-colors">
                <UploadCloud size={20} className="text-text-secondary" />
                <span className="text-xs text-text-secondary">Click to select a file</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => handleEvidenceChange(e.target.files?.[0] ?? null)}
                />
              </label>

              {form.evidence?.fileName && (
                <div className="flex items-center gap-3 mt-3 p-2 border border-border rounded-card">
                  {form.evidence.previewUrl ? (
                    <img src={form.evidence.previewUrl} alt="Evidence preview" className="w-12 h-12 object-cover rounded-btn" />
                  ) : (
                    <FileCheck2 size={18} className="text-text-secondary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{form.evidence.fileName}</div>
                    <div className="text-[11px] text-text-secondary font-mono">{form.evidence.fileSizeKB} KB</div>
                  </div>
                  <button onClick={() => handleEvidenceChange(null)} className="p-1 text-text-secondary hover:text-risk-critical">
                    <X size={14} />
                  </button>
                </div>
              )}

              <label className="block text-xs text-text-secondary mt-4 mb-1.5">
                Evidence notes (optional)
              </label>
              <textarea
                value={form.evidence?.note ?? ''}
                onChange={(e) => update({ evidence: { ...(form.evidence ?? {}), note: e.target.value } })}
                rows={3}
                placeholder="Describe what the evidence shows…"
                className={`${fieldClasses(false)} h-auto py-2 resize-none`}
              />
            </div>
          )}

          {step === 8 && (
            <div className="space-y-3 text-sm">
              <ReviewRow label="Mine" value={selectedMine?.name ?? '—'} />
              <ReviewRow label="Inspection Type" value={form.inspectionType} />
              <ReviewRow label="Category" value={form.category} />
              <ReviewRow label="Observation" value={form.observation} multiline />
              <ReviewRow label="Severity" value={SEVERITY_OPTIONS.find((o) => o.value === form.severity)?.label} />
              <ReviewRow label="Prior Occurrences" value={String(form.recurrenceCount)} />
              <ReviewRow
                label="Worker Exposure"
                value={`${EXPOSURE_LEVEL_OPTIONS.find((o) => o.value === form.exposureLevel)?.label ?? '—'}${
                  form.exposureWorkers ? ` · ~${form.exposureWorkers} workers` : ''
                }`}
              />
              <ReviewRow
                label="Evidence"
                value={form.evidence?.fileName || form.evidence?.note ? form.evidence.fileName ?? 'Note only (no file)' : 'None attached'}
              />
              <p className="text-xs text-text-muted pt-2 border-t border-border">
                Submitting will create the inspection, generate the issue, calculate its risk
                score with the Prototype Risk Intelligence Engine, and — if the risk is High or
                Critical — automatically create a corrective action.
              </p>
            </div>
          )}

          {step === 9 && (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <p className="text-sm text-text-secondary max-w-sm">
                Ready to submit. This will run the full inspection → issue → risk → corrective
                action pipeline and take you to the resulting issue.
              </p>
              {submitError && <p className="text-xs text-risk-critical">{submitError}</p>}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-amber text-surface font-semibold text-sm px-5 py-2.5 rounded-btn hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit Inspection'}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <button
            onClick={() => navigate('/inspections')}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 text-sm border border-border rounded-btn px-4 py-2 hover:bg-elevated"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {step < STEPS.length - 2 && (
              <button
                onClick={goNext}
                className="flex items-center gap-1.5 text-sm bg-amber text-surface font-semibold rounded-btn px-4 py-2 hover:opacity-90"
              >
                Next <ArrowRight size={14} />
              </button>
            )}
            {step === STEPS.length - 2 && (
              <button
                onClick={goNext}
                className="flex items-center gap-1.5 text-sm bg-amber text-surface font-semibold rounded-btn px-4 py-2 hover:opacity-90"
              >
                Continue to Submit <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ReviewRow({ label, value, multiline }) {
  return (
    <div className={multiline ? '' : 'flex items-center justify-between gap-4'}>
      <span className="text-xs text-text-secondary uppercase tracking-wide">{label}</span>
      <p className={multiline ? 'text-sm mt-1' : 'text-sm text-right'}>{value || '—'}</p>
    </div>
  );
}
