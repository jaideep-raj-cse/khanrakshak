// Run from the project root:  npm run test:documents:ui
// Drives the REAL pages (App + router + RoleProvider, exactly as main.jsx wires them, including
// StrictMode) in jsdom: upload → processing → extraction → flag → detail navigation.
// Uses real timers, so the staged "processing" screen is exercised as a user would see it.
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { RoleProvider } from '../../src/context/RoleContext.jsx';
import { ensureSeeded } from '../../src/services/seedService.js';
import { getAuditLog } from '../../src/services/auditService.js';
import { getDocuments } from '../../src/services/dataService.js';
import { ROLES } from '../../src/data/roles.js';

const LABEL = 'Document Intelligence — Mock Extraction (Prototype)';

function open(path, role) {
  window.localStorage.clear();
  ensureSeeded();
  window.localStorage.setItem('khanrakshak:currentRole', JSON.stringify(role));
  return render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <RoleProvider>
          <App />
        </RoleProvider>
      </MemoryRouter>
    </React.StrictMode>
  );
}

const pdf = (name, bytes = 200 * 1024) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
const table = () => screen.getByRole('table');
const bodyRows = () => within(table()).getAllByRole('row').slice(1);
const rowTexts = () => bodyRows().map((r) => r.textContent);
const FINISH = { timeout: 10000 };

beforeEach(() => cleanup());

