import React from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react';
import Card from '../ui/Card';
import RiskBadge from '../ui/RiskBadge';
import StatusBadge from '../ui/StatusBadge';
import { useRole } from '../../context/RoleContext';
import { canViewMine } from '../../services/accessService';

export const FEATURE_LABEL = 'Document Intelligence — Mock Extraction (Prototype)';

const BASIS_TEXT = {
  SELECTED_TYPE: 'the document type that was selected at upload',
  FILENAME_PATTERN: 'a keyword in the file name',
};

const SEVERITY_LEVEL = { high: 'HIGH', medium: 'MODERATE', low: 'LOW' };

// Shown at the top of every Documents page. The extraction is canned, and this says so plainly.
export function MockExtractionBanner() {
  return (
    <div className="flex items-start gap-3 bg-surface border border-amber rounded-card px-4 py-3 mb-6" role="note">
      <FlaskConical size={18} className="text-amber shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-sm">
        <div className="font-medium text-amber">{FEATURE_LABEL}</div>
        <p className="text-xs text-text-secondary mt-0.5 max-w-3xl">
          This is a demonstration. No OCR is performed and no file contents are read: the fields, compliance status and
          issues below come from a canned scenario chosen by the document type or the file name. All numbers and
          authorities are fictional.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-sm mt-0.5">{children}</dd>
    </div>
  );
}

export function ExtractedFieldsPanel({ doc }) {
  return (
    <Card title="Extracted Fields (mock)">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
        {doc.fieldList.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.found ? (
              <span className={f.key === 'licenseNumber' ? 'font-mono text-xs' : ''}>{f.value}</span>
            ) : f.required ? (
              <span className="inline-flex items-center gap-1 text-risk-moderate">
                <AlertTriangle size={13} aria-hidden="true" /> {f.missingText}
              </span>
            ) : (
              <span className="text-text-secondary">{f.missingText}</span>
            )}
          </Field>
        ))}
      </dl>
      <p className="text-xs text-text-secondary mt-4 border-t border-border pt-3">
        {doc.isMock ? (
          <>
            Canned scenario: <span className="text-text-primary">{doc.extraction.scenarioLabel}</span>, chosen from{' '}
            {BASIS_TEXT[doc.extraction.basis] ?? 'the upload details'}. The mine comes from the mine selected at upload.
            Nothing was read from the file.
          </>
        ) : (
          'Pre-filled demo values from the seed data. No file was processed to produce them.'
        )}
      </p>
    </Card>
  );
}

export function CompliancePanel({ doc }) {
  const { role } = useRole();
  const { validity } = doc;
  const toneClass =
    validity.status === 'EXPIRED'
      ? 'text-risk-critical'
      : validity.status === 'EXPIRING_SOON' || validity.status === 'UNKNOWN'
      ? 'text-risk-moderate'
      : 'text-text-secondary';

  return (
    <Card title="Compliance Information">
      <dl className="space-y-4">
        <Field label="Status">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={validity.status} />
            <span className={`text-xs ${toneClass}`}>{validity.label}</span>
          </div>
        </Field>
        <Field label="Compliance category">
          {doc.category ? (
            <>
              {doc.category}
              {doc.categoryGroup && <div className="text-xs text-text-secondary">{doc.categoryGroup} domain</div>}
            </>
          ) : (
            '—'
          )}
        </Field>
        <Field label="Relevant mine">
          {doc.mine ? (
            <>
              {canViewMine(role, doc.mine.id) ? (
                <Link to={`/mines/${doc.mine.id}`} className="hover:text-amber">
                  {doc.mine.name}
                </Link>
              ) : (
                doc.mine.name
              )}
              <div className="text-xs font-mono text-text-secondary">
                {doc.mine.id}
                {doc.mine.region ? ` · ${doc.mine.region}` : ''}
              </div>
            </>
          ) : (
            doc.mineName
          )}
        </Field>
      </dl>
    </Card>
  );
}

export function FlagsPanel({ doc }) {
  return (
    <Card title={`Potential Issues${doc.flagCount ? ` (${doc.flagCount})` : ''}`}>
      {doc.flagCount === 0 ? (
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="text-risk-low shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <div className="font-medium">No potential issues detected</div>
            <p className="text-xs text-text-secondary mt-0.5">
              The prototype rules checked the expiry date, signature/seal and required fields on the extracted values.
              This is not a compliance clearance.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-elevated -my-3">
          {doc.flags.map((flag, idx) => (
            <li key={`${flag.code}-${flag.field ?? idx}`} className="flex items-start gap-3 py-3">
              <div className="shrink-0 mt-0.5">
                <RiskBadge level={SEVERITY_LEVEL[flag.severity] ?? 'LOW'} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{flag.title}</div>
                <p className="text-xs text-text-secondary mt-0.5">{flag.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {doc.flagCount > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-text-secondary mt-4 border-t border-border pt-3">
          <CircleHelp size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
          Flags are prompts for a human to check the original document, not findings.
        </p>
      )}
    </Card>
  );
}
