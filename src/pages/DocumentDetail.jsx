import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import {
  MockExtractionBanner,
  ExtractedFieldsPanel,
  CompliancePanel,
  FlagsPanel,
} from '../components/documents/DocumentPanels';
import { getDocumentDetail, deleteDocument } from '../services/documentService';
import { useRole } from '../context/RoleContext';
import { formatDate } from '../utils/date';

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
    >
      <ArrowLeft size={15} /> Back to Documents
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

function formatSize(kb) {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

export default function DocumentDetail() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { role, roleDetails } = useRole();
  const actor = roleDetails?.demoUser?.name ?? 'Unknown';

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const doc = useMemo(() => getDocumentDetail(documentId, role), [documentId, role]);

  if (!doc) {
    return (
      <div>
        <BackButton onClick={() => navigate('/documents')} />
        <EmptyState title="Document not found" description={`No document matches ID ${documentId} in your scope.`} />
      </div>
    );
  }

  const remove = () => {
    try {
      deleteDocument({ documentId: doc.id, actor, role });
      navigate('/documents', { state: { notice: `${doc.fileName} was deleted.` } });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <BackButton onClick={() => navigate('/documents')} />

      <PageHeader
        title={doc.fileName}
        subtitle={`${doc.id} · ${doc.typeLabel}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={doc.status} />
            <StatusBadge status={doc.validityStatus} />
          </div>
        }
      />

      <MockExtractionBanner />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExtractedFieldsPanel doc={doc} />
        <CompliancePanel doc={doc} />
      </div>

      <div className="mt-4">
        <FlagsPanel doc={doc} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card title="Document Details">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="File name">
              <span className="break-all">{doc.fileName}</span>
            </Field>
            <Field label="File type · size">
              {doc.fileType} · {formatSize(doc.fileSizeKB)}
            </Field>
            <Field label="Uploaded by">
              {doc.uploadedBy}
              <div className="text-xs text-text-secondary">{doc.uploadedByRole}</div>
            </Field>
            <Field label="Upload date">{formatDate(doc.uploadedDate)}</Field>
            <Field label="Extraction method">
              <span className="text-xs">{doc.extractionLabel}</span>
            </Field>
          </dl>
        </Card>

        <div className="space-y-4">
          <Card title="Linked Records">
            {doc.relatedIssue || doc.relatedInspection ? (
              <ul className="space-y-2 text-sm">
                {doc.relatedIssue && (
                  <li>
                    <Link to={`/issues/${doc.relatedIssue.id}`} className="hover:text-amber">
                      {doc.relatedIssue.title}
                    </Link>
                    <div className="text-xs font-mono text-text-secondary">{doc.relatedIssue.id}</div>
                  </li>
                )}
                {doc.relatedInspection && (
                  <li>
                    <span className="text-xs font-mono text-text-secondary">Inspection {doc.relatedInspection.id}</span>
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-text-secondary">
                {doc.hiddenRelatedCount > 0
                  ? 'This document is linked to a record you do not have access to.'
                  : 'This document is not linked to an inspection or issue.'}
              </p>
            )}
          </Card>

          {doc.canDelete && (
            <Card title="Administration">
              <button
                onClick={() => {
                  setError('');
                  setConfirmDelete(true);
                }}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-btn text-sm border border-risk-high text-risk-high hover:bg-elevated"
              >
                <Trash2 size={14} aria-hidden="true" /> Delete document
              </button>
            </Card>
          )}
        </div>
      </div>

      {confirmDelete && (
        <Modal
          title="Delete document"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button
                onClick={() => setConfirmDelete(false)}
                className="h-9 px-3 rounded-btn text-sm border border-border hover:bg-elevated"
              >
                Cancel
              </button>
              <button
                onClick={remove}
                className="h-9 px-3 rounded-btn text-sm bg-risk-high text-surface font-medium hover:opacity-90"
              >
                Delete document
              </button>
            </>
          }
        >
          <p className="text-sm text-text-secondary">
            Delete <span className="text-text-primary">{doc.fileName}</span> from the register? This is recorded in the
            audit trail.
          </p>
          {error && <p className="text-xs text-risk-critical mt-2" role="alert">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
