import { useState, useEffect } from 'react';
import { healthAPI } from '../api';
import { BookOpen, Search, X, Volume2, Copy, Check, AlertCircle, ShieldAlert, Heart } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MedicalGlossaryModal({ isOpen, onClose }) {
  const [terms, setTerms] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [copiedTerm, setCopiedTerm] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const res = await healthAPI.getGlossary();
        setTerms(res.data.terms || []);
      } catch {
        toast.error('Failed to load medical glossary');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  const categories = ['ALL', ...new Set(terms.map((t) => t.category))];

  const filtered = terms.filter((item) => {
    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
    if (!search.trim()) return matchesCat;
    const q = search.toLowerCase();
    const matchesText =
      item.term.toLowerCase().includes(q) ||
      item.plain_english.toLowerCase().includes(q) ||
      item.clinical_significance.toLowerCase().includes(q);
    return matchesCat && matchesText;
  });

  const handleCopy = (item) => {
    const text = `${item.term} (${item.pronunciation}):\n${item.plain_english}\nClinical Significance: ${item.clinical_significance}`;
    navigator.clipboard.writeText(text);
    setCopiedTerm(item.term);
    toast.success(`Copied plain explanation for "${item.term}"`);
    setTimeout(() => setCopiedTerm(null), 2000);
  };

  const getSeverityBadge = (ctx) => {
    if (ctx === 'critical') {
      return <span style={{ background: 'rgba(244, 63, 94, 0.2)', color: '#fb7185', border: '1px solid #f43f5e', fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>🚨 Critical Sign</span>;
    }
    if (ctx === 'abnormal') {
      return <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid #f59e0b', fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>⚠️ Pathological Finding</span>;
    }
    if (ctx === 'anatomy') {
      return <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>🫁 Normal Anatomy</span>;
    }
    return <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>✅ Normal Baseline</span>;
  };

  return (
    <div
      className="dicom-modal-overlay no-print"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="dicom-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '88vh',
          background: '#0a0f1d',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.2rem 1.5rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#0d1527',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--cyan)',
              }}
            >
              <BookOpen size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff', fontWeight: 700 }}>
                Radiology &amp; Medical Jargon Explainer
              </h3>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Plain-English dictionary of anatomical landmarks, pathological signs, and findings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '0.35rem 0.6rem', borderRadius: '6px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid #1e293b', background: '#090e1c' }}>
          <div style={{ position: 'relative', marginBottom: '0.65rem' }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search medical term (e.g. consolidation, opacity, atelectasis, pneumothorax)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: '#050811',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                color: '#f8fafc',
                padding: '0.6rem 0.85rem 0.6rem 2.4rem',
                fontSize: '0.85rem',
              }}
            />
          </div>

          {/* Category Chips */}
          <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: '0.2rem' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  background: selectedCategory === cat ? 'var(--cyan)' : '#0f172a',
                  color: selectedCategory === cat ? '#000' : '#94a3b8',
                  border: '1px solid',
                  borderColor: selectedCategory === cat ? 'var(--cyan)' : '#1e293b',
                  borderRadius: '14px',
                  padding: '0.2rem 0.65rem',
                  fontSize: '0.72rem',
                  fontWeight: selectedCategory === cat ? 700 : 500,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Term Cards List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }} />
              Loading medical dictionary…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <AlertCircle size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No medical terms match "{search}"</p>
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.term}
                style={{
                  background: '#0d1424',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '1rem 1.2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  transition: 'border-color 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0284c7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#fff', fontWeight: 700 }}>
                      {item.term}
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'var(--mono)', fontStyle: 'italic' }}>
                      [{item.pronunciation}]
                    </span>
                    {getSeverityBadge(item.severity_context)}
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }}
                    onClick={() => handleCopy(item)}
                    title="Copy plain explanation"
                  >
                    {copiedTerm === item.term ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy Layperson Text</>}
                  </button>
                </div>

                <div style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.55 }}>
                  <strong style={{ color: 'var(--cyan)' }}>Plain English: </strong>
                  {item.plain_english}
                </div>

                <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5, background: 'rgba(0,0,0,0.2)', padding: '0.45rem 0.75rem', borderRadius: '6px' }}>
                  <strong style={{ color: '#cbd5e1' }}>Clinical Meaning: </strong>
                  {item.clinical_significance}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0.75rem 1.5rem',
            borderTop: '1px solid #1e293b',
            background: '#090e1c',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>Showing {filtered.length} of {terms.length} terms</span>
          <span>Sourced from ACR Appropriateness &amp; Fleischner Society criteria</span>
        </div>
      </div>
    </div>
  );
}
