import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { reportsAPI } from '../api';
import {
  FileText, Filter, Trash2, ExternalLink, Calendar,
  ChevronLeft, ChevronRight, Search, X, CheckSquare,
  AlertTriangle, CheckCircle2, User, ArrowLeftRight, Clock,
  Download,
} from 'lucide-react';
import toast from 'react-hot-toast';

function confClass(score) {
  if (score >= 0.8)  return 'conf-high';
  if (score >= 0.55) return 'conf-medium';
  return 'conf-low';
}

function confLevel(score) {
  if (score >= 0.8)  return 'HIGH';
  if (score >= 0.55) return 'MEDIUM';
  return 'LOW';
}

export default function Reports() {
  const navigate = useNavigate();
  const [reports,       setReports]       = useState([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [imageType,     setImageType]     = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search,        setSearch]        = useState('');
  const [query,         setQuery]         = useState('');   // debounced
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState(new Set());
  const [selecting,     setSelecting]     = useState(false);
  const perPage = 9;

  // Debounce search input → query
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = query.trim()
        ? await reportsAPI.searchReports(query, page, perPage)
        : await reportsAPI.listReports(
            page,
            perPage,
            imageType || null,
            urgencyFilter || null,
            statusFilter || null
          );
      setReports(res.data.reports);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [page, imageType, urgencyFilter, statusFilter, query, perPage]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Single delete
  const handleDelete = async (id, e) => {
    e.preventDefault();
    if (!window.confirm(`Delete report #${id}?`)) return;
    try {
      await reportsAPI.deleteReport(id);
      toast.success('Report deleted');
      fetchReports();
    } catch {
      toast.error('Delete failed');
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} selected report(s)?`)) return;
    try {
      const res = await reportsAPI.bulkDelete([...selected]);
      toast.success(res.data.message);
      setSelected(new Set());
      setSelecting(false);
      fetchReports();
    } catch {
      toast.error('Bulk delete failed');
    }
  };

  // Compare 2 selected reports
  const handleCompareSelected = () => {
    if (selected.size !== 2) return;
    const [id1, id2] = [...selected];
    navigate(`/reports/${id1}?compare=${id2}`);
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="reports-page">
      {/* Header */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Radiology Archives &amp; History</h1>
          <p className="page-description">
            {total > 0 ? `${total} study record${total !== 1 ? 's' : ''} available` : 'Archive of all AI-evaluated imaging studies and clinical reports'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div className="search-bar-wrapper">
            <Search className="search-bar-icon" size={15} />
            <input
              className="search-input"
              type="text"
              placeholder="Search MRN, findings, conclusion…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Modality Filter Dropdown */}
          {!query && (
            <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.35rem 0.65rem' }}>
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              <select
                value={imageType}
                onChange={e => { setImageType(e.target.value); setPage(1); }}
                className="filter-select"
                style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }}
              >
                <option value="" style={{ background: '#0b1120' }}>All Modalities</option>
                <option value="chest_xray" style={{ background: '#0b1120' }}>Chest X-Ray</option>
                <option value="ct_scan" style={{ background: '#0b1120' }}>CT Scan</option>
                <option value="mri" style={{ background: '#0b1120' }}>MRI</option>
                <option value="other" style={{ background: '#0b1120' }}>Other</option>
              </select>
            </div>
          )}

          {/* Batch CSV Export */}
          <button
            className="btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            onClick={() => {
              reportsAPI.exportAllCSV();
              toast.success('Downloading full radiology archive CSV…');
            }}
            title="Download complete database archive as CSV"
          >
            <Download size={14} /> Export CSV
          </button>

          {/* Select mode toggle */}
          <button
            className="btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            onClick={() => { setSelecting(s => !s); setSelected(new Set()); }}
          >
            {selecting ? <><X size={14} /> Cancel</> : <><CheckSquare size={14} /> Select / Compare</>}
          </button>
        </div>
      </div>

      {/* Urgency & Status Filter Pills */}
      {!query && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <div className="filter-pills-row">
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginRight: '0.25rem' }}>Triage:</span>
            <button
              className={`filter-pill ${urgencyFilter === '' ? 'active' : ''}`}
              onClick={() => { setUrgencyFilter(''); setPage(1); }}
            >
              All Triage
            </button>
            <button
              className={`filter-pill pill-stat ${urgencyFilter === 'stat_urgent' ? 'active' : ''}`}
              onClick={() => { setUrgencyFilter(urgencyFilter === 'stat_urgent' ? '' : 'stat_urgent'); setPage(1); }}
            >
              <AlertTriangle size={12} /> STAT Critical
            </button>
            <button
              className={`filter-pill pill-attention ${urgencyFilter === 'attention' ? 'active' : ''}`}
              onClick={() => { setUrgencyFilter(urgencyFilter === 'attention' ? '' : 'attention'); setPage(1); }}
            >
              <AlertTriangle size={12} /> Attention
            </button>
            <button
              className={`filter-pill ${urgencyFilter === 'normal' ? 'active' : ''}`}
              onClick={() => { setUrgencyFilter(urgencyFilter === 'normal' ? '' : 'normal'); setPage(1); }}
            >
              <CheckCircle2 size={12} /> Routine
            </button>
          </div>

          <div className="filter-pills-row">
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginRight: '0.25rem' }}>Certification:</span>
            <button
              className={`filter-pill ${statusFilter === '' ? 'active' : ''}`}
              onClick={() => { setStatusFilter(''); setPage(1); }}
            >
              All
            </button>
            <button
              className={`filter-pill ${statusFilter === 'finalized' ? 'active' : ''}`}
              onClick={() => { setStatusFilter(statusFilter === 'finalized' ? '' : 'finalized'); setPage(1); }}
            >
              <CheckCircle2 size={12} /> Signed &amp; Finalized
            </button>
            <button
              className={`filter-pill ${statusFilter === 'preliminary' ? 'active' : ''}`}
              onClick={() => { setStatusFilter(statusFilter === 'preliminary' ? '' : 'preliminary'); setPage(1); }}
            >
              <Clock size={12} /> Preliminary
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="reports-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton skeleton-card" style={{ animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="section-card empty-state">
          <FileText size={48} className="empty-icon" />
          <h3>{query ? 'No matching reports found' : 'No radiology studies on record'}</h3>
          <p>{query ? `No archive entries match query "${query}"` : 'Upload an imaging study to generate an ACR-compliant automated report.'}</p>
          {!query && <Link to="/upload" className="btn-primary" style={{ marginTop: '0.5rem' }}>Upload New Image</Link>}
        </div>
      ) : (
        <>
          <div className="reports-grid">
            {reports.map((r, i) => {
              const conf  = Math.round(r.confidence_score * 100);
              const cls   = confClass(r.confidence_score);
              const isSelected = selected.has(r.id);
              const isStat = r.urgency_level === 'stat_urgent';
              const isAttn = r.urgency_level === 'attention';
              const isFinal = r.status === 'finalized';

              return (
                <div
                  key={r.id}
                  className={`report-card ${cls} ${selecting && isSelected ? 'selected' : ''}`}
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    cursor: selecting ? 'pointer' : 'default',
                    borderTop: isStat ? '2px solid #f43f5e' : undefined,
                  }}
                  onClick={selecting ? () => toggleSelect(r.id) : undefined}
                >
                  {/* Select indicator */}
                  {selecting && (
                    <div className={`select-checkbox ${isSelected ? 'checked' : ''}`} style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                      {isSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                    </div>
                  )}

                  <div className="report-card-header" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="badge-id">#{r.id}</span>
                      <span className={`card-urgency-badge ${r.urgency_level || 'normal'}`}>
                        {isStat ? '🚨 STAT' : isAttn ? '⚠️ ATTN' : 'ROUTINE'}
                      </span>
                      <span className={`card-status-pill ${r.status || 'preliminary'}`}>
                        {isFinal ? 'FINAL' : 'PRELIM'}
                      </span>
                    </div>

                    <span className={`confidence-pill ${cls}`}>
                      {conf}% · {r.confidence_level ?? confLevel(r.confidence_score)}
                    </span>
                  </div>

                  <div className="report-card-body">
                    {/* Patient MRN info */}
                    <div className="card-patient-badge">
                      <User size={12} style={{ color: 'var(--cyan)' }} />
                      <span style={{ color: '#f1f5f9' }}>{r.patient_name || 'Patient'}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem' }}>
                        [{r.patient_id || `MRN-${r.id}`}]
                      </span>
                    </div>

                    <h3 className="report-filename">{r.original_filename}</h3>
                    <div className="report-meta">
                      <span><Calendar size={12} />{new Date(r.created_at).toLocaleDateString()}</span>
                      <span className="tag-type">{r.image_type.replace('_', ' ')}</span>
                    </div>
                    <p className="report-snippet">
                      <strong>Findings:</strong> {r.findings}
                    </p>
                  </div>

                  <div className="report-card-footer">
                    <Link to={`/reports/${r.id}`} className="btn-card-action" onClick={e => selecting && e.preventDefault()}>
                      <ExternalLink size={14} /> Clinical PACS &amp; Report
                    </Link>
                    {!selecting && (
                      <button className="btn-card-delete" onClick={e => handleDelete(r.id, e)} title="Delete">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-pagination">
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="pagination-info">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="btn-pagination">
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Bulk & Comparison Action Bar */}
      {selecting && selected.size > 0 && (
        <div className="bulk-bar" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="bulk-count">{selected.size} study item(s) selected</span>

          {selected.size === 2 && (
            <button
              className="btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.82rem', background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }}
              onClick={handleCompareSelected}
            >
              <ArrowLeftRight size={14} /> Compare 2 Selected Studies
            </button>
          )}

          <button className="btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }} onClick={handleBulkDelete}>
            <Trash2 size={14} /> Delete Selected
          </button>
          <button className="btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem' }} onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
