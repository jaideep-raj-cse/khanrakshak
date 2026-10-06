import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, TrendingUp, PauseCircle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import KpiCard from '../components/ui/KpiCard';
import RiskBadge from '../components/ui/RiskBadge';
import StatusBadge from '../components/ui/StatusBadge';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import Timeline from '../components/ui/Timeline';
import Modal from '../components/ui/Modal';
import {
  getContractorDetail,
  buildContractorTimeline,
  suspendContract,
  reinstateContract,
  updateContractorRemarks,
  CONTRACT_STATUS,
  REMARKS_MAX_LENGTH,
  toLocalISODate,
} from '../services/contractorService';
import { getMineById } from '../services/dataService';
import { canViewMine } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';
import { formatDate } from '../utils/date';

const RISK_ORDER = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
const BAR_COLOR = {
  LOW: 'bg-risk-low',
  MODERATE: 'bg-risk-moderate',
  HIGH: 'bg-risk-high',
  CRITICAL: 'bg-risk-critical',
};

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
    >
      <ArrowLeft size={15} /> Back to Contractors
    </button>
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

function contractTermNote(detail) {
  if (detail.contractStatus === CONTRACT_STATUS.UPCOMING || detail.contractDaysRemaining === null) return null;
  const d = detail.contractDaysRemaining;
  if (d < 0) return `Ended ${-d} day${d === -1 ? '' : 's'} ago`;
  return `${d} day${d === 1 ? '' : 's'} remaining`;
}

