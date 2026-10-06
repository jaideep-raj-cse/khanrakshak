import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileWarning, ShieldCheck, ShieldX, CircleCheckBig } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import RiskBadge from '../components/ui/RiskBadge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { getCorrectiveActionById, getIssueWithRelations } from '../services/dataService';
import { canViewAction } from '../services/accessService';
import { computeDaysInfo, roleCan, verifyAction, rejectAction, closeAction } from '../workflows/correctiveActionWorkflow';
import { useRole } from '../context/RoleContext';
import { formatDate } from '../utils/date';

// Step 4: Compliance Officer / Administrator review screen. Verification and
// rejection are explicit, confirmed human decisions — never automatic — per
// the Step 4 spec's AI-honesty requirement (section 23).
export default function VerificationDetail() {
  const { actionId } = useParams();
  const navigate = useNavigate();
  const { role, roleDetails } = useRole();
  const actor = roleDetails?.demoUser.name ?? 'Demo User';

  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [confirmMode, setConfirmMode] = useState(null); // 'verify' | 'reject' | null
  const [verificationNotes, setVerificationNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  const action = useMemo(() => getCorrectiveActionById(actionId), [actionId, refreshKey]);
  const issue = useMemo(() => (action ? getIssueWithRelations(action.issueId) : null), [action, refreshKey]);
  const daysInfo = useMemo(() => computeDaysInfo(action), [action, refreshKey]);

  // canViewAction is defense-in-depth here (both roles permitted on this route
  // have global mine scope today, same as Verification.jsx's queue filter and
  // the pattern CorrectiveActionDetail.jsx already uses) — it is a no-op under
  // the current role set but keeps this detail page consistent with its sibling.
  if (!action || !canViewAction(role, action)) {
    return (
      <div>
        <BackLink navigate={navigate} />
        <EmptyState title="Corrective action not found" description={`No corrective action matches ID ${actionId}.`} />
      </div>
    );
  }

  const canDecide = roleCan('VERIFY', role) && action.status === 'SUBMITTED_FOR_VERIFICATION';
  const canClose = roleCan('CLOSE', role) && action.status === 'VERIFIED';

  const handleVerify = () => {
    setError('');
    try {
      verifyAction({ actionId, actor, role, verificationNotes });
      setConfirmMode(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = () => {
    setError('');
    try {
      rejectAction({ actionId, actor, role, rejectionReason, additionalInstructions });
      setConfirmMode(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleClose = () => {
    setError('');
    try {
      closeAction({ actionId, actor, role });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <BackLink navigate={navigate} />

      <PageHeader
        title={`Review: ${action.title}`}
        subtitle={<span className="font-mono text-xs">{action.id} · Issue {action.issueId}</span>}
        action={<StatusBadge status={action.status} overdue={daysInfo.overdue} />}
      />

      {error && (
        <div className="mb-4 px-3 py-2 rounded-btn border border-risk-critical text-risk-critical text-sm bg-risk-critical/10">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Original Issue">
          <dl className="space-y-2 text-sm">
            <Row label="Issue ID" value={action.issueId} mono />
            <Row label="Mine" value={issue?.mine?.name ?? '—'} />
            <Row label="Category" value={issue?.category ?? '—'} />
            <Row label="Risk Level" value={issue ? <RiskBadge level={issue.riskLevel} /> : '—'} />
            <Row label="Risk Score" value={issue ? `${issue.riskScore}/100` : '—'} mono />
          </dl>
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">Description</div>
            <p className="text-sm text-text-secondary leading-relaxed">{issue?.description ?? '—'}</p>
          </div>
          {issue && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Risk Reasons</div>
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

        <Card title="Corrective Action">
          <dl className="space-y-2 text-sm">
            <Row label="Required Action" value={action.title} />
            <Row label="Assigned Person" value={`${action.assignee} (${action.assigneeRole})`} />
            <Row label="Priority" value={<RiskBadge level={action.priorityRisk} />} />
            <Row label="Deadline" value={formatDate(action.dueDate)} mono critical={daysInfo.overdue} />
            <Row
              label="Submitted"
              value={action.submittedAt ? `${formatDate(action.submittedAt.slice(0, 10))} by ${action.submittedBy}` : '—'}
            />
          </dl>
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Completion Notes
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{action.completionNotes ?? '—'}</p>
          </div>
          {action.remarks && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">Remarks</div>
              <p className="text-sm text-text-secondary">{action.remarks}</p>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Submitted Evidence
            </div>
            {action.evidence ? (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-btn bg-elevated border border-border flex items-center justify-center shrink-0">
                  <FileWarning size={15} className="text-text-secondary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {action.evidence.fileName ?? 'Evidence note (no file attached)'}
                  </div>
                  {action.evidence.note && <p className="text-xs text-text-secondary mt-1">{action.evidence.note}</p>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No evidence attached.</p>
            )}
          </div>
          {action.rejectedAt && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs font-semibold text-risk-critical uppercase tracking-wide mb-1">
                Previously Rejected
              </div>
              <p className="text-xs text-text-secondary">
                {action.rejectedBy}: {action.rejectionReason}
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card title="Verification Decision" className="mt-4">
        {canDecide ? (
          <>
            <p className="text-xs text-text-muted mb-3">
              This is a human compliance decision. Review the evidence, then either verify &amp; close
              the corrective action or reject it and send it back to the Mine Manager for
              correction. It is not an automated AI approval.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setVerificationNotes('');
                  setError('');
                  setConfirmMode('verify');
                }}
                className="h-10 px-5 rounded-btn bg-risk-low text-surface text-sm font-semibold hover:opacity-90 flex items-center gap-2"
              >
                <ShieldCheck size={16} /> Verify &amp; Close
              </button>
              <button
                onClick={() => {
                  setRejectionReason('');
                  setAdditionalInstructions('');
                  setError('');
                  setConfirmMode('reject');
                }}
                className="h-10 px-5 rounded-btn border-2 border-risk-critical text-risk-critical text-sm font-semibold hover:bg-risk-critical/10 flex items-center gap-2"
              >
                <ShieldX size={16} /> Reject &amp; Send Back
              </button>
            </div>
          </>
        ) : canClose ? (
          <>
            <p className="text-sm text-text-secondary mb-3">
              Verified by {action.verifiedBy}. This corrective action is ready for closure.
            </p>
            <button
              onClick={handleClose}
              className="h-10 px-5 rounded-btn bg-amber text-surface text-sm font-semibold hover:bg-amber-hover flex items-center gap-2"
            >
              <CircleCheckBig size={16} /> Close Corrective Action
            </button>
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            {action.status === 'CLOSED'
              ? `Closed by ${action.closedBy}.`
              : 'No verification decision is pending for this corrective action.'}
          </p>
        )}
      </Card>

      {confirmMode === 'verify' && (
        <Modal
          title="Verify & close this corrective action?"
          onClose={() => setConfirmMode(null)}
          footer={
            <>
              <button
                onClick={() => setConfirmMode(null)}
                className="h-9 px-4 rounded-btn border border-border text-sm hover:bg-elevated"
              >
                Cancel
              </button>
              <button
                onClick={handleVerify}
                className="h-9 px-4 rounded-btn bg-risk-low text-surface text-sm font-medium hover:opacity-90"
              >
                Verify &amp; Close
              </button>
            </>
          }
        >
          <p className="text-sm text-text-secondary mb-3">
            Verification confirms that the submitted evidence has been reviewed and accepted.
            This verifies and closes the corrective action, and closes the linked issue.
          </p>
          <label className="text-xs text-text-secondary uppercase tracking-wide">
            Verification Notes (optional)
          </label>
          <textarea
            value={verificationNotes}
            onChange={(e) => setVerificationNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full bg-bg border border-border rounded-input px-3 py-2 text-sm outline-none focus:border-amber"
          />
        </Modal>
      )}

      {confirmMode === 'reject' && (
        <Modal
          title="Reject and send back for correction?"
          onClose={() => setConfirmMode(null)}
          footer={
            <>
              <button
                onClick={() => setConfirmMode(null)}
                className="h-9 px-4 rounded-btn border border-border text-sm hover:bg-elevated"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="h-9 px-4 rounded-btn bg-risk-critical text-surface text-sm font-medium hover:opacity-90"
              >
                Reject &amp; Send Back
              </button>
            </>
          }
        >
          {error && <p className="text-risk-critical text-xs mb-2">{error}</p>}
          <label className="text-xs text-text-secondary uppercase tracking-wide">Rejection Reason *</label>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            className="mt-1 w-full bg-bg border border-border rounded-input px-3 py-2 text-sm outline-none focus:border-amber"
            placeholder="Explain why this submission does not satisfy the corrective action…"
          />
          <label className="text-xs text-text-secondary uppercase tracking-wide mt-3 block">
            Additional Instructions (optional)
          </label>
          <textarea
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-bg border border-border rounded-input px-3 py-2 text-sm outline-none focus:border-amber"
          />
          <p className="text-[11px] text-text-muted mt-2">
            The corrective action will return to In Progress so the assignee can rework and
            resubmit it.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value, mono, critical }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={`text-sm ${mono ? 'font-mono' : ''} ${critical ? 'text-risk-critical' : ''}`}>{value}</dd>
    </div>
  );
}

function BackLink({ navigate }) {
  return (
    <button
      onClick={() => navigate('/verification')}
      className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
    >
      <ArrowLeft size={15} /> Back to Verification Queue
    </button>
  );
}