describe('Documents list', () => {
  it('shows the mock label, the six table columns and role-scoped rows (Mine Manager)', async () => {
    open('/documents', ROLES.MINE_MANAGER);
    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeTruthy();
    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(screen.getByText(/No OCR is performed and no file contents are read/)).toBeTruthy();
    const heads = within(table()).getAllByRole('columnheader').map((h) => h.textContent);
    ['File Name', 'Type', 'Mine', 'Upload Date', 'Status', 'Validity'].forEach((h) => expect(heads).toContain(h));
    expect(bodyRows()).toHaveLength(2); // Jharia Colliery No. 4 only
    expect(rowTexts().join(' ')).toMatch(/JHR04_Mining_Lease_DEMO\.pdf/);
    expect(rowTexts().join(' ')).not.toMatch(/TAL02/);
  });

  it('searches, filters and sorts (Compliance Officer sees all 10)', async () => {
    const user = userEvent.setup();
    open('/documents', ROLES.COMPLIANCE_OFFICER);
    await screen.findByRole('heading', { name: 'Documents' });
    expect(bodyRows()).toHaveLength(10);

    // search
    await user.type(screen.getByPlaceholderText(/Search file, mine, type/), 'ventilation');
    expect(bodyRows()).toHaveLength(1);
    expect(rowTexts()[0]).toMatch(/RAN03_Ventilation_Survey_DEMO\.pdf/);
    await user.clear(screen.getByPlaceholderText(/Search file, mine, type/));
    expect(bodyRows()).toHaveLength(10);

    // filter: status = Flagged → 4
    await user.selectOptions(screen.getByLabelText('Status'), 'FLAGGED');
    expect(bodyRows()).toHaveLength(4);
    // combine with type, then empty state + clear
    await user.selectOptions(screen.getByLabelText('Type'), 'LICENSE');
    expect(screen.getByText('No documents match your filters')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(bodyRows()).toHaveLength(10);

    // sort by File Name ascending, then descending
    await user.click(within(table()).getByText('File Name'));
    const asc = bodyRows().map((r) => r.querySelector('a').textContent);
    expect(asc).toEqual([...asc].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    await user.click(within(table()).getByText('File Name'));
    expect(bodyRows().map((r) => r.querySelector('a').textContent)).toEqual([...asc].reverse());
  });

  it('opens a document by clicking its row', async () => {
    const user = userEvent.setup();
    open('/documents', ROLES.MINE_MANAGER);
    await screen.findByRole('heading', { name: 'Documents' });
    await user.click(bodyRows().find((r) => /JHR04_Mining_Lease_DEMO/.test(r.textContent)));
    expect(await screen.findByRole('heading', { name: 'JHR04_Mining_Lease_DEMO.pdf' })).toBeTruthy();
  });
});

describe('Upload → processing → extraction → flag → detail', () => {
  it('runs the whole flow as a Mine Manager and lands on the detail page', async () => {
    const user = userEvent.setup();
    open('/documents', ROLES.MINE_MANAGER);
    await screen.findByRole('heading', { name: 'Documents' });
    const auditBefore = getAuditLog().length;

    // 1. list → upload page
    await user.click(screen.getByRole('link', { name: /Upload document/ }));
    expect(await screen.findByRole('heading', { name: 'Upload Document' })).toBeTruthy();
    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(screen.getByLabelText('Mine').value).toBe('MINE-JHR-04'); // a manager with one mine has it preselected

    // 2. choose a file; the mock scenario is previewed up front
    await user.upload(screen.getByLabelText('Document file'), pdf('JHR04_Mining_Lease_Scan.pdf'));
    expect(screen.getByTestId('scenario-preview').textContent).toMatch(/Mining licence — validity lapsed.*matched from the file name/);

    // 3. submit → staged processing
    await user.click(screen.getByRole('button', { name: /Upload & run mock extraction/ }));
    const steps = await screen.findByRole('list', { name: 'Processing steps' });
    ['Uploading document', 'Processing…', 'Extracting information', 'Checking compliance status', 'Detecting potential issues'].forEach((t) =>
      expect(within(steps).getByText(t)).toBeTruthy()
    );
    expect(within(steps).getAllByRole('listitem')[0].getAttribute('data-state')).toBe('active');
    expect(screen.getByText(/Stay on this page until processing finishes/)).toBeTruthy();
    expect(getDocuments().some((d) => d.fileName === 'JHR04_Mining_Lease_Scan.pdf')).toBe(false); // nothing saved yet

    // 4. extraction finishes → fields, compliance, flags
    expect(await screen.findByTestId('result-file', {}, FINISH)).toBeTruthy();
    expect(screen.getByTestId('result-file').textContent).toBe('JHR04_Mining_Lease_Scan.pdf');
    within(steps).getAllByRole('listitem').forEach((li) => expect(li.getAttribute('data-state')).toBe('done'));
    const fields = screen.getByText('Extracted Fields (mock)').closest('div.bg-surface');
    ['Document Type', 'Issuing Authority', 'Mine Name / Reference', 'Issue Date', 'Expiry Date', 'License / Permit Number'].forEach((l) =>
      expect(within(fields).getByText(l)).toBeTruthy()
    );
    expect(within(fields).getByText('DEMO-ML-JHR04-0011')).toBeTruthy();
    expect(within(fields).getByText(/Demo Regulatory Authority \(fictional\)/)).toBeTruthy();
    expect(within(fields).getByText(/Nothing was read from the file/)).toBeTruthy();

    const compliance = screen.getByText('Compliance Information').closest('div.bg-surface');
    expect(within(compliance).getByText('Expired')).toBeTruthy();
    expect(within(compliance).getByText('Statutory Documentation')).toBeTruthy();
    expect(within(compliance).getByText('Jharia Colliery No. 4')).toBeTruthy();

    const flags = screen.getByText('Potential Issues (1)').closest('div.bg-surface');
    expect(within(flags).getByText('Expired document')).toBeTruthy();
    expect(within(flags).getByText('High')).toBeTruthy();

    // saved exactly once (StrictMode must not double-save), with one audit event
    expect(getDocuments().filter((d) => d.fileName === 'JHR04_Mining_Lease_Scan.pdf')).toHaveLength(1);
    expect(getAuditLog().length).toBe(auditBefore + 1);
    expect(getAuditLog()[0].action).toBe('Document Uploaded');

    // 5. open the detail page
    await user.click(screen.getByRole('button', { name: 'Open document detail' }));
    expect(await screen.findByRole('heading', { name: 'JHR04_Mining_Lease_Scan.pdf' })).toBeTruthy();
    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(screen.getByText('Potential Issues (1)')).toBeTruthy();
    expect(screen.getByText('Expired document')).toBeTruthy();
    expect(screen.getByText(/Mock extraction \(canned scenario\) — not OCR/)).toBeTruthy();
    const details = screen.getByText('Document Details').closest('div.bg-surface');
    expect(within(details).getByText('Sunita Rao')).toBeTruthy();
    expect(within(details).getByText('Mine Manager')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Delete document/ })).toBeNull(); // not an Administrator

    // 6. back on the list the new document is first, Flagged and Expired
    await user.click(screen.getByRole('button', { name: /Back to Documents/ }));
    await screen.findByRole('heading', { name: 'Documents' });
    expect(bodyRows()).toHaveLength(3);
    expect(rowTexts()[0]).toMatch(/JHR04_Mining_Lease_Scan\.pdf/);
    expect(rowTexts()[0]).toMatch(/Flagged/);
    expect(rowTexts()[0]).toMatch(/Expired/);
    expect(rowTexts()[0]).toMatch(/1 potential issue/);
  });

  it('plays back a different canned scenario per type (selected type beats the file name)', async () => {
    const user = userEvent.setup();
    open('/documents/upload', ROLES.COMPLIANCE_OFFICER);
    await screen.findByRole('heading', { name: 'Upload Document' });
    await user.selectOptions(screen.getByLabelText('Mine'), 'MINE-RAN-03');
    await user.selectOptions(screen.getByLabelText('Document type'), 'ENVIRONMENTAL');
    await user.upload(screen.getByLabelText('Document file'), pdf('anything_at_all.pdf'));
    expect(screen.getByTestId('scenario-preview').textContent).toMatch(/permit number not found.*from the selected type/);
    await user.click(screen.getByRole('button', { name: /Upload & run mock extraction/ }));
    await screen.findByTestId('result-file', {}, FINISH);
    expect(screen.getByText('Potential Issues (1)')).toBeTruthy();
    expect(screen.getByText('Missing required field: License / Permit Number')).toBeTruthy();
    expect(screen.getByText('Not found')).toBeTruthy();
    const compliance = screen.getByText('Compliance Information').closest('div.bg-surface');
    expect(within(compliance).getByText('Current')).toBeTruthy(); // validity is fine; the problem is the missing field
  });

  it('shows "No potential issues detected" for the clean scenario', async () => {
    const user = userEvent.setup();
    open('/documents/upload', ROLES.ADMINISTRATOR);
    await screen.findByRole('heading', { name: 'Upload Document' });
    await user.selectOptions(screen.getByLabelText('Mine'), 'MINE-RAN-03');
    await user.upload(screen.getByLabelText('Document file'), pdf('RAN03_Shotfirer_Certificates.pdf'));
    await user.click(screen.getByRole('button', { name: /Upload & run mock extraction/ }));
    await screen.findByTestId('result-file', {}, FINISH);
    expect(screen.getByText('No potential issues detected')).toBeTruthy();
    expect(screen.getByText('Processed')).toBeTruthy();
  });

  it('leaving mid-processing cancels the upload: nothing is saved and nothing fires later', async () => {
    const user = userEvent.setup();
    open('/documents/upload', ROLES.MINE_MANAGER);
    await screen.findByRole('heading', { name: 'Upload Document' });
    await user.upload(screen.getByLabelText('Document file'), pdf('JHR04_Mining_Lease_Scan.pdf'));
    await user.click(screen.getByRole('button', { name: /Upload & run mock extraction/ }));
    await screen.findByRole('list', { name: 'Processing steps' });
    const auditBefore = getAuditLog().length;

    await user.click(screen.getByRole('button', { name: /Back to Documents/ }));
    await screen.findByRole('heading', { name: 'Documents' });
    await new Promise((r) => setTimeout(r, 4000)); // longer than the whole processing run
    expect(getDocuments()).toHaveLength(10);
    expect(getAuditLog().length).toBe(auditBefore);
    expect(bodyRows()).toHaveLength(2);
  });

  it('validates inline: missing mine/file, unsupported type, unrecognised name', async () => {
    // applyAccept:false = the file picker's `accept` filter is bypassed, as it is by drag-and-drop
    // or an "All files" choice in a real browser, so our own validation is what's tested.
    const user = userEvent.setup({ applyAccept: false });
    open('/documents/upload', ROLES.COMPLIANCE_OFFICER);
    await screen.findByRole('heading', { name: 'Upload Document' });

    await user.click(screen.getByRole('button', { name: /Upload & run mock extraction/ }));
    expect(screen.getByText('Select the mine this document belongs to.')).toBeTruthy();
    expect(screen.getByText('Choose a file to upload.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Processing steps' })).toBeNull();

    await user.selectOptions(screen.getByLabelText('Mine'), 'MINE-RAN-03');
    await user.upload(screen.getByLabelText('Document file'), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByText(/Unsupported file type/)).toBeTruthy();

    await user.upload(screen.getByLabelText('Document file'), pdf('scan_0001.pdf'));
    expect(screen.queryByText(/Unsupported file type/)).toBeNull();
    expect(screen.getByText(/could not be recognised from the file name/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Document type'), 'SAFETY_CERTIFICATE');
    expect(screen.queryByText(/could not be recognised/)).toBeNull();
    expect(getDocuments()).toHaveLength(10); // nothing was saved by any of that
  });
});

describe('Roles and scope in the UI', () => {
  it('Field Officer: only assigned-mine documents, and cannot open another mine\'s document by URL', async () => {
    open('/documents', ROLES.FIELD_OFFICER);
    await screen.findByRole('heading', { name: 'Documents' });
    expect(bodyRows()).toHaveLength(4);
    expect(screen.getByRole('link', { name: /Upload document/ })).toBeTruthy();
    cleanup();

    open('/documents/DOC-2026-0003', ROLES.FIELD_OFFICER); // Jharia 12 — not assigned
    expect(await screen.findByText('Document not found')).toBeTruthy();
    cleanup();

    open('/documents/DOC-2026-0004', ROLES.FIELD_OFFICER); // Talcher — assigned
    expect(await screen.findByRole('heading', { name: 'TAL02_EC_Compliance_Report_DEMO.pdf' })).toBeTruthy();
  });

  it('Field Officer can only pick its assigned mines on the upload form', async () => {
    open('/documents/upload', ROLES.FIELD_OFFICER);
    await screen.findByRole('heading', { name: 'Upload Document' });
    const options = within(screen.getByLabelText('Mine')).getAllByRole('option').map((o) => o.value).filter(Boolean);
    expect(options.sort()).toEqual(['MINE-JHR-04', 'MINE-KOR-11', 'MINE-TAL-02']);
  });

  it('Compliance Officer can upload to any mine; Administrator sees all 10 mines', async () => {
    open('/documents/upload', ROLES.COMPLIANCE_OFFICER);
    await screen.findByRole('heading', { name: 'Upload Document' });
    expect(within(screen.getByLabelText('Mine')).getAllByRole('option').filter((o) => o.value)).toHaveLength(10);
  });

  it('Unknown document ID shows "Document not found"', async () => {
    open('/documents/DOC-9999-0000', ROLES.ADMINISTRATOR);
    expect(await screen.findByText('Document not found')).toBeTruthy();
  });

  it('"/documents/upload" is the upload page, not a document called "upload"', async () => {
    open('/documents/upload', ROLES.MINE_MANAGER);
    expect(await screen.findByRole('heading', { name: 'Upload Document' })).toBeTruthy();
    expect(screen.queryByText('Document not found')).toBeNull();
  });

  it('Administrator deletes a document from its detail page (confirm → list with notice → gone → audited)', async () => {
    const user = userEvent.setup();
    open('/documents/DOC-2026-0008', ROLES.ADMINISTRATOR);
    await screen.findByRole('heading', { name: 'BKR06_Wage_Attendance_Register_DEMO.pdf' });
    await user.click(screen.getByRole('button', { name: /Delete document/ }));
    const dialog = screen.getByText(/from the register\?/).closest('div.bg-surface');
    await user.click(within(dialog).getByRole('button', { name: 'Delete document' }));
    expect(await screen.findByText('BKR06_Wage_Attendance_Register_DEMO.pdf was deleted.')).toBeTruthy();
    expect(bodyRows()).toHaveLength(9);
    expect(getDocuments().some((d) => d.id === 'DOC-2026-0008')).toBe(false);
    expect(getAuditLog()[0].action).toBe('Document Deleted');
  });

  it('Seeded flagged document explains it is pre-filled, not extracted', async () => {
    open('/documents/DOC-2026-0003', ROLES.COMPLIANCE_OFFICER);
    await screen.findByRole('heading', { name: 'JHR12_Contract_Labour_Register_DEMO.pdf' });
    expect(screen.getByText(/Pre-filled demo values from the seed data/)).toBeTruthy();
    expect(screen.getByText('Potential Issues (2)')).toBeTruthy();
    expect(screen.getByText(/Headcount in the register \(118\)/)).toBeTruthy();
    expect(screen.getAllByText(/Not recorded/).length).toBeGreaterThan(0);
  });
});