// Findings per month. Bars are findings first observed that month, coloured by the highest
// CURRENT risk level among them (no historical risk scores exist in the data model).
function FindingsTrend({ trend }) {
  const total = trend.months.reduce((n, m) => n + m.findings, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No findings recorded"
        description="Findings linked to this contractor will appear here by month once they are logged."
      />
    );
  }
  const summary = trend.months.map((m) => `${m.fullLabel}: ${m.findings}`).join(', ');
  return (
    <div>
      <div className="flex items-end gap-3 h-24" role="img" aria-label={`Findings per month. ${summary}`}>
        {trend.months.map((m) => (
          <div key={m.key} className="flex-1 h-full flex items-end">
            <div
              className={`w-full rounded-t-btn ${m.findings ? BAR_COLOR[m.peakLevel] ?? 'bg-amber' : 'bg-elevated'}`}
              style={{ height: m.findings ? `${Math.max(12, (m.findings / trend.maxFindings) * 100)}%` : '2px' }}
              title={`${m.fullLabel}: ${m.findings} finding${m.findings === 1 ? '' : 's'}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-2 border-t border-border pt-2">
        {trend.months.map((m) => (
          <div key={m.key} className="flex-1 text-center">
            <div className="font-mono text-sm">{m.findings}</div>
            <div className="text-[11px] text-text-secondary">{m.label}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-secondary mt-3">
        Findings first observed each month, last 6 months. Bar colour is the highest current risk level among them.
        {!trend.hasTrend && ' All findings so far fall in one month, so there is no trend line yet.'}
        {trend.outsideWindow > 0 && ` ${trend.outsideWindow} older finding${trend.outsideWindow === 1 ? ' is' : 's are'} not shown.`}
      </p>
    </div>
  );
}

export default function ContractorDetail() {
  const { contractorId } = useParams();
  const navigate = useNavigate();
  const { role, roleDetails } = useRole();
  const actor = roleDetails?.demoUser?.name ?? 'Unknown';

  // Bumped after a management action so the page re-reads local storage.
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState(null); // 'suspend' | 'reinstate' | 'remarks' | null
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const detail = useMemo(() => getContractorDetail(contractorId, role), [contractorId, role, version]);
  const timeline = useMemo(
    () => (detail ? buildContractorTimeline(detail, detail.linkedIssues) : []),
    [detail]
  );

  if (!detail) {
    return (
      <div>
        <BackButton onClick={() => navigate('/contractors')} />
        <EmptyState
          title="Contractor not found"
          description={`No contractor matches ID ${contractorId} in your scope.`}
        />
      </div>
    );
  }

  const isSuspended = detail.contractStatus === CONTRACT_STATUS.SUSPENDED;
  const termNote = contractTermNote(detail);

  const openModal = (kind) => {
    setError('');
    setNotice('');
    setText(kind === 'remarks' ? detail.remarks ?? '' : '');
    setModal(kind);
  };
  const closeModal = () => setModal(null);

  const runAction = (fn, successMessage) => {
    try {
      fn();
      setVersion((v) => v + 1);
      setNotice(successMessage);
      setModal(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const submitModal = () => {
    const base = { contractorId: detail.id, actor, role };
    if (modal === 'suspend') runAction(() => suspendContract({ ...base, reason: text }), 'Contract suspended.');
    if (modal === 'reinstate') runAction(() => reinstateContract(base), 'Contract reinstated.');
    if (modal === 'remarks') runAction(() => updateContractorRemarks({ ...base, remarks: text }), 'Remarks updated.');
  };

  const issueColumns = [
    {
      key: 'title',
      label: 'Issue',
      sortable: true,
      sortValue: (i) => i.title.toLowerCase(),
      render: (i) => (
        <div>
          {/* A real link (keyboard / open-in-new-tab friendly); stopPropagation so the row's
              own click handler doesn't navigate a second time. */}
          <Link
            to={`/issues/${i.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium max-w-xs block truncate hover:text-amber"
          >
            {i.title}
          </Link>
          <div className="text-xs font-mono text-text-secondary">
            {i.id} · {i.category}
          </div>
        </div>
      ),
    },
    {
      key: 'riskLevel',
      label: 'Risk',
      sortable: true,
      sortValue: (i) => RISK_ORDER[i.riskLevel] ?? 0,
      render: (i) => <RiskBadge level={i.riskLevel} />,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (i) => <StatusBadge status={i.status} overdue={i.overdue} />,
    },
    {
      key: 'observedDate',
      label: 'Observed',
      align: 'right',
      sortable: true,
      mono: true,
      render: (i) => <span className="font-mono text-xs text-text-secondary">{formatDate(i.observedDate)}</span>,
    },
  ];

  const modalConfig = {
    suspend: {
      title: 'Suspend contract',
      confirm: 'Suspend contract',
      body: 'Suspending marks the contract as Suspended on every list. Record why — the reason is kept in the audit trail.',
      input: { label: 'Reason', required: true },
    },
    reinstate: {
      title: 'Reinstate contract',
      confirm: 'Reinstate contract',
      body: `Reinstate ${detail.name}? Its status will return to the one derived from the contract dates.`,
      input: null,
    },
    remarks: {
      title: 'Edit remarks',
      confirm: 'Save remarks',
      body: null,
      input: { label: 'Remarks', required: false },
    },
  }[modal];

  return (
    <div>
      <BackButton onClick={() => navigate('/contractors')} />

      <PageHeader
        title={detail.name}
        subtitle={`${detail.id} · ${detail.workArea}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={detail.complianceStatus} />
            <RiskBadge level={detail.riskLevel} />
            <StatusBadge status={detail.contractStatus} />
          </div>
        }
      />

      {isSuspended && detail.suspension && (
        <div className="flex items-start gap-3 bg-surface border border-risk-high rounded-card px-4 py-3 mb-4">
          <PauseCircle size={18} className="text-risk-high shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Contract suspended</div>
            <p className="text-text-secondary text-xs mt-0.5">
              {detail.suspension.by} ({detail.suspension.role}) on {formatDate(toLocalISODate(detail.suspension.at))}.
              Reason: {detail.suspension.reason}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Open Violations"
          value={detail.openViolations}
          accent={detail.openViolations > 0 ? 'amber' : 'low'}
          hint={`${detail.totalFindings} linked finding${detail.totalFindings === 1 ? '' : 's'} in total`}
        />
        <KpiCard
          label="Safety Incidents"
          value={detail.safetyIncidents}
          accent={detail.safetyIncidents > 0 ? 'high' : 'low'}
          hint="Safety-domain or severity 4–5 findings"
        />
        <KpiCard
          label="Compliance Score"
          value={`${detail.complianceScore}/100`}
          accent={detail.riskLevel === 'LOW' ? 'low' : detail.riskLevel === 'MODERATE' ? 'moderate' : detail.riskLevel === 'HIGH' ? 'high' : 'critical'}
        />
        <KpiCard label="Workforce" value={detail.workforceSize} accent="neutral" hint="Workers on site" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Contractor Profile">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="Work area">{detail.workArea}</Field>
            <Field label="Contact person">{detail.contactPerson ?? '—'}</Field>
            <Field label="Contract period">
              {formatDate(detail.contractStart)} – {formatDate(detail.contractEnd)}
              {termNote && <div className="text-xs text-text-secondary">{termNote}</div>}
            </Field>
            <Field label="Last compliance audit">{formatDate(detail.lastAuditDate)}</Field>
            <Field label="Licence">
              <span className="font-mono text-xs">{detail.licenseNumber}</span>
              <div
                className={`text-xs ${
                  detail.licence.status === 'LAPSED'
                    ? 'text-risk-critical'
                    : detail.licence.status === 'EXPIRING'
                    ? 'text-risk-moderate'
                    : 'text-text-secondary'
                }`}
              >
                {detail.licence.label}
              </div>
            </Field>
            <Field label="Remarks">{detail.remarks || '—'}</Field>
          </dl>
        </Card>

        <div className="space-y-4">
          <Card title={detail.mines.length === 1 ? 'Assigned Mine' : 'Assigned Mines'}>
            <ul className="divide-y divide-elevated -my-2">
              {detail.mines.map((m) => {
                const mine = getMineById(m.id);
                const label = (
                  <>
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-xs font-mono text-text-secondary">
                      {m.id}
                      {mine?.region ? ` · ${mine.region}` : ''}
                    </div>
                  </>
                );
                return (
                  <li key={m.id} className="py-2">
                    {canViewMine(role, m.id) ? (
                      <Link to={`/mines/${m.id}`} className="block hover:text-amber">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Contract Management">
            {notice && <p className="text-xs text-risk-low mb-3" role="status">{notice}</p>}
            {detail.canManage ? (
              <div className="flex flex-wrap gap-2">
                {isSuspended ? (
                  <button
                    onClick={() => openModal('reinstate')}
                    className="h-9 px-3 rounded-btn text-sm bg-amber text-surface font-medium hover:bg-amber-base"
                  >
                    Reinstate contract
                  </button>
                ) : (
                  <button
                    onClick={() => openModal('suspend')}
                    className="h-9 px-3 rounded-btn text-sm border border-risk-high text-risk-high hover:bg-elevated"
                  >
                    Suspend contract
                  </button>
                )}
                <button
                  onClick={() => openModal('remarks')}
                  className="h-9 px-3 rounded-btn text-sm border border-border hover:bg-elevated"
                >
                  Edit remarks
                </button>
              </div>
            ) : (
              <p className="text-xs text-text-secondary">
                {role === ROLES.ADMINISTRATOR || role === ROLES.MINE_MANAGER
                  ? 'You do not manage this contractor.'
                  : 'View only. Contractors are managed by the Mine Manager of the mine and by Administrators.'}
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card title="Linked Issues" className="mt-4">
        <div className="-m-4">
          <DataTable
            columns={issueColumns}
            rows={detail.linkedIssues}
            getRowKey={(i) => i.id}
            onRowClick={(i) => navigate(`/issues/${i.id}`)}
            emptyState={{
              icon: AlertTriangle,
              title: detail.hiddenIssueCount > 0 ? 'No linked issues you can open' : 'No linked issues',
              description:
                detail.hiddenIssueCount > 0
                  ? 'Findings linked to this contractor were reported by other officers.'
                  : 'No inspection findings have been linked to this contractor.',
            }}
          />
        </div>
        {detail.hiddenIssueCount > 0 && detail.linkedIssues.length > 0 && (
          <p className="text-xs text-text-secondary mt-6">
            {detail.hiddenIssueCount} more linked finding{detail.hiddenIssueCount === 1 ? '' : 's'} reported by other
            officers {detail.hiddenIssueCount === 1 ? 'is' : 'are'} not shown to your role.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card title="Findings Trend">
          <FindingsTrend trend={detail.trend} />
        </Card>
        <Card title="Contractor Timeline">
          <Timeline events={timeline} />
        </Card>
      </div>

      {modal && modalConfig && (
        <Modal
          title={modalConfig.title}
          onClose={closeModal}
          footer={
            <>
              <button
                onClick={closeModal}
                className="h-9 px-3 rounded-btn text-sm border border-border hover:bg-elevated"
              >
                Cancel
              </button>
              <button
                onClick={submitModal}
                disabled={!!modalConfig.input?.required && !text.trim()}
                className="h-9 px-3 rounded-btn text-sm bg-amber text-surface font-medium hover:bg-amber-base disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {modalConfig.confirm}
              </button>
            </>
          }
        >
          {modalConfig.body && <p className="text-sm text-text-secondary mb-3">{modalConfig.body}</p>}
          {modalConfig.input && (
            <label className="block text-xs text-text-secondary">
              {modalConfig.input.label}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={REMARKS_MAX_LENGTH}
                rows={4}
                className="mt-1 w-full bg-bg border border-border rounded-input p-2 text-sm text-text-primary outline-none focus:border-amber"
              />
            </label>
          )}
          {error && <p className="text-xs text-risk-critical mt-2" role="alert">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
