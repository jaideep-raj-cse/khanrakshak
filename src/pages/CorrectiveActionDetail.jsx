import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileWarning, Wrench } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import EscalationBadge from '../components/ui/EscalationBadge';
import Timeline from '../components/ui/Timeline';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import { getCorrectiveActionById, getIssueWithRelations } from '../services/dataService';
import { canViewAction } from '../services/accessService';
import { buildCorrectiveActionTimeline } from '../workflows/timeline';
import {
  computeDaysInfo,
  getEscalationLevel,
  ESCALATION_LEVELS,
  roleCan,
  startProgress,
  submitForVerification,
} from '../workflows/correctiveActionWorkflow';
import { useRole } from '../context/RoleContext';
import { formatDate } from '../utils/date';
import { getRiskLevelLabel } from '../riskEngine/riskEngine';

export default function CorrectiveActionDetail() {
  const { actionId } = useParams();
  const navigate = useNavigate();
  const { role, roleDetails } = useRole();
  const actor = roleDetails?.demoUser.name ?? 'Demo User';

  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null); // metadata only — nothing is uploaded
  const [evidenceNote, setEvidenceNote] = useState('');
  const [remarks, setRemarks] = useState('');

  const action = useMemo(() => getCorrectiveActionById(actionId), [actionId, refreshKey]);
  const issue = useMemo(
    () => (action ? getIssueWithRelations(action.issueId) : null),
    [action, refreshKey]
  );
  const daysInfo = useMemo(() => computeDaysInfo(action), [action, refreshKey]);
  const escalationLevel = useMemo(() => getEscalationLevel(action), [action, refreshKey]);
  const escalationHistory = action?.escalationHistory ?? [];
  const timeline = useMemo(() => buildCorrectiveActionTimeline(action, issue), [action, issue]);

  if (!action || !canViewAction(role, action)) {
    return (
      <div>
        <BackLink navigate={navigate} />
        <EmptyState title="Corrective action not found" description={`No corrective action matches ID ${actionId}.`} />
      </div>
    );
  }

  const canStart = roleCan('START_PROGRESS', role) && ['OPEN', 'ASSIGNED'].includes(action.status);
  const canSubmit = roleCan('SUBMIT_FOR_VERIFICATION', role) && action.status === 'IN_PROGRESS';

  const handleStart = () => {
    setError('');
    try {
      startProgress({ actionId, actor, role });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const openSubmitForm = () => {
    setCompletionNotes(action.completionNotes ?? '');
    setEvidenceFile(null);
    setEvidenceNote('');
    setRemarks('');
    setError('');
    setShowSubmitForm(true);
  };

  const handleSubmit = () => {
    setError('');
    try {
      submitForVerification({
        actionId,
        actor,
        role,
        completionNotes,
        remarks,
        evidence:
          evidenceFile || evidenceNote.trim()
            ? {
                fileName: evidenceFile?.fileName ?? null,
                fileType: evidenceFile?.fileType ?? null,
                fileSizeKB: evidenceFile?.fileSizeKB ?? null,
                note: evidenceNote.trim() || null,
              }
            : null,
      });
      setShowSubmitForm(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <BackLink navigate={navigate} issueId={action.issueId} />

      <PageHeader
        title={action.title}
        subtitle={
          <span className="font-mono text-xs">
            {action.id} · Issue{' '}
            <Link to={`/issues/${action.issueId}`} className="hover:text-amber">
              {action.issueId}
            </Link>{' '}
            · {issue?.mine ? (
              <Link to={`/mines/${issue.mine.id}`} className="hover:text-amber">
                {issue.mine.name}
              </Link>
            ) : (
              '—'
            )}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            {escalationLevel > 0 && <EscalationBadge level={escalationLevel} />}
            <StatusBadge status={action.status} overdue={daysInfo.overdue} />
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-3 py-2 rounded-btn border border-risk-critical text-risk-critical text-sm bg-risk-critical/10">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Corrective Action Detail">
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <Field label="Corrective Action ID" value={action.id} mono />
              <Field label="Related Issue ID" value={action.issueId} mono />
              <Field label="Mine" value={issue?.mine?.name ?? '—'} />
              <Field label="Issue Category" value={issue?.category ?? '—'} />
              <Field label="Assigned Person" value={`${action.assignee} (${action.assigneeRole})`} />
              <Field label="Priority" value={action.priorityRisk} />
              <Field label="Created Date" value={formatDate(action.createdDate)} mono />
              <Field label="Deadline" value={formatDate(action.dueDate)} mono critical={daysInfo.overdue} />
              <Field label="Current Status" value={<StatusBadge status={action.status} overdue={daysInfo.overdue} />} />
              <Field label="Days Remaining / Overdue" value={daysInfo.label} critical={daysInfo.overdue} />
            </dl>
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Issue Description
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{issue?.description ?? '—'}</p>
            </div>
            {issue && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
                  Risk Assessment
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm">{getRiskLevelLabel(issue.riskLevel)} — {issue.riskScore}/100</span>
                </div>
                <ul className="space-y-1">
                  {issue.riskReasons.map((r, idx) => (
                    <li key={idx} className="text-xs text-text-secondary flex gap-2">
                      <span className="text-amber">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Submission / Evidence">
            {action.completionNotes || action.evidence ? (
              <div className="space-y-3 text-sm">
                {action.completionNotes && (
                  <div>
                    <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                      Completion Notes
                    </div>
                    <p className="text-text-secondary">{action.completionNotes}</p>
                  </div>
                )}
                {action.remarks && (
                  <div>
                    <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                      Remarks
                    </div>
                    <p className="text-text-secondary">{action.remarks}</p>
                  </div>
                )}
                {action.evidence && (
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-btn bg-elevated border border-border flex items-center justify-center shrink-0">
                      <FileWarning size={15} className="text-text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {action.evidence.fileName ?? 'Evidence note (no file attached)'}
                      </div>
                      {action.evidence.note && (
                        <p className="text-xs text-text-secondary mt-1">{action.evidence.note}</p>
                      )}
                      <p className="text-[11px] text-text-muted mt-1">
                        Prototype evidence record — file metadata only, not uploaded to any server.
                      </p>
                    </div>
                  </div>
                )}
                {action.submittedAt && (
                  <p className="text-[11px] text-text-muted font-mono pt-2 border-t border-border">
                    Submitted by {action.submittedBy} on {formatDate(action.submittedAt.slice(0, 10))}
                  </p>
                )}
                {action.rejectedAt && action.status !== 'CLOSED' && action.status !== 'VERIFIED' && (
                  <div className="pt-2 border-t border-border">
                    <div className="text-xs font-semibold text-risk-critical uppercase tracking-wide mb-1">
                      Last Rejection
                    </div>
                    <p className="text-text-secondary text-xs">{action.rejectionReason}</p>
                    {action.additionalInstructions && (
                      <p className="text-text-secondary text-xs mt-1">{action.additionalInstructions}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={FileWarning}
                title="No submission yet"
                description="Completion notes and evidence will appear here once the assignee submits this corrective action for verification."
              />
            )}
          </Card>

          <Card title="Timeline">
            <Timeline events={timeline} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Workflow Actions">
            <div className="space-y-2">
              {canStart && (
                <button
                  onClick={handleStart}
                  className="w-full h-9 rounded-btn bg-amber text-surface text-sm font-medium hover:bg-amber-hover"
                >
                  Start Progress
                </button>
              )}
              {canSubmit && (
                <button
                  onClick={openSubmitForm}
                  className="w-full h-9 rounded-btn bg-amber text-surface text-sm font-medium hover:bg-amber-hover"
                >
                  Submit for Verification
                </button>
              )}
              {action.status === 'SUBMITTED_FOR_VERIFICATION' && (
                <p className="text-xs text-text-secondary">
                  Awaiting Compliance Officer review.{' '}
                  {roleCan('VERIFY', role) && (
                    <Link to={`/verification/${action.id}`} className="text-amber hover:underline">
                      Open in Verification Queue →
                    </Link>
                  )}
                </p>
              )}
              {action.status === 'VERIFIED' && (
                <p className="text-xs text-text-secondary">
                  Verified by {action.verifiedBy}.{' '}
                  {roleCan('CLOSE', role) && (
                    <Link to={`/verification/${action.id}`} className="text-amber hover:underline">
                      Close from Verification Queue →
                    </Link>
                  )}
                </p>
              )}
              {action.status === 'CLOSED' && (
                <p className="text-xs text-risk-low">Closed by {action.closedBy}.</p>
              )}
              {!canStart && !canSubmit && !['SUBMITTED_FOR_VERIFICATION', 'VERIFIED', 'CLOSED'].includes(action.status) && (
                <p className="text-xs text-text-secondary">
                  No workflow action available for your role at this stage.
                </p>
              )}
            </div>
          </Card>

          {escalationHistory.length > 0 && (
            <Card title="Escalation">
              <div className="flex items-start gap-2 text-sm">
                <Wrench size={15} className="text-risk-critical mt-0.5 shrink-0" />
                <p className="text-text-secondary">
                  {escalationLevel > 0
                    ? `Currently at Level ${escalationLevel} — ${ESCALATION_LEVELS[escalationLevel].label.split('— ')[1]}. This corrective action is past its deadline and requires attention.`
                    : 'This corrective action was escalated while overdue and has since been completed.'}
                </p>
              </div>
              <ul className="mt-3 pt-3 border-t border-border space-y-1.5">
                {escalationHistory.map((h) => (
                  <li key={h.level} className="text-xs text-text-secondary flex justify-between gap-3">
                    <span>
                      <span className="font-mono text-risk-critical">L{h.level}</span> · {h.recipientLabel}
                    </span>
                    <span className="font-mono text-text-muted shrink-0">
                      {h.overdueDays}d overdue · {formatDate(h.triggeredAt.slice(0, 10))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-text-muted mt-3">
                Level 1: overdue → assigned Mine Manager · Level 2: more than 3 days → Compliance
                Officer · Level 3: more than 7 days → Administrator.
              </p>
            </Card>
          )}
        </div>
      </div>

      {showSubmitForm && (
        <Modal
          title="Submit for Verification"
          onClose={() => setShowSubmitForm(false)}
          footer={
            <>
              <button
                onClick={() => setShowSubmitForm(false)}
                className="h-9 px-4 rounded-btn border border-border text-sm hover:bg-elevated"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="h-9 px-4 rounded-btn bg-amber text-surface text-sm font-medium hover:bg-amber-hover"
              >
                Submit
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            {error && <p className="text-risk-critical text-xs">{error}</p>}
            <div>
              <label className="text-xs text-text-secondary uppercase tracking-wide">Completion Notes *</label>
              <textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full bg-bg border border-border rounded-input px-3 py-2 text-sm outline-none focus:border-amber"
                placeholder="Describe the remediation work completed…"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary uppercase tracking-wide">
                Correction Evidence (prototype — file details only, nothing is uploaded)
              </label>
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setEvidenceFile(
                    f
                      ? { fileName: f.name, fileType: f.type || 'unknown', fileSizeKB: Math.max(1, Math.round(f.size / 1024)) }
                      : null
                  );
                }}
                className="mt-1 block w-full text-xs text-text-secondary file:mr-3 file:h-8 file:px-3 file:rounded-btn file:border file:border-border file:bg-elevated file:text-text-primary file:text-xs"
              />
              {evidenceFile && (
                <p className="text-[11px] text-text-muted mt-1 font-mono">
                  {evidenceFile.fileName} · {evidenceFile.fileSizeKB} KB
                </p>
              )}
              <input
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                className="mt-2 w-full bg-bg border border-border rounded-input h-9 px-3 text-sm outline-none focus:border-amber"
                placeholder="Evidence note (optional)"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary uppercase tracking-wide">Remarks (optional)</label>
              <input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="mt-1 w-full bg-bg border border-border rounded-input h-9 px-3 text-sm outline-none focus:border-amber"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value, mono, critical }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary uppercase tracking-wide">{label}</dt>
      <dd className={`mt-0.5 text-sm ${mono ? 'font-mono' : ''} ${critical ? 'text-risk-critical' : ''}`}>{value}</dd>
    </div>
  );
}

function BackLink({ navigate, issueId }) {
  return (
    <button
      onClick={() => navigate('/corrective-actions')}
      className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
    >
      <ArrowLeft size={15} /> Back to Corrective Actions
    </button>
  );
}
