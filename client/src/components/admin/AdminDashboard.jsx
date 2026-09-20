import React, { useState, useEffect, useCallback } from 'react';
import adminService from '../../services/adminService.js';
import LoadingSpinner from '../common/LoadingSpinner.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';

const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'];
const MODERATION_STATUSES = ['ACTIVE', 'HIDDEN', 'REMOVED'];

export const AdminDashboard = () => {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [moderationNote, setModerationNote] = useState('');

  const loadReports = useCallback(async (pageNum = 1, status = filter) => {
    try {
      if (pageNum === 1) setIsLoading(true);
      setError(null);
      const res = await adminService.listReports({ status, page: pageNum, limit: 20 });
      const newReports = res?.data?.reports || [];
      setReports((prev) => pageNum === 1 ? newReports : [...prev, ...newReports]);
      setHasMore(res?.data?.pagination?.hasNextPage || false);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setPage(1);
    loadReports(1, filter);
  }, [filter]);

  const handleUpdateStatus = async (reportId, newStatus) => {
    setProcessingIds((prev) => new Set([...prev, reportId]));
    try {
      await adminService.updateReportStatus(reportId, {
        status: newStatus,
        moderationNote: moderationNote.trim() || undefined,
      });
      setReports((prev) => prev.map((r) =>
        r._id === reportId ? { ...r, status: newStatus } : r
      ));
      setModerationNote('');
    } catch (err) {
      setError(err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(reportId);
        return next;
      });
    }
  };

  const handleModerateContent = async (report) => {
    const targetType = report.targetType?.toLowerCase();
    if (!targetType) return;
    try {
      if (targetType === 'post') {
        await adminService.moderatePost(report.targetId, { status: 'REMOVED', reason: 'Admin action via report' });
      } else if (targetType === 'comment') {
        await adminService.moderateComment(report.targetId, { status: 'REMOVED', reason: 'Admin action via report' });
      } else if (targetType === 'story') {
        await adminService.moderateStory(report.targetId, { status: 'REMOVED', reason: 'Admin action via report' });
      }
      await handleUpdateStatus(report._id, 'RESOLVED');
    } catch (err) {
      setError(err);
    }
  };

  if (isLoading) return <LoadingSpinner message="Loading admin dashboard…" size="large" />;

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <div className="admin-filter-row">
          {REPORT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn-sm${filter === s ? ' btn-primary' : ' btn-outline'}`}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      {reports.length === 0 && !error && (
        <div className="empty-state">
          <p>No {filter.toLowerCase()} reports.</p>
        </div>
      )}

      <div className="admin-reports-list">
        {reports.map((report) => (
          <div key={report._id} className="admin-report-card">
            <div className="report-meta">
              <span className={`report-status report-status--${report.status?.toLowerCase()}`}>
                {report.status}
              </span>
              <span className="report-target">
                {report.targetType}: <code>{report.targetId}</code>
              </span>
              <span className="report-reason">{report.reason?.replace(/_/g, ' ')}</span>
            </div>

            {report.description && (
              /* Plain text — reporter-supplied description */
              <p className="report-description">{report.description}</p>
            )}

            {report.status === 'OPEN' || report.status === 'REVIEWING' ? (
              <div className="report-actions">
                <input
                  type="text"
                  className="form-input form-input--sm"
                  placeholder="Moderation note (optional)"
                  value={moderationNote}
                  onChange={(e) => setModerationNote(e.target.value)}
                  maxLength={500}
                />
                <div className="report-action-buttons">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => handleUpdateStatus(report._id, 'REVIEWING')}
                    disabled={processingIds.has(report._id)}
                  >
                    Mark Reviewing
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => handleModerateContent(report)}
                    disabled={processingIds.has(report._id)}
                  >
                    Remove Content + Resolve
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => handleUpdateStatus(report._id, 'DISMISSED')}
                    disabled={processingIds.has(report._id)}
                  >
                    Dismiss
                  </button>
                  {processingIds.has(report._id) && <LoadingSpinner size="small" />}
                </div>
              </div>
            ) : (
              <div className="report-resolved-note">
                <span>Resolved: {report.status}</span>
                {report.moderationNote && <span> — {report.moderationNote}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="load-more-center">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              loadReports(next, filter);
            }}
          >
            Load more reports
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
