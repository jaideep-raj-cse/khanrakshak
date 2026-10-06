import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, Loader2, UploadCloud, FileText } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import {
  MockExtractionBanner,
  ExtractedFieldsPanel,
  CompliancePanel,
  FlagsPanel,
} from '../components/documents/DocumentPanels';
import {
  validateUploadInput,
  detectScenario,
  uploadDocument,
  getUploadableMines,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
} from '../services/documentService';
import { useRole } from '../context/RoleContext';
import { can } from '../data/roles';
import { DOCUMENT_TYPE_UPLOAD_OPTIONS } from '../data/constants';

// The upload flow: Upload → Processing → Extract → Compliance → Issues. The delay is only there so
// the stages are visible in a demo; the extraction itself is instant and canned.
const PROCESSING_STEP_MS = 650;
const STEPS = [
  { title: 'Uploading document', detail: 'Reading the file name, size and type (contents are not read)' },
  { title: 'Processing…', detail: 'Preparing the document for mock extraction' },
  { title: 'Extracting information', detail: 'Playing back a canned scenario — no OCR is run' },
  { title: 'Checking compliance status', detail: 'Comparing the expiry date with today' },
  { title: 'Detecting potential issues', detail: 'Applying the expiry, signature/seal and required-field rules' },
];

const inputClass =
  'bg-bg border border-border rounded-input h-9 px-2 text-sm text-text-primary outline-none focus:border-amber disabled:opacity-50';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProcessingSteps({ step }) {
  return (
    <Card title="Mock Processing">
      <ol className="space-y-3" aria-label="Processing steps">
        {STEPS.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'pending';
          return (
            <li key={s.title} className="flex items-start gap-3" data-state={state}>
              {state === 'done' ? (
                <CheckCircle2 size={18} className="text-risk-low shrink-0" aria-hidden="true" />
              ) : state === 'active' ? (
                <Loader2 size={18} className="text-amber shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Circle size={18} className="text-text-muted shrink-0" aria-hidden="true" />
              )}
              <div>
                <div className={`text-sm ${state === 'pending' ? 'text-text-secondary' : 'font-medium'}`}>{s.title}</div>
                {state !== 'pending' && <div className="text-xs text-text-secondary">{s.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default function DocumentUpload() {
  const navigate = useNavigate();
  const { role, roleDetails } = useRole();
  const actor = roleDetails?.demoUser?.name ?? 'Unknown';
  const mines = useMemo(() => getUploadableMines(role), [role]);

  const [mineId, setMineId] = useState(mines.length === 1 ? mines[0].id : '');
  const [documentType, setDocumentType] = useState('AUTO');
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [phase, setPhase] = useState('form'); // 'form' | 'processing' | 'done'
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const savedRef = useRef(false);
  const input = { role, mineId, file, documentType };

  // Advance the stages with timers; the record is saved only when the last stage completes.
  useEffect(() => {
    if (phase !== 'processing') return undefined;
    if (step >= STEPS.length) {
      if (!savedRef.current) {
        savedRef.current = true;
        try {
          setResult(uploadDocument({ file, mineId, documentType, actor, role }));
          setPhase('done');
        } catch (err) {
          setErrors({ form: err.message });
          setPhase('form');
        }
      }
      return undefined;
    }
    const timer = setTimeout(() => setStep((s) => s + 1), PROCESSING_STEP_MS);
    return () => clearTimeout(timer);
  }, [phase, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview of which canned scenario the upload will play back.
  const preview = useMemo(() => (file ? detectScenario({ fileName: file.name, documentType }) : null), [file, documentType]);

  // Once the person has tried to submit, keep the messages in step with what they change.
  const revalidate = (next) => {
    if (submitted) setErrors(validateUploadInput({ ...input, ...next }).errors);
  };
  const pickFile = (f) => {
    setFile(f);
    revalidate({ file: f });
  };

  if (!can('documents.upload', role)) {
    return (
      <div>
        <PageHeader title="Upload Document" />
        <p className="text-sm text-text-secondary">Your role cannot upload documents.</p>
      </div>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    const check = validateUploadInput(input);
    setErrors(check.errors);
    if (!check.ok) return;
    savedRef.current = false;
    setStep(0);
    setPhase('processing');
  };

  const reset = () => {
    setFile(null);
    setDocumentType('AUTO');
    setMineId(mines.length === 1 ? mines[0].id : '');
    setErrors({});
    setSubmitted(false);
    setResult(null);
    setStep(0);
    setPhase('form');
  };

  const busy = phase !== 'form';

  return (
    <div>
      <button
        onClick={() => navigate('/documents')}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
      >
        <ArrowLeft size={15} /> Back to Documents
      </button>

      <PageHeader
        title="Upload Document"
        subtitle="Add a document to a mine's register and run the mock extraction."
      />

      <MockExtractionBanner />

      {phase === 'form' && (
        <form onSubmit={submit} noValidate className="max-w-2xl">
          <Card title="Document details">
            <div className="space-y-5">
              <div>
                <label htmlFor="doc-mine" className="block text-xs text-text-secondary">
                  Mine
                </label>
                <select
                  id="doc-mine"
                  value={mineId}
                  onChange={(e) => {
                    setMineId(e.target.value);
                    revalidate({ mineId: e.target.value });
                  }}
                  aria-invalid={!!errors.mine}
                  aria-describedby={errors.mine ? 'doc-mine-error' : undefined}
                  className={`${inputClass} mt-1 block w-full`}
                >
                  <option value="">Select a mine…</option>
                  {mines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {errors.mine && (
                  <span id="doc-mine-error" className="text-xs text-risk-critical mt-1 block" role="alert">
                    {errors.mine}
                  </span>
                )}
              </div>

              <div>
                <label htmlFor="doc-type" className="block text-xs text-text-secondary">
                  Document type
                </label>
                <select
                  id="doc-type"
                  value={documentType}
                  onChange={(e) => {
                    setDocumentType(e.target.value);
                    revalidate({ documentType: e.target.value });
                  }}
                  aria-invalid={!!errors.type}
                  aria-describedby={errors.type ? 'doc-type-error' : undefined}
                  className={`${inputClass} mt-1 block w-full`}
                >
                  {DOCUMENT_TYPE_UPLOAD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {errors.type && (
                  <span id="doc-type-error" className="text-xs text-risk-critical mt-1 block" role="alert">
                    {errors.type}
                  </span>
                )}
                {preview && (
                  <p className="text-xs text-text-secondary mt-2" data-testid="scenario-preview">
                    Mock scenario: <span className="text-text-primary">{preview.scenario.label}</span> (
                    {preview.basis === 'SELECTED_TYPE' ? 'from the selected type' : 'matched from the file name'}).
                  </p>
                )}
              </div>

              <div>
                <span className="text-xs text-text-secondary">File</span>
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files?.[0]) pickFile(e.dataTransfer.files[0]);
                  }}
                  className={`mt-1 flex flex-col items-center justify-center gap-2 text-center px-4 py-8 rounded-card border border-dashed cursor-pointer focus-within:border-amber hover:bg-elevated ${
                    dragging ? 'border-amber bg-elevated' : errors.file ? 'border-risk-critical' : 'border-border-strong'
                  }`}
                >
                  <input
                    type="file"
                    accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',')}
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    aria-label="Document file"
                    aria-invalid={!!errors.file}
                    aria-describedby={errors.file ? 'doc-file-error' : undefined}
                    className="sr-only"
                  />
                  {file ? (
                    <>
                      <FileText size={22} className="text-amber" aria-hidden="true" />
                      <span className="text-sm font-medium break-all">{file.name}</span>
                      <span className="text-xs text-text-secondary">{formatSize(file.size)} · click to choose a different file</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={22} className="text-text-secondary" aria-hidden="true" />
                      <span className="text-sm">Click to choose a file, or drop it here</span>
                      <span className="text-xs text-text-secondary">
                        {ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')} · up to {MAX_FILE_SIZE_MB} MB · stays in this browser, contents are never read
                      </span>
                    </>
                  )}
                </label>
                {errors.file && (
                  <span id="doc-file-error" className="text-xs text-risk-critical mt-1 block" role="alert">
                    {errors.file}
                  </span>
                )}
              </div>

              {(errors.form || errors.permission) && (
                <p className="text-xs text-risk-critical" role="alert">{errors.form ?? errors.permission}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="h-9 px-4 rounded-btn text-sm bg-amber text-surface font-medium hover:bg-amber-base"
                >
                  Upload &amp; run mock extraction
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/documents')}
                  className="h-9 px-3 rounded-btn text-sm border border-border hover:bg-elevated"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </form>
      )}

      {busy && (
        <div className="space-y-4">
          <div className="max-w-2xl">
            <ProcessingSteps step={phase === 'done' ? STEPS.length : step} />
            {phase === 'processing' && (
              <p className="text-xs text-text-secondary mt-2" role="status">
                Stay on this page until processing finishes — the document is saved at the end.
              </p>
            )}
          </div>

          {phase === 'done' && result && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border rounded-card px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium break-all" data-testid="result-file">{result.fileName}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    <span className="font-mono">{result.id}</span> · {result.typeLabel} · {result.mineName} · mock extraction complete
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={result.status} />
                  <StatusBadge status={result.validityStatus} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ExtractedFieldsPanel doc={result} />
                <CompliancePanel doc={result} />
              </div>
              <FlagsPanel doc={result} />

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate(`/documents/${result.id}`)}
                  className="h-9 px-4 rounded-btn text-sm bg-amber text-surface font-medium hover:bg-amber-base"
                >
                  Open document detail
                </button>
                <button onClick={reset} className="h-9 px-3 rounded-btn text-sm border border-border hover:bg-elevated">
                  Upload another
                </button>
                <button
                  onClick={() => navigate('/documents')}
                  className="h-9 px-3 rounded-btn text-sm border border-border hover:bg-elevated"
                >
                  Back to documents
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
