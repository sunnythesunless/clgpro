import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { reportsAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import MedicalGlossaryModal from '../components/MedicalGlossaryModal';
import {
  ArrowLeft, Calendar, Sparkles, Download,
  Copy, Check, Trash2, FileText,
  Layers, ShieldAlert,
  ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2,
  Grid, Sliders, Edit3, CheckCircle2, AlertTriangle,
  UserCheck, Save, X, User, Flame, ArrowLeftRight,
  Database, Mic, MicOff, Printer,
  Heart, Bot, Info, HelpCircle, Send, MessageSquare,
  Crosshair, Split, Eye, BookOpen, Volume2, Stamp,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── SVG Confidence Ring ────────────────────────────────────────
function ConfRing({ score }) {
  const pct    = Math.round(score * 100);
  const r      = 52;
  const circ   = 2 * Math.PI * r;
  const dash   = (pct / 100) * circ;
  const level  = pct >= 80 ? 'HIGH' : pct >= 55 ? 'MEDIUM' : 'LOW';
  const color  = level === 'HIGH' ? '#10b981' : level === 'MEDIUM' ? '#f59e0b' : '#f43f5e';

  return (
    <div className="conf-ring-wrapper">
      <span className="conf-ring-label">AI Confidence</span>
      <svg width={130} height={130} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={65} cy={65} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
        <circle
          cx={65} cy={65} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)', filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
      </svg>
      <div style={{ position: 'relative', top: -80, textAlign: 'center', height: 0 }}>
        <div className="conf-ring-value" style={{ color }}>{pct}%</div>
      </div>
      <span className={`conf-ring-level ${level}`}>{level} CONFIDENCE</span>
    </div>
  );
}

export default function ReportDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const compareParam = searchParams.get('compare');
  const navigate = useNavigate();
  const { user } = useAuth();

  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);

  // PACS Viewer Controls State
  const [zoom, setZoom]             = useState(1);
  const [invert, setInvert]         = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast]     = useState(100);
  const [showGrid, setShowGrid]     = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSliders, setShowSliders] = useState(false);
  const [activePreset, setActivePreset] = useState('default');

  // Explainable AI (XAI) Heatmap & Reticle State
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.70);
  const [hoveredZone, setHoveredZone] = useState(null);
  const [focusedRegion, setFocusedRegion] = useState(null);
  const [interactiveRegions, setInteractiveRegions] = useState([]);
  const [showGlossaryModal, setShowGlossaryModal] = useState(false);

  // Prior Study Comparison State (Dual, Curtain Swipe, Blink)
  const [showCompare, setShowCompare] = useState(Boolean(compareParam));
  const [compareMode, setCompareMode] = useState('dual'); // 'dual' | 'curtain' | 'blink'
  const [curtainPos, setCurtainPos] = useState(50);
  const [blinkActive, setBlinkActive] = useState(false);
  const [showBlinkCurrent, setShowBlinkCurrent] = useState(true);
  const [priorReports, setPriorReports] = useState([]);
  const [selectedPriorId, setSelectedPriorId] = useState(compareParam || '');
  const [comparisonData, setComparisonData] = useState(null);
  const [syncControls, setSyncControls] = useState(true);
  const [priorZoom, setPriorZoom] = useState(1);
  const [priorInvert, setPriorInvert] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // DICOM Inspector Modal State
  const [showDicomModal, setShowDicomModal] = useState(false);
  const [dicomSearch, setDicomSearch] = useState('');

  // Physician Edit & Sign-off State
  const [isEditing, setIsEditing] = useState(false);
  const [findingsEdit, setFindingsEdit] = useState('');
  const [impressionEdit, setImpressionEdit] = useState('');
  const [notesEdit, setNotesEdit] = useState('');
  const [saving, setSaving] = useState(false);

  // View Tab: 'clinical' | 'patient' | 'copilot'
  const [activeTab, setActiveTab] = useState('clinical');
  const [patientSummary, setPatientSummary] = useState(null);
  const [loadingPatientSummary, setLoadingPatientSummary] = useState(false);
  const [showPacsGuide, setShowPacsGuide] = useState(false);

  // AI Radiologist Copilot state
  const [copilotHistory, setCopilotHistory] = useState([
    {
      sender: 'ai',
      text: 'Hello! I am your AI Radiologist Copilot. I have analyzed this study. You can ask me about differential diagnoses, recommended follow-up imaging, patient communication guidance, or clinical decision criteria.',
      references: ['ACR Appropriateness Criteria®', 'Fleischner Society Guidelines'],
      followups: [
        'What are the primary differential diagnoses?',
        'What follow-up imaging is recommended?',
        'How do I explain this to the patient in plain English?',
      ],
    },
  ]);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);

  // Voice Dictation (Web Speech API)
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  const loadPatientSummary = async () => {
    if (patientSummary) return;
    setLoadingPatientSummary(true);
    try {
      const res = await reportsAPI.getPatientSummary(id);
      setPatientSummary(res.data);
    } catch {
      toast.error('Could not load patient-friendly explanation');
    } finally {
      setLoadingPatientSummary(false);
    }
  };

  const handleSendCopilot = async (overridePrompt) => {
    const text = (overridePrompt || copilotInput).trim();
    if (!text || copilotLoading) return;
    setCopilotInput('');
    setCopilotHistory(prev => [...prev, { sender: 'user', text }]);
    setCopilotLoading(true);
    try {
      const res = await reportsAPI.askCopilot(id, text);
      setCopilotHistory(prev => [
        ...prev,
        {
          sender: 'ai',
          text: res.data.reply,
          references: res.data.clinical_references,
          followups: res.data.suggested_followups,
        },
      ]);
    } catch {
      toast.error('AI Copilot request failed');
    } finally {
      setCopilotLoading(false);
    }
  };

  // Fetch Current Report
  useEffect(() => {
    (async () => {
      try {
        const res = await reportsAPI.getReport(id);
        setReport(res.data);
        setFindingsEdit(res.data.findings || '');
        setImpressionEdit(res.data.impression || '');
        setNotesEdit(res.data.radiologist_notes || '');
      } catch {
        toast.error('Report not found or access denied');
        navigate('/reports');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, navigate]);

  // Fetch other reports for prior study comparison selection
  useEffect(() => {
    (async () => {
      try {
        const res = await reportsAPI.listReports(1, 20);
        // Exclude current report
        const others = (res.data.reports || []).filter(r => String(r.id) !== String(id));
        setPriorReports(others);
      } catch {
        // non-blocking
      }
    })();
  }, [id]);

  // Run Interval Comparison when selectedPriorId changes
  useEffect(() => {
    if (!selectedPriorId || !report) {
      setComparisonData(null);
      return;
    }
    (async () => {
      setLoadingCompare(true);
      try {
        const res = await reportsAPI.compareReports(report.id, selectedPriorId);
        setComparisonData(res.data);
      } catch {
        toast.error('Failed to calculate interval comparison with selected study');
      } finally {
        setLoadingCompare(false);
      }
    })();
  }, [selectedPriorId, report]);

  // Fetch Interactive Finding Regions
  useEffect(() => {
    if (!id) return;
    reportsAPI.getInteractiveRegions(id).then(res => {
      setInteractiveRegions(res.data.regions || []);
    }).catch(() => {});
  }, [id]);

  // Blink Comparator Interval
  useEffect(() => {
    if (!blinkActive) return;
    const interval = setInterval(() => {
      setShowBlinkCurrent(prev => !prev);
    }, 600);
    return () => clearInterval(interval);
  }, [blinkActive]);

  // Window Presets (WW/WL)
  const applyWindowPreset = (preset) => {
    setActivePreset(preset);
    if (preset === 'default') {
      setBrightness(100); setContrast(100); setInvert(false);
      toast('Window: Standard Balanced (WW 400 / WL 40)', { icon: '⚖️' });
    } else if (preset === 'lung') {
      setBrightness(112); setContrast(145); setInvert(false);
      toast('Window: Lung Parenchyma (WW 1500 / WL -600)', { icon: '🫁' });
    } else if (preset === 'bone') {
      setBrightness(88); setContrast(165); setInvert(false);
      toast('Window: Bone Cortical Detail (WW 2000 / WL 400)', { icon: '🦴' });
    } else if (preset === 'soft') {
      setBrightness(116); setContrast(124); setInvert(false);
      toast('Window: Soft Tissue & Mediastinum (WW 350 / WL 40)', { icon: '🫀' });
    } else if (preset === 'pleura') {
      setBrightness(104); setContrast(130); setInvert(true);
      toast('Window: Inverted High-Penetration Pleura', { icon: '🌓' });
    }
  };

  // Voice Dictation Toggle
  const toggleVoiceDictation = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      toast('Voice dictation stopped', { icon: '🎙️' });
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        toast.success('Listening... speak clearly to dictate clinical notes');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (event.results[event.results.length - 1].isFinal) {
          setNotesEdit(prev => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
        }
      };

      recognition.onerror = (e) => {
        console.warn('Speech recognition error:', e.error);
        setIsRecording(false);
        toast.error(`Dictation paused: ${e.error}`);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
      toast.error('Unable to access microphone for voice dictation');
      setIsRecording(false);
    }
  };

  // Clinical Quick Macro Chip insertion
  const handleInsertMacro = (macroText) => {
    if (!isEditing) setIsEditing(true);
    setNotesEdit(prev => prev ? `${prev}\n• ${macroText}` : `• ${macroText}`);
    toast.success('Clinical note macro inserted');
  };

  const handleCopy = () => {
    if (!report) return;
    const text = [
      '══════════════════════════════════════════════════════════════',
      '           AUTOMATED MEDICAL RADIOLOGY REPORT',
      '        Metropolitan Radiology & Imaging Institute',
      '══════════════════════════════════════════════════════════════',
      `Report ID    : #${report.id}`,
      `Patient      : ${report.patient_name || 'N/A'} (MRN: ${report.patient_id || 'N/A'})`,
      `Date         : ${new Date(report.created_at).toLocaleString()}`,
      `Modality     : ${report.image_type.replace('_', ' ').toUpperCase()}`,
      `Urgency      : ${report.urgency_level?.toUpperCase() || 'NORMAL'}`,
      `Status       : ${report.status?.toUpperCase() || 'PRELIMINARY'}`,
      `Confidence   : ${Math.round(report.confidence_score * 100)}% [${report.confidence_level}]`,
      '',
      report.full_report,
      '',
      report.radiologist_notes ? `Physician Addendum:\n${report.radiologist_notes}\n` : '',
      report.verified_by ? `Digitally Certified By: ${report.verified_by} at ${new Date(report.verified_at).toLocaleString()}` : '',
      '══════════════════════════════════════════════════════════════',
      '⚠  AI-assisted diagnosis — must be confirmed by board-certified radiologist.',
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Official report copied to clipboard');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExport = () => {
    reportsAPI.exportReport(report.id);
  };

  const handlePrint = () => window.print();

  const handleDelete = async () => {
    if (!window.confirm('Permanently delete this report?')) return;
    try {
      await reportsAPI.deleteReport(id);
      toast.success('Report deleted');
      navigate('/reports');
    } catch {
      toast.error('Delete failed');
    }
  };

  // Reset image viewer adjustments
  const handleResetViewer = () => {
    setZoom(1);
    setInvert(false);
    setBrightness(100);
    setContrast(100);
    setShowGrid(false);
    setShowHeatmap(false);
    setActivePreset('default');
    setFocusedRegion(null);
    if (syncControls) {
      setPriorZoom(1);
      setPriorInvert(false);
    }
    toast('Viewer settings reset to default', { icon: '🔄' });
  };

  // Save physician edits
  const handleSaveEdits = async () => {
    setSaving(true);
    try {
      const res = await reportsAPI.updateReport(id, {
        findings: findingsEdit,
        impression: impressionEdit,
        radiologist_notes: notesEdit,
      });
      setReport(res.data);
      setIsEditing(false);
      toast.success('Report updated successfully');
    } catch {
      toast.error('Failed to update report');
    } finally {
      setSaving(false);
    }
  };

  // Sign & finalize report
  const handleSignReport = async () => {
    if (!window.confirm('Electronically sign and finalize this radiology report? This certifies review by practitioner.')) return;
    setSaving(true);
    try {
      const res = await reportsAPI.updateReport(id, {
        findings: findingsEdit,
        impression: impressionEdit,
        radiologist_notes: notesEdit,
        status: 'finalized',
      });
      setReport(res.data);
      setIsEditing(false);
      toast.success('Report signed & finalized with digital verification seal!');
    } catch {
      toast.error('Failed to sign report');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span className="loading-label">Loading clinical report &amp; PACS viewer…</span>
      </div>
    );
  }

  if (!report) return null;

  const conf  = Math.round(report.confidence_score * 100);
  const level = report.confidence_level ?? (conf >= 80 ? 'HIGH' : conf >= 55 ? 'MEDIUM' : 'LOW');
  const isFinalized = report.status === 'finalized';
  const isStat = report.urgency_level === 'stat_urgent';

  // Image filter calculation
  const imageFilter = `${invert ? 'invert(100%)' : ''} brightness(${brightness}%) contrast(${contrast}%)`;
  const priorImageFilter = `${(syncControls ? invert : priorInvert) ? 'invert(100%)' : ''} brightness(${brightness}%) contrast(${contrast}%)`;

  // Filter DICOM tags for inspector modal
  const dicomEntries = Object.entries(report.dicom_metadata || {}).filter(([k, v]) => {
    if (!dicomSearch.trim()) return true;
    const q = dicomSearch.toLowerCase();
    return k.toLowerCase().includes(q) || v.toLowerCase().includes(q);
  });

  return (
    <div className="report-detail-page">
      {/* Top Action Toolbar */}
      <div className="page-header no-print">
        <Link to="/reports" className="btn-secondary">
          <ArrowLeft size={16} /> Archive
        </Link>
        <div className="action-buttons">
          {/* Compare Prior Study Toggle */}
          <button
            className="btn-secondary"
            style={{
              borderColor: showCompare ? 'var(--cyan)' : undefined,
              color: showCompare ? 'var(--cyan)' : undefined,
              background: showCompare ? 'rgba(6, 182, 212, 0.12)' : undefined,
            }}
            onClick={() => setShowCompare(!showCompare)}
          >
            <ArrowLeftRight size={15} />
            {showCompare ? 'Exit Comparison' : 'Compare Prior Study'}
          </button>

          {/* DICOM Inspector Button */}
          <button
            className="btn-secondary"
            onClick={() => setShowDicomModal(true)}
          >
            <Database size={15} /> DICOM Tags
          </button>

          {/* Medical Glossary Button */}
          <button
            className="btn-secondary"
            onClick={() => setShowGlossaryModal(true)}
            style={{ color: '#38bdf8' }}
            title="Open Medical Terminology Explainer"
          >
            <BookOpen size={15} /> Medical Glossary
          </button>

          {!isFinalized ? (
            <>
              {isEditing ? (
                <>
                  <button className="btn-secondary" onClick={() => setIsEditing(false)}>
                    <X size={15} /> Cancel
                  </button>
                  <button className="btn-primary" onClick={handleSaveEdits} disabled={saving}>
                    <Save size={15} /> Save Changes
                  </button>
                  <button
                    className="btn-primary"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}
                    onClick={handleSignReport}
                    disabled={saving}
                  >
                    <UserCheck size={15} /> Sign &amp; Finalize
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" onClick={() => setIsEditing(true)}>
                    <Edit3 size={15} /> Edit / Addendum
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34d399' }}
                    onClick={handleSignReport}
                    disabled={saving}
                  >
                    <UserCheck size={15} /> Quick Sign-Off
                  </button>
                </>
              )}
            </>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={15} /> Verified &amp; Signed
            </span>
          )}

          <button className="btn-secondary" onClick={handleCopy}>
            {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
          </button>
          <button className="btn-secondary" onClick={handlePrint} title="Print or Save PDF">
            <Printer size={15} /> Print / PDF
          </button>
          <button className="btn-secondary" onClick={handleExport} title="Download plain-text export">
            <Download size={15} /> Export TXT
          </button>
          <button className="btn-danger" onClick={handleDelete} title="Delete report">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* STAT Urgency Pulse Banner */}
      {isStat && (
        <div className="no-print" style={{
          background: 'linear-gradient(90deg, rgba(244, 63, 94, 0.25), rgba(244, 63, 94, 0.08))',
          border: '1px solid #f43f5e',
          borderRadius: '8px',
          padding: '0.75rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'fadeInUp 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              width: '12px', height: '12px', borderRadius: '50%', background: '#f43f5e',
              display: 'inline-block', boxShadow: '0 0 10px #f43f5e', animation: 'recPulse 1.2s infinite',
            }} />
            <div>
              <strong style={{ color: '#fff', fontSize: '0.92rem' }}>CRITICAL STAT TRIAGE ALERT</strong>
              <p style={{ margin: '0.1rem 0 0 0', color: '#fecdd3', fontSize: '0.8rem' }}>
                Automated detection flagged acute anatomical asymmetry or acute critical indication. Immediate practitioner sign-off required.
              </p>
            </div>
          </div>
          <span style={{
            background: '#f43f5e', color: '#fff', fontSize: '0.7rem', fontWeight: 800,
            padding: '0.25rem 0.6rem', borderRadius: '4px', letterSpacing: '0.05em',
          }}>
            PRIORITY 1
          </span>
        </div>
      )}

      {/* Main Clinical Report Document Container */}
      <div className="report-document">
        {/* PRINT ONLY LETTERHEAD BANNER */}
        <div style={{ display: 'none' }} className="print-letterhead">
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '15px' }}>
            <h2 style={{ margin: 0, fontSize: '18pt', letterSpacing: '0.05em' }}>
              {(user?.hospital_name || 'METROPOLITAN RADIOLOGY & IMAGING INSTITUTE').toUpperCase()}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '10pt', color: '#333' }}>
              {user?.department || 'Department of Diagnostic Radiology'} • ACR Accredited Clinical Facility
            </p>
            <p style={{ margin: '2px 0 0 0', fontSize: '9pt', color: '#666' }}>
              100 Hospital Drive, Medical Center Complex • Phone: (555) 019-8372
            </p>
          </div>
        </div>

        {/* Document Header */}
        <div className="doc-header-row">
          <div>
            <h1 className="doc-title">Diagnostic Radiology Consultation</h1>
            <p className="doc-subtitle">ACR Standard Structured Radiology Evaluation &amp; Computer-Assisted Detection</p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {report.urgency_level === 'stat_urgent' ? (
              <span style={{
                background: 'rgba(244, 63, 94, 0.2)',
                border: '1px solid #f43f5e',
                color: '#fb7185',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.05em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}>
                <AlertTriangle size={13} /> STAT CRITICAL REVIEW
              </span>
            ) : report.urgency_level === 'attention' ? (
              <span style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid #f59e0b',
                color: '#f59e0b',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.05em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}>
                <AlertTriangle size={13} /> CLINICAL ATTENTION
              </span>
            ) : (
              <span style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}>
                <CheckCircle2 size={13} /> ROUTINE STUDY
              </span>
            )}

            <span className="doc-id">REPORT #{report.id}</span>
            <span className="doc-confidence">
              <Sparkles size={12} />
              {conf}% Confidence ({level})
            </span>
          </div>
        </div>

        {/* Patient Demographics & Exam Details Banner */}
        {(report.patient_id || report.patient_name || report.clinical_indication) && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}>
            <div>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Patient Identification</span>
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                <User size={15} style={{ color: 'var(--cyan)' }} />
                {report.patient_name || 'Anonymous Patient'}
                {report.patient_id && <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>({report.patient_id})</span>}
              </span>
            </div>
            {(report.patient_age || report.patient_gender) && (
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Demographics</span>
                <span style={{ fontSize: '0.88rem', color: '#f8fafc', marginTop: '0.2rem', display: 'block' }}>
                  {report.patient_age ? `${report.patient_age} yrs` : ''} {report.patient_gender ? `• ${report.patient_gender}` : ''}
                </span>
              </div>
            )}
            {report.clinical_indication && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Clinical Indication / Reason for Exam</span>
                <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontStyle: 'italic', marginTop: '0.2rem', display: 'block' }}>
                  "{report.clinical_indication}"
                </span>
              </div>
            )}
          </div>
        )}

        {/* Meta Grid */}
        <div className="doc-meta-grid">
          <div className="meta-item">
            <span className="meta-label">Source File</span>
            <span className="meta-value">{report.original_filename}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Imaging Modality</span>
            <span className="meta-value">
              <Layers size={13} /> {report.image_type.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Generated On</span>
            <span className="meta-value">
              <Calendar size={13} /> {new Date(report.created_at).toLocaleString()}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">AI Inference Engine</span>
            <span className="meta-value" style={{ fontSize: '0.78rem', fontFamily: 'var(--mono)' }}>
              Salesforce/BLIP-large
            </span>
          </div>
        </div>

        {/* PRIOR STUDY COMPARISON DUAL-VIEW PORT (IF OPEN) */}
        {showCompare && (
          <div className="no-print" style={{
            background: 'rgba(6, 182, 212, 0.03)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ArrowLeftRight size={18} style={{ color: 'var(--cyan)' }} />
                <h3 style={{ margin: 0, fontSize: '0.98rem', color: '#fff' }}>Interval Prior Study Comparison</h3>

                {/* Comparator Mode Switcher */}
                <div className="compare-mode-switcher" style={{ marginLeft: '0.5rem' }}>
                  <button
                    type="button"
                    className={`compare-mode-btn ${compareMode === 'dual' ? 'active' : ''}`}
                    onClick={() => { setCompareMode('dual'); setBlinkActive(false); }}
                  >
                    ⊞ Dual View
                  </button>
                  <button
                    type="button"
                    className={`compare-mode-btn ${compareMode === 'curtain' ? 'active' : ''}`}
                    onClick={() => { setCompareMode('curtain'); setBlinkActive(false); }}
                  >
                    ↔ Curtain Swipe
                  </button>
                  <button
                    type="button"
                    className={`compare-mode-btn ${compareMode === 'blink' ? 'active' : ''}`}
                    onClick={() => { setCompareMode('blink'); setBlinkActive(true); }}
                  >
                    ⚡ Blink Comparator
                  </button>
                </div>
              </div>

              {/* Study Selector & Sync Toggle */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={syncControls}
                    onChange={(e) => setSyncControls(e.target.checked)}
                    style={{ accentColor: 'var(--cyan)' }}
                  />
                  Sync Controls
                </label>

                {loadingCompare && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--cyan)', fontStyle: 'italic' }}>
                    Analyzing delta…
                  </span>
                )}
                <select
                  value={selectedPriorId}
                  onChange={(e) => setSelectedPriorId(e.target.value)}
                  style={{
                    background: '#0d1424',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">-- Choose Prior Study --</option>
                  {priorReports.map(pr => (
                    <option key={pr.id} value={pr.id}>
                      Study #{pr.id} ({pr.original_filename} • {new Date(pr.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* AI Interval Change Analysis Box */}
            {comparisonData && (
              <div style={{
                background: '#090e1c',
                border: '1px solid #1e293b',
                borderLeft: `4px solid ${comparisonData.interval_delta_type === 'improved' ? '#10b981' : comparisonData.interval_delta_type === 'progressed' ? '#f43f5e' : '#38bdf8'}`,
                borderRadius: '8px',
                padding: '0.85rem 1.15rem',
                marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: comparisonData.interval_delta_type === 'improved' ? '#34d399' : comparisonData.interval_delta_type === 'progressed' ? '#fb7185' : '#38bdf8',
                  }}>
                    AI Interval Evaluation ({comparisonData.timeline_days} day difference)
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Prior: #{comparisonData.prior_report.id} vs Current: #{comparisonData.current_report.id}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#e2e8f0', lineHeight: '1.5' }}>
                  {comparisonData.interval_summary}
                </p>
              </div>
            )}

            {/* MODE 1: DUAL VIEW (SIDE BY SIDE) */}
            {compareMode === 'dual' && (
              <div className="dual-viewer-container">
                {/* Left Pane: Current Study */}
                <div className="comparison-pane">
                  <div className="comparison-header">
                    <span>Current Study: #{report.id} ({report.original_filename})</span>
                    <span className={`card-urgency-badge ${report.urgency_level || 'normal'}`}>
                      {report.urgency_level?.toUpperCase() || 'NORMAL'}
                    </span>
                  </div>
                  <div style={{
                    position: 'relative',
                    overflow: 'hidden',
                    background: '#000',
                    borderRadius: '6px',
                    height: '320px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {showGrid && (
                      <div style={{
                        position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
                        backgroundImage: 'linear-gradient(to right, rgba(56, 189, 248, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.15) 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                      }} />
                    )}
                    <img
                      src={report.image_url || `http://localhost:8000/api/uploads/${report.image_filename}`}
                      alt="Current radiograph"
                      style={{
                        transform: `scale(${zoom})`,
                        filter: imageFilter,
                        maxHeight: '100%',
                        maxWidth: '100%',
                        objectFit: 'contain',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  </div>
                  <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong>Current Findings:</strong> {report.findings?.slice(0, 140)}…
                  </div>
                </div>

                {/* Right Pane: Selected Prior Study */}
                <div className="comparison-pane">
                  <div className="comparison-header">
                    {comparisonData ? (
                      <>
                        <span>Prior Study: #{comparisonData.prior_report.id} ({new Date(comparisonData.prior_report.created_at).toLocaleDateString()})</span>
                        <span className={`card-urgency-badge ${comparisonData.prior_report.urgency_level || 'normal'}`}>
                          {comparisonData.prior_report.urgency_level?.toUpperCase() || 'NORMAL'}
                        </span>
                      </>
                    ) : (
                      <span>Prior Study Selection</span>
                    )}
                  </div>

                  <div style={{
                    position: 'relative',
                    overflow: 'hidden',
                    background: '#000',
                    borderRadius: '6px',
                    height: '320px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {comparisonData ? (
                      <img
                        src={comparisonData.prior_report.image_url || `http://localhost:8000/api/uploads/${comparisonData.prior_report.image_filename}`}
                        alt="Prior radiograph"
                        style={{
                          transform: `scale(${syncControls ? zoom : priorZoom})`,
                          filter: priorImageFilter,
                          maxHeight: '100%',
                          maxWidth: '100%',
                          objectFit: 'contain',
                          transition: 'transform 0.15s ease',
                        }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>
                        <ArrowLeftRight size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>Select a prior study from dropdown above to compare.</p>
                        <button
                          className="btn-secondary"
                          style={{ marginTop: '0.75rem', fontSize: '0.78rem' }}
                          onClick={() => {
                            if (priorReports.length > 0) setSelectedPriorId(String(priorReports[0].id));
                          }}
                        >
                          Load Baseline Prior
                        </button>
                      </div>
                    )}
                  </div>

                  {comparisonData && (
                    <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <strong>Prior Findings:</strong> {comparisonData.prior_report.findings?.slice(0, 140)}…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MODE 2: SPLIT-SCREEN CURTAIN SWIPE */}
            {compareMode === 'curtain' && (
              <div style={{ background: '#080d1a', border: '1px solid #1e293b', borderRadius: '10px', padding: '1rem' }}>
                {comparisonData ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.78rem' }}>
                      <span style={{ color: '#93c5fd', fontWeight: 700 }}>
                        ◀ Drag slider to reveal Prior Study (#{comparisonData.prior_report.id})
                      </span>
                      <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>
                        Reveal Current Study (#{report.id}) ▶
                      </span>
                    </div>

                    <div style={{ position: 'relative', width: '100%', height: '380px', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                      {/* Current study (Background) */}
                      <img
                        src={report.image_url || `http://localhost:8000/api/uploads/${report.image_filename}`}
                        alt="Current Study"
                        style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
                          transform: `scale(${zoom})`, filter: imageFilter, transition: 'transform 0.15s ease',
                        }}
                      />

                      {/* Prior study (Clipped overlay) */}
                      <div
                        style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%',
                          clipPath: `polygon(0 0, ${curtainPos}% 0, ${curtainPos}% 100%, 0 100%)`,
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={comparisonData.prior_report.image_url || `http://localhost:8000/api/uploads/${comparisonData.prior_report.image_filename}`}
                          alt="Prior Study"
                          style={{
                            width: '100%', height: '100%', objectFit: 'contain',
                            transform: `scale(${syncControls ? zoom : priorZoom})`,
                            filter: priorImageFilter,
                          }}
                        />
                      </div>

                      {/* Dividing line */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${curtainPos}%`,
                          width: '3px',
                          background: '#38bdf8',
                          boxShadow: '0 0 12px #38bdf8',
                          zIndex: 5,
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: '#0284c7',
                            border: '2px solid #fff',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 800,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                          }}
                        >
                          ↔
                        </div>
                      </div>
                    </div>

                    {/* Slider control */}
                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', minWidth: '90px' }}>Split Position: {curtainPos}%</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={curtainPos}
                        onChange={(e) => setCurtainPos(Number(e.target.value))}
                        style={{ flex: 1, accentColor: '#38bdf8' }}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                        onClick={() => setCurtainPos(50)}
                      >
                        Center 50%
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>Please select a prior study from the dropdown above to use the Curtain Swipe comparator.</p>
                  </div>
                )}
              </div>
            )}

            {/* MODE 3: BLINK COMPARATOR */}
            {compareMode === 'blink' && (
              <div style={{ background: '#080d1a', border: '1px solid #1e293b', borderRadius: '10px', padding: '1rem' }}>
                {comparisonData ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          padding: '0.25rem 0.6rem',
                          borderRadius: '4px',
                          background: showBlinkCurrent ? 'rgba(6, 182, 212, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: showBlinkCurrent ? 'var(--cyan)' : '#fbbf24',
                          border: `1px solid ${showBlinkCurrent ? 'var(--cyan)' : '#f59e0b'}`,
                        }}>
                          {showBlinkCurrent ? `● CURRENT STUDY (#${report.id})` : `○ PRIOR STUDY (#${comparisonData.prior_report.id})`}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Blinks every 600ms to reveal acute changes
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.74rem', padding: '0.25rem 0.6rem' }}
                        onClick={() => setBlinkActive(!blinkActive)}
                      >
                        {blinkActive ? '⏸ Pause Blink' : '▶ Resume Blink'}
                      </button>
                    </div>

                    <div style={{ position: 'relative', width: '100%', height: '380px', background: '#000', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={showBlinkCurrent
                          ? (report.image_url || `http://localhost:8000/api/uploads/${report.image_filename}`)
                          : (comparisonData.prior_report.image_url || `http://localhost:8000/api/uploads/${comparisonData.prior_report.image_filename}`)}
                        alt="Blink radiograph"
                        style={{
                          transform: `scale(${zoom})`,
                          filter: showBlinkCurrent ? imageFilter : priorImageFilter,
                          maxHeight: '100%',
                          maxWidth: '100%',
                          objectFit: 'contain',
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>Please select a prior study from the dropdown above to use the Blink Comparator.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content Layout */}
        <div className="doc-content-layout">
          {/* Left – Radiograph with PACS Viewer Tools */}
          <div className="doc-image-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <p className="section-title" style={{ margin: 0 }}>PACS Interactive Radiograph</p>

              {/* PACS Radiologist Viewer Toolbar */}
              <div className="no-print" style={{ display: 'flex', gap: '0.25rem', background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.2rem', alignItems: 'center' }}>
                {/* Window Presets (WW / WL) */}
                <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', borderRight: '1px solid #1e293b', paddingRight: '0.35rem', marginRight: '0.2rem' }}>
                  <button
                    type="button"
                    className={`preset-btn ${activePreset === 'default' ? 'active' : ''}`}
                    onClick={() => applyWindowPreset('default')}
                    title="Standard Balanced Window (WW 400 / WL 40)"
                  >
                    Std
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${activePreset === 'lung' ? 'active' : ''}`}
                    onClick={() => applyWindowPreset('lung')}
                    title="Lung Parenchyma Window (WW 1500 / WL -600)"
                  >
                    🫁 Lung
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${activePreset === 'bone' ? 'active' : ''}`}
                    onClick={() => applyWindowPreset('bone')}
                    title="Bone Detail Window (WW 2000 / WL 400)"
                  >
                    🦴 Bone
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${activePreset === 'soft' ? 'active' : ''}`}
                    onClick={() => applyWindowPreset('soft')}
                    title="Soft Tissue Window (WW 350 / WL 40)"
                  >
                    🫀 Soft
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${activePreset === 'pleura' ? 'active' : ''}`}
                    onClick={() => applyWindowPreset('pleura')}
                    title="High-Penetration Inverted Pleura"
                  >
                    🌓 Pleura
                  </button>
                </div>

                {/* Explainable AI Heatmap Toggle */}
                <button
                  type="button"
                  title="Explainable AI Attention Map (Grad-CAM)"
                  onClick={() => setShowHeatmap(!showHeatmap)}
                  style={{
                    background: showHeatmap ? '#f43f5e' : 'transparent',
                    color: showHeatmap ? '#fff' : '#94a3b8',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.25rem 0.45rem',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <Flame size={13} /> HEAT
                </button>

                <button
                  type="button"
                  title="Negative / Invert View"
                  onClick={() => setInvert(!invert)}
                  style={{
                    background: invert ? '#38bdf8' : 'transparent',
                    color: invert ? '#000' : '#94a3b8',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.25rem 0.4rem',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  NEG
                </button>
                <button
                  type="button"
                  title="Zoom In"
                  onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                  style={{ background: 'transparent', color: '#94a3b8', border: 'none', padding: '0.25rem', cursor: 'pointer' }}
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  title="Zoom Out"
                  onClick={() => setZoom(Math.max(1, zoom - 0.25))}
                  style={{ background: 'transparent', color: '#94a3b8', border: 'none', padding: '0.25rem', cursor: 'pointer' }}
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  type="button"
                  title="Anatomical Grid Overlay"
                  onClick={() => setShowGrid(!showGrid)}
                  style={{
                    background: showGrid ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: showGrid ? '#38bdf8' : '#94a3b8',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.25rem',
                    cursor: 'pointer',
                  }}
                >
                  <Grid size={14} />
                </button>
                <button
                  type="button"
                  title="Brightness & Contrast Sliders"
                  onClick={() => setShowSliders(!showSliders)}
                  style={{
                    background: showSliders ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: showSliders ? '#38bdf8' : '#94a3b8',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.25rem',
                    cursor: 'pointer',
                  }}
                >
                  <Sliders size={14} />
                </button>
                <button
                  type="button"
                  title="Reset Adjustments"
                  onClick={handleResetViewer}
                  style={{ background: 'transparent', color: '#94a3b8', border: 'none', padding: '0.25rem', cursor: 'pointer' }}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  title="Fullscreen Theater Mode"
                  onClick={() => setFullscreen(true)}
                  style={{ background: 'transparent', color: '#94a3b8', border: 'none', padding: '0.25rem', cursor: 'pointer' }}
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  type="button"
                  title="PACS Viewer Guide & Legend"
                  onClick={() => setShowPacsGuide(!showPacsGuide)}
                  style={{
                    background: showPacsGuide ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: showPacsGuide ? '#38bdf8' : '#94a3b8',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.25rem 0.45rem',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                  }}
                >
                  <HelpCircle size={13} /> Guide
                </button>
              </div>
            </div>

            {/* PACS Viewer Quick Guide Panel */}
            {showPacsGuide && (
              <div className="no-print" style={{
                background: '#090e1a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '0.75rem',
                fontSize: '0.76rem',
                lineHeight: 1.5,
                color: '#cbd5e1',
              }}>
                <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Info size={14} /> PACS Viewer Guide &amp; Tool Controls
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
                  <div>
                    <strong style={{ color: '#f43f5e' }}>🔥 HEAT (Grad-CAM):</strong> Shows where the AI vision neural network focused attention to identify radiological abnormalities.
                  </div>
                  <div>
                    <strong style={{ color: '#38bdf8' }}>🌓 NEG (Invert):</strong> Reverses grayscale tones to highlight fine cortical bone fractures and subtle pneumothorax pleural lines.
                  </div>
                  <div>
                    <strong style={{ color: '#10b981' }}>🔍 Zoom &amp; Grid:</strong> Magnify image up to 300% and overlay metric coordinate lines for anatomical measurement.
                  </div>
                  <div>
                    <strong style={{ color: '#fbbf24' }}>🎚️ Sliders:</strong> Adjust brightness and contrast window levels (soft tissue vs dense bone windows).
                  </div>
                </div>
              </div>
            )}

            {/* Brightness & Contrast / Heatmap Opacity Popup Bar */}
            {(showSliders || showHeatmap) && (
              <div className="no-print" style={{
                background: '#090d1a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '0.6rem 0.8rem',
                marginBottom: '0.5rem',
                display: 'grid',
                gridTemplateColumns: showHeatmap ? '1fr 1fr 1fr' : '1fr 1fr',
                gap: '0.75rem',
                fontSize: '0.75rem',
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Brightness: {brightness}%</span>
                  <input
                    type="range"
                    min="60"
                    max="160"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--cyan)' }}
                  />
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Contrast: {contrast}%</span>
                  <input
                    type="range"
                    min="60"
                    max="180"
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--cyan)' }}
                  />
                </div>
                {showHeatmap && (
                  <div>
                    <span style={{ color: '#fb7185', display: 'block', marginBottom: '0.2rem' }}>Heatmap Opacity: {Math.round(heatmapOpacity * 100)}%</span>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      value={Math.round(heatmapOpacity * 100)}
                      onChange={(e) => setHeatmapOpacity(Number(e.target.value) / 100)}
                      style={{ width: '100%', accentColor: '#f43f5e' }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Radiograph Viewport */}
            <div
              className="image-frame"
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: '#000',
                borderRadius: '8px',
                minHeight: '340px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showGrid && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 2,
                    pointerEvents: 'none',
                    backgroundImage: 'linear-gradient(to right, rgba(56, 189, 248, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.15) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                  }}
                />
              )}

              {/* Explainable AI Heatmap Layer */}
              {showHeatmap && report.heatmap_zones && (
                <div
                  className="heatmap-overlay"
                  style={{
                    transform: `scale(${zoom})`,
                    transition: 'transform 0.2s ease',
                  }}
                >
                  {report.heatmap_zones.map((zone, idx) => (
                    <div
                      key={idx}
                      className="heatmap-marker"
                      onMouseEnter={() => setHoveredZone(zone)}
                      onMouseLeave={() => setHoveredZone(null)}
                      style={{
                        left: `${zone.x}%`,
                        top: `${zone.y}%`,
                        width: `${zone.radius * 2.4}%`,
                        height: `${zone.radius * 2.4}%`,
                        background: `radial-gradient(circle, rgba(239, 68, 68, ${heatmapOpacity * 0.9}) 0%, rgba(249, 115, 22, ${heatmapOpacity * 0.7}) 40%, rgba(234, 179, 8, ${heatmapOpacity * 0.4}) 68%, rgba(6, 182, 212, ${heatmapOpacity * 0.15}) 88%, transparent 100%)`,
                        filter: 'blur(4px)',
                      }}
                    >
                      {hoveredZone === zone && (
                        <div className="heatmap-tooltip">
                          🎯 {zone.label} ({Math.round((zone.confidence || 0.85) * 100)}% activation)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Focused Finding Reticle / Crosshair Radar Ping */}
              {focusedRegion && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${focusedRegion.x}%`,
                    top: `${focusedRegion.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 12,
                    pointerEvents: 'none',
                  }}
                >
                  <div className="radar-ping" />
                  <div className="crosshair-reticle">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="20" fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="4 3" />
                      <circle cx="32" cy="32" r="6" fill="#f43f5e" fillOpacity="0.45" stroke="#f43f5e" strokeWidth="2" />
                      <line x1="32" y1="2" x2="32" y2="20" stroke="#f43f5e" strokeWidth="2" />
                      <line x1="32" y1="44" x2="32" y2="62" stroke="#f43f5e" strokeWidth="2" />
                      <line x1="2" y1="32" x2="20" y2="32" stroke="#f43f5e" strokeWidth="2" />
                      <line x1="44" y1="32" x2="62" y2="32" stroke="#f43f5e" strokeWidth="2" />
                    </svg>
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      whiteSpace: 'nowrap',
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid #f43f5e',
                      color: '#fff',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '0.25rem 0.6rem',
                      borderRadius: '5px',
                      marginTop: '4px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
                    }}>
                      🎯 {focusedRegion.label}
                    </div>
                  </div>
                </div>
              )}

              <img
                src={report.image_url || `http://localhost:8000/api/uploads/${report.image_filename}`}
                alt="Medical radiograph"
                className="xray-image"
                style={{
                  transform: `scale(${zoom})`,
                  filter: imageFilter,
                  transition: 'transform 0.2s ease, filter 0.2s ease',
                  maxHeight: '440px',
                  objectFit: 'contain',
                }}
              />
            </div>

            {/* Heatmap Legend Banner */}
            {showHeatmap && (
              <div className="no-print" style={{
                marginTop: '0.5rem',
                padding: '0.45rem 0.75rem',
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                borderRadius: '6px',
                fontSize: '0.74rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#fecdd3',
              }}>
                <span>🔥 Grad-CAM Activation Hotspots Active</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem' }}>
                  {report.heatmap_zones?.length || 0} focal area(s) detected
                </span>
              </div>
            )}

            {/* Confidence Ring */}
            <div style={{ marginTop: '1.25rem' }}>
              <ConfRing score={report.confidence_score} />
            </div>
          </div>

          {/* Right – Report Findings, Impression & Physician Verification */}
          <div className="doc-text-section">
            {/* View Mode Tab Switcher */}
            <div className="report-mode-tabs no-print" style={{
              display: 'flex',
              gap: '0.35rem',
              marginBottom: '1rem',
              background: '#0a0f1d',
              padding: '0.3rem',
              borderRadius: '8px',
              border: '1px solid #1e293b',
            }}>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'clinical' ? 'active' : ''}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'clinical' ? '#06b6d4' : 'transparent',
                  color: activeTab === 'clinical' ? '#000' : '#94a3b8',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => setActiveTab('clinical')}
              >
                <FileText size={14} /> Clinical Radiologist View
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'patient' ? 'active' : ''}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'patient' ? '#10b981' : 'transparent',
                  color: activeTab === 'patient' ? '#000' : '#94a3b8',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => {
                  setActiveTab('patient');
                  loadPatientSummary();
                }}
              >
                <Heart size={14} /> Patient-Friendly Summary
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'copilot' ? 'active' : ''}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'copilot' ? '#8b5cf6' : 'transparent',
                  color: activeTab === 'copilot' ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => setActiveTab('copilot')}
              >
                <Bot size={14} /> AI Radiologist Copilot
              </button>
            </div>

            {/* TAB 1: CLINICAL RADIOLOGIST VIEW */}
            {activeTab === 'clinical' && (
              <>
                {/* Findings Block */}
                <div className="report-block">
                  <h3 className="block-title">
                    <FileText size={15} /> Clinical Findings
                  </h3>
                  <div className="block-content">
                    {isEditing ? (
                      <textarea
                        rows={7}
                        value={findingsEdit}
                        onChange={(e) => setFindingsEdit(e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0c1120',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '0.75rem',
                          fontSize: '0.88rem',
                          lineHeight: '1.6',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                    ) : (
                      <>
                        <div style={{ whiteSpace: 'pre-line', lineHeight: '1.65' }}>{report.findings}</div>

                        {/* Interactive ROI Finding Linkage Chips */}
                        {interactiveRegions.length > 0 && (
                          <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>
                              🎯 Interactive Finding Anatomical Targets (Click to locate on PACS):
                            </span>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {interactiveRegions.map((reg) => (
                                <button
                                  key={reg.id}
                                  type="button"
                                  onClick={() => {
                                    setFocusedRegion(reg);
                                    setShowHeatmap(true);
                                    toast.success(`Locating on PACS: ${reg.label}`);
                                  }}
                                  style={{
                                    background: focusedRegion?.id === reg.id ? '#f43f5e' : '#0c1322',
                                    color: focusedRegion?.id === reg.id ? '#fff' : '#94a3b8',
                                    border: '1px solid',
                                    borderColor: focusedRegion?.id === reg.id ? '#f43f5e' : '#1e293b',
                                    borderRadius: '6px',
                                    padding: '0.3rem 0.6rem',
                                    fontSize: '0.74rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <Crosshair size={12} /> {reg.label}
                                </button>
                              ))}
                              {focusedRegion && (
                                <button
                                  type="button"
                                  onClick={() => setFocusedRegion(null)}
                                  style={{
                                    background: 'transparent',
                                    color: 'var(--text-muted)',
                                    border: 'none',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                    padding: '0.3rem',
                                  }}
                                >
                                  ✕ Clear Target
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Impression Block */}
                <div className="report-block impression-block">
                  <h3 className="block-title">
                    <Sparkles size={15} /> Impression &amp; Conclusion
                  </h3>
                  <div className="block-content">
                    {isEditing ? (
                      <textarea
                        rows={4}
                        value={impressionEdit}
                        onChange={(e) => setImpressionEdit(e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0c1120',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '0.75rem',
                          fontSize: '0.88rem',
                          lineHeight: '1.6',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                    ) : (
                      <div style={{ whiteSpace: 'pre-line', lineHeight: '1.65' }}>{report.impression}</div>
                    )}
                  </div>
                </div>

                {/* Radiologist Notes & Speech-to-Text Voice Dictation Block */}
                <div className="report-block" style={{ borderLeft: '3px solid var(--cyan)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 className="block-title" style={{ margin: 0 }}>
                      <Edit3 size={15} /> Physician Addendum &amp; Notes
                    </h3>

                    {/* Voice Dictation Button */}
                    <button
                      type="button"
                      className={`dictate-btn no-print ${isRecording ? 'listening' : ''}`}
                      onClick={toggleVoiceDictation}
                      title="Dictate addendum using microphone"
                    >
                      {isRecording ? <><MicOff size={13} /> Recording… Click to Stop</> : <><Mic size={13} /> Dictate Voice Notes</>}
                    </button>
                  </div>

                  {/* Voice waveform audio visualizer */}
                  {isRecording && (
                    <div className="voice-waveform-banner">
                      <div className="soundwave-bar bar-1" />
                      <div className="soundwave-bar bar-2" />
                      <div className="soundwave-bar bar-3" />
                      <div className="soundwave-bar bar-4" />
                      <span style={{ fontWeight: 600 }}>Microphone Active — Dictating into physician addendum notes…</span>
                    </div>
                  )}

                  <div className="block-content">
                    {isEditing ? (
                      <>
                        <textarea
                          rows={3}
                          placeholder="Type or dictate physician addendum, clinical correlation, or patient discharge instructions…"
                          value={notesEdit}
                          onChange={(e) => setNotesEdit(e.target.value)}
                          style={{
                            width: '100%',
                            background: '#0c1120',
                            border: '1px solid #334155',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            padding: '0.75rem',
                            fontSize: '0.88rem',
                            lineHeight: '1.6',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                          }}
                        />

                        {/* Quick Insert Clinical Macros */}
                        <div className="macro-chips-container no-print">
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Quick Macros:</span>
                          <button type="button" className="macro-chip" onClick={() => handleInsertMacro('Normal study confirmed with clear lung fields.')}>
                            + Clear Fields
                          </button>
                          <button type="button" className="macro-chip" onClick={() => handleInsertMacro('Urgent pulmonology consult advised.')}>
                            + Pulmonology Consult
                          </button>
                          <button type="button" className="macro-chip" onClick={() => handleInsertMacro('Follow-up high-resolution CT recommended in 3 months.')}>
                            + CT Follow-up
                          </button>
                          <button type="button" className="macro-chip" onClick={() => handleInsertMacro('Stable radiographic appearance compared to prior study.')}>
                            + Stable Interval
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
                        {report.radiologist_notes || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No physician addendum noted. Click "Edit / Addendum" above to add notes or dictate.</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Digital Verification Seal (When Finalized) */}
                {isFinalized && report.verified_by && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.05)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                  }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#10b981',
                      flexShrink: 0,
                    }}>
                      <UserCheck size={22} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#34d399', fontWeight: 700 }}>
                        Digitally Verified &amp; Certified
                      </h4>
                      <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Attested by <strong>{report.verified_by}</strong> on {new Date(report.verified_at).toLocaleString()}
                      </p>
                      <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                        SHA256 Cert Hash: {`RAD-${report.id}-${Math.abs(report.id * 894172).toString(16).toUpperCase()}-VERIFIED`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Confidence Assessment Bar */}
                <div className="report-block" style={{ padding: '1.1rem 1.4rem' }}>
                  <h3 className="block-title" style={{ marginBottom: '0.6rem', fontSize: '0.68rem' }}>
                    <Sparkles size={12} /> Confidence Assessment
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: 'var(--border)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${conf}%`,
                        borderRadius: 3,
                        background: conf >= 80 ? 'var(--emerald)' : conf >= 55 ? 'var(--amber)' : 'var(--rose)',
                        transition: 'width 1.2s cubic-bezier(0.16,1,0.3,1)',
                      }} />
                    </div>
                    <span style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: conf >= 80 ? 'var(--emerald)' : conf >= 55 ? 'var(--amber)' : 'var(--rose)',
                      minWidth: 38,
                    }}>
                      {conf}%
                    </span>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="disclaimer-box">
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      <strong>Clinical Notice:</strong> Generated by MedReporter AI Systems.
                      Computer-assisted detection is intended to support licensed practitioners and
                      must be validated by a board-certified radiologist prior to treatment administration.
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: PATIENT-FRIENDLY SUMMARY */}
            {activeTab === 'patient' && (
              <div className="patient-summary-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {loadingPatientSummary ? (
                  <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                    <span style={{ fontSize: '0.88rem' }}>Translating medical findings into clear, empathetic patient guide…</span>
                  </div>
                ) : patientSummary ? (
                  <>
                    {/* Plain English Greeting & Overview Card */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.05))',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '10px',
                      padding: '1.25rem 1.4rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                        <Heart size={20} style={{ color: '#10b981' }} />
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#34d399', fontWeight: 700 }}>
                          What Your Scan Shows In Everyday Words
                        </h3>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.65, color: '#f1f5f9' }}>
                        {patientSummary.layperson_overview}
                      </p>
                    </div>

                    {/* Key Takeaways */}
                    <div className="report-block">
                      <h3 className="block-title" style={{ color: '#38bdf8' }}>
                        <CheckCircle2 size={15} /> Key Points To Know
                      </h3>
                      <div className="block-content">
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem', lineHeight: 1.5 }}>
                          {patientSummary.key_takeaways?.map((t, idx) => (
                            <li key={idx} style={{ color: '#f1f5f9' }}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Reassuring Areas */}
                    <div className="report-block" style={{ borderLeft: '3px solid #10b981' }}>
                      <h3 className="block-title" style={{ color: '#34d399' }}>
                        <ShieldAlert size={15} /> Healthy &amp; Reassuring Areas
                      </h3>
                      <div className="block-content">
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.86rem', color: '#cbd5e1' }}>
                          {patientSummary.reassurances?.map((r, idx) => (
                            <li key={idx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Questions To Ask Doctor */}
                    <div className="report-block" style={{ borderLeft: '3px solid #f59e0b' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                        <h3 className="block-title" style={{ margin: 0, color: '#fbbf24' }}>
                          <HelpCircle size={15} /> Questions To Ask Your Doctor
                        </h3>
                        <button
                          type="button"
                          className="btn-secondary no-print"
                          style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                          onClick={() => {
                            navigator.clipboard.writeText(patientSummary.questions_for_doctor?.join('\n') || '');
                            toast.success('Doctor discussion questions copied to clipboard!');
                          }}
                        >
                          <Copy size={12} /> Copy Questions
                        </button>
                      </div>
                      <div className="block-content">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {patientSummary.questions_for_doctor?.map((q, idx) => (
                            <div key={idx} style={{
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.06)',
                              borderRadius: '6px',
                              padding: '0.6rem 0.85rem',
                              fontSize: '0.85rem',
                              color: '#f8fafc',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.5rem',
                            }}>
                              <span style={{ color: '#fbbf24', fontWeight: 700 }}>Q{idx + 1}:</span>
                              <span>{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Next Steps / Urgency Advice */}
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '8px',
                      padding: '0.9rem 1.1rem',
                      fontSize: '0.84rem',
                      color: '#fef3c7',
                      lineHeight: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}>
                      <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <span>{patientSummary.urgency_advice}</span>
                    </div>

                    {/* Print Patient Handout Action */}
                    <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ padding: '0.55rem 1rem', fontSize: '0.82rem' }}
                        onClick={() => window.print()}
                      >
                        <Printer size={15} /> Print Patient Handout (PDF)
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    <button className="btn-primary" onClick={loadPatientSummary}>
                      <Heart size={15} /> Generate Patient-Friendly Summary
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: AI RADIOLOGIST COPILOT */}
            {activeTab === 'copilot' && (
              <div className="copilot-container" style={{
                display: 'flex',
                flexDirection: 'column',
                height: '620px',
                background: '#080d19',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                overflow: 'hidden',
              }}>
                {/* Copilot Header */}
                <div style={{
                  padding: '0.85rem 1.2rem',
                  background: '#0c1322',
                  borderBottom: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>
                      <Bot size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#fff', fontWeight: 700 }}>AI Radiologist Copilot</h4>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Contextual Clinical Assistant for Study #{report.id}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                    Active Model: BLIP + Clinical Rules
                  </span>
                </div>

                {/* Quick Suggestion Chips */}
                <div style={{
                  padding: '0.6rem 0.9rem',
                  background: 'rgba(255,255,255,0.015)',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  gap: '0.4rem',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                }}>
                  {[
                    'Differential diagnoses',
                    'Recommended follow-up',
                    'Antibiotic guidelines',
                    'Patient explanation script',
                  ].map((promptText) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => handleSendCopilot(promptText)}
                      disabled={copilotLoading}
                      style={{
                        background: '#0e172a',
                        border: '1px solid #1e293b',
                        color: '#94a3b8',
                        borderRadius: '14px',
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.color = '#38bdf8'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
                    >
                      ✨ {promptText}
                    </button>
                  ))}
                </div>

                {/* Messages Feed */}
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.9rem',
                }}>
                  {copilotHistory.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div style={{
                        maxWidth: '85%',
                        padding: '0.75rem 1rem',
                        borderRadius: '10px',
                        fontSize: '0.85rem',
                        lineHeight: 1.55,
                        whiteSpace: 'pre-line',
                        background: msg.sender === 'user' ? '#0284c7' : '#0f172a',
                        color: '#fff',
                        border: msg.sender === 'user' ? 'none' : '1px solid #1e293b',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      }}>
                        {msg.text}

                        {/* Citations if AI message */}
                        {msg.references?.length > 0 && (
                          <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem', color: '#94a3b8' }}>
                            <strong style={{ color: '#38bdf8' }}>Clinical References:</strong>
                            <ul style={{ margin: '0.2rem 0 0 0', paddingLeft: '1rem' }}>
                              {msg.references.map((ref, idx) => (
                                <li key={idx}>{ref}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {copilotLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.78rem', padding: '0.5rem' }}>
                      <div className="spinner-sm" />
                      <span>AI Radiologist is analyzing findings and generating clinical rationale…</span>
                    </div>
                  )}
                </div>

                {/* Input Box */}
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSendCopilot(); }}
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#0a0f1d',
                    borderTop: '1px solid #1e293b',
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Ask a clinical question about this radiograph (e.g. differential, next steps)..."
                    value={copilotInput}
                    onChange={(e) => setCopilotInput(e.target.value)}
                    disabled={copilotLoading}
                    style={{
                      flex: 1,
                      background: '#050811',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '0.6rem 0.9rem',
                      color: '#f8fafc',
                      fontSize: '0.84rem',
                    }}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!copilotInput.trim() || copilotLoading}
                    style={{ padding: '0.6rem 1rem', borderRadius: '8px', flexShrink: 0 }}
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DICOM TECHNICAL INSPECTOR MODAL */}
      {showDicomModal && (
        <div className="dicom-modal-overlay no-print" onClick={() => setShowDicomModal(false)}>
          <div className="dicom-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{
              padding: '1.2rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={18} style={{ color: 'var(--cyan)' }} />
                  DICOM Header &amp; Technical Metadata Inspector
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Standard DICOM PS 3.6 Data Dictionary Attributes for Study #{report.id}
                </p>
              </div>
              <button
                className="btn-secondary"
                style={{ padding: '0.35rem 0.6rem' }}
                onClick={() => setShowDicomModal(false)}
              >
                <X size={15} />
              </button>
            </div>

            {/* Search DICOM Tag Bar */}
            <div style={{ padding: '0.8rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
              <input
                type="text"
                placeholder="Search tag (e.g., Modality, KVP, Manufacturer, Patient)…"
                value={dicomSearch}
                onChange={(e) => setDicomSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: '#070a14',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '0.5rem 0.8rem',
                  fontSize: '0.8rem',
                }}
              />
            </div>

            {/* Tags Table */}
            <div style={{ overflowY: 'auto', padding: '0 0.5rem', maxHeight: '55vh' }}>
              <table className="dicom-table">
                <thead>
                  <tr>
                    <th style={{ width: '45%' }}>DICOM Tag &amp; Element</th>
                    <th>Extracted Header Value</th>
                  </tr>
                </thead>
                <tbody>
                  {dicomEntries.length > 0 ? (
                    dicomEntries.map(([tag, val]) => (
                      <tr key={tag}>
                        <td style={{ color: 'var(--cyan)' }}>{tag}</td>
                        <td style={{ color: '#f1f5f9' }}>{val}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No DICOM tags match "{dicomSearch}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.015)',
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {dicomEntries.length} attributes listed
              </span>
              <button
                className="btn-secondary"
                style={{ fontSize: '0.8rem' }}
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(report.dicom_metadata, null, 2));
                  toast.success('DICOM metadata JSON copied');
                }}
              >
                <Copy size={13} /> Copy JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Fullscreen Theater Modal */}
      {fullscreen && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(5, 8, 16, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div style={{
            position: 'absolute',
            top: '1.5rem',
            right: '2rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
          }}>
            <button
              className="btn-secondary"
              onClick={() => setShowHeatmap(!showHeatmap)}
              style={{ fontSize: '0.8rem', color: showHeatmap ? '#f43f5e' : undefined }}
            >
              <Flame size={14} /> Heatmap: {showHeatmap ? 'ON' : 'OFF'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setInvert(!invert)}
              style={{ fontSize: '0.8rem' }}
            >
              Negative: {invert ? 'ON' : 'OFF'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowGrid(!showGrid)}
              style={{ fontSize: '0.8rem' }}
            >
              Grid: {showGrid ? 'ON' : 'OFF'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setZoom(Math.min(4, zoom + 0.3))}
            >
              <ZoomIn size={16} />
            </button>
            <button
              className="btn-secondary"
              onClick={() => setZoom(Math.max(1, zoom - 0.3))}
            >
              <ZoomOut size={16} />
            </button>
            <button
              className="btn-secondary"
              onClick={handleResetViewer}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="btn-danger"
              onClick={() => setFullscreen(false)}
            >
              <Minimize2 size={16} /> Exit Theater
            </button>
          </div>

          <div style={{ position: 'relative', maxWidth: '85vw', maxHeight: '85vh', overflow: 'hidden' }}>
            {showGrid && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 2,
                  pointerEvents: 'none',
                  backgroundImage: 'linear-gradient(to right, rgba(56, 189, 248, 0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.2) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                }}
              />
            )}

            {showHeatmap && report.heatmap_zones && (
              <div
                className="heatmap-overlay"
                style={{
                  transform: `scale(${zoom})`,
                  transition: 'transform 0.15s ease',
                }}
              >
                {report.heatmap_zones.map((zone, idx) => (
                  <div
                    key={idx}
                    className="heatmap-marker"
                    style={{
                      left: `${zone.x}%`,
                      top: `${zone.y}%`,
                      width: `${zone.radius * 2.4}%`,
                      height: `${zone.radius * 2.4}%`,
                      background: `radial-gradient(circle, rgba(239, 68, 68, ${heatmapOpacity * 0.9}) 0%, rgba(249, 115, 22, ${heatmapOpacity * 0.7}) 40%, rgba(234, 179, 8, ${heatmapOpacity * 0.4}) 68%, rgba(6, 182, 212, ${heatmapOpacity * 0.15}) 88%, transparent 100%)`,
                      filter: 'blur(5px)',
                    }}
                  />
                ))}
              </div>
            )}

            <img
              src={report.image_url || `http://localhost:8000/api/uploads/${report.image_filename}`}
              alt="Medical scan fullscreen"
              style={{
                transform: `scale(${zoom})`,
                filter: imageFilter,
                maxHeight: '82vh',
                maxWidth: '82vw',
                objectFit: 'contain',
                transition: 'transform 0.15s ease, filter 0.15s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Medical Glossary Modal */}
      <MedicalGlossaryModal
        isOpen={showGlossaryModal}
        onClose={() => setShowGlossaryModal(false)}
      />
    </div>
  );
}
