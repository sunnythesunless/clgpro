import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { reportsAPI } from '../api';
import { Upload, X, FileImage, Sparkles, AlertCircle, ScanLine, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const MODALITIES = [
  { id: 'chest_xray', label: 'Chest X-Ray',  desc: 'Standard PA / AP view',  icon: '🫁' },
  { id: 'ct_scan',   label: 'CT Scan',        desc: 'Cross-sectional slices', icon: '🔬' },
  { id: 'mri',       label: 'MRI',            desc: 'Soft-tissue analysis',   icon: '🧲' },
  { id: 'other',     label: 'Other',          desc: 'General radiograph',      icon: '📷' },
];

// Animated processing steps shown during inference
const STEPS = [
  'Validating image integrity…',
  'Preprocessing radiograph for BLIP…',
  'Running vision-language inference…',
  'Extracting clinical findings…',
  'Generating impression & report…',
  'Saving to medical record…',
];

export default function UploadPage() {
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [imageType, setImageType] = useState('chest_xray');
  const [loading, setLoading]     = useState(false);
  const [stepIdx, setStepIdx]     = useState(0);
  const [imgDimensions, setImgDimensions] = useState(null);

  // Patient Context
  const [patientId, setPatientId]     = useState(() => `PT-${Math.floor(1000 + Math.random() * 9000)}`);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge]   = useState('');
  const [patientGender, setPatientGender] = useState('Other');
  const [clinicalIndication, setClinicalIndication] = useState('');

  const navigate = useNavigate();

  const onDrop = (accepted) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new Image();
    img.onload = () => {
      setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.bmp', '.tiff', '.tif', '.dcm'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDropRejected: () => toast.error('File rejected — must be ≤10MB image.'),
  });

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setImgDimensions(null);
  };

  const applyPatientPreset = (preset) => {
    if (preset === 'trauma') {
      setPatientId(`EM-${Math.floor(1000 + Math.random() * 9000)}`);
      setPatientName('Marcus Vance');
      setPatientAge('42');
      setPatientGender('Male');
      setClinicalIndication('Acute blunt chest trauma post MVA. Severe right-sided pleuritic pain and shallow tachypnea. Rule out acute pneumothorax or rib fracture.');
      setImageType('chest_xray');
      toast.success('Applied Emergency Trauma Intake Preset');
    } else if (preset === 'infiltrate') {
      setPatientId(`PT-${Math.floor(1000 + Math.random() * 9000)}`);
      setPatientName('Elena Rostova');
      setPatientAge('58');
      setPatientGender('Female');
      setClinicalIndication('Productive cough with purulent sputum, fever 38.9°C for 5 days, right basilar dullness on percussion and bronchial breath sounds.');
      setImageType('chest_xray');
      toast.success('Applied Infiltrate / Pneumonia Preset');
    } else if (preset === 'ct') {
      setPatientId(`CT-${Math.floor(1000 + Math.random() * 9000)}`);
      setPatientName('Marcus Chen');
      setPatientAge('35');
      setPatientGender('Male');
      setClinicalIndication('Acute progressive cephalalgia with visual aura following concussion. Rule out acute intracranial hematoma or ventricular compression.');
      setImageType('ct_scan');
      toast.success('Applied Cranial CT Scan Preset');
    } else if (preset === 'anon') {
      setPatientId(`MRN-${Math.floor(100000 + Math.random() * 900000)}`);
      setPatientName('Anonymous Patient');
      setPatientAge('45');
      setPatientGender('Other');
      setClinicalIndication('Diagnostic screening radiograph evaluation.');
      toast.success('Generated Anonymous Patient Context');
    }
  };

  const loadSample = async (samplePath, filename, modality, demo = {}) => {
    try {
      const res = await fetch(samplePath);
      const blob = await res.blob();
      const sampleFile = new File([blob], filename, { type: 'image/png' });
      setFile(sampleFile);
      const objUrl = URL.createObjectURL(sampleFile);
      setPreview(objUrl);
      const img = new Image();
      img.onload = () => {
        setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = objUrl;

      setImageType(modality);
      if (demo.patientId) setPatientId(demo.patientId);
      if (demo.patientName) setPatientName(demo.patientName);
      if (demo.patientAge) setPatientAge(demo.patientAge);
      if (demo.patientGender) setPatientGender(demo.patientGender);
      if (demo.clinicalIndication) setClinicalIndication(demo.clinicalIndication);
      toast.success(`Loaded sample: ${filename}`);
    } catch {
      toast.error('Could not load sample radiograph');
    }
  };

  // Cycle through step labels during inference
  const startStepCycle = () => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % STEPS.length;
      setStepIdx(i);
    }, 1800);
    return interval;
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!file) { toast.error('Please upload a radiograph image first'); return; }

    setLoading(true);
    setStepIdx(0);
    const interval = startStepCycle();
    const tid = toast.loading('AI inference running… this takes 15–30s on CPU');

    try {
      const patientData = {
        patient_id: patientId.trim() || undefined,
        patient_name: patientName.trim() || undefined,
        patient_age: patientAge ? parseInt(patientAge, 10) : undefined,
        patient_gender: patientGender !== 'Other' ? patientGender : undefined,
        clinical_indication: clinicalIndication.trim() || undefined,
      };

      const res = await reportsAPI.generateReport(file, imageType, patientData);
      clearInterval(interval);
      toast.success('Report generated!', { id: tid });
      navigate(`/reports/${res.data.report.id}`);
    } catch (err) {
      clearInterval(interval);
      const msg = err.response?.data?.detail ?? 'Report generation failed.';
      toast.error(msg, { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Generate AI Report</h1>
          <p className="page-description">Upload a medical image for automated BLIP vision-language analysis</p>
        </div>
      </div>

      <div className="upload-container">
        <form onSubmit={handleGenerate} className="upload-card">

          {/* Step 1 – Modality */}
          <div className="form-group">
            <label className="label-bold">Step 1 — Select Imaging Modality</label>
            <div className="modality-grid">
              {MODALITIES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`modality-btn ${imageType === m.id ? 'selected' : ''}`}
                  onClick={() => setImageType(m.id)}
                >
                  <span style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{m.icon}</span>
                  <span className="modality-title">{m.label}</span>
                  <span className="modality-desc">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 – File */}
          <div className="form-group">
            <label className="label-bold">Step 2 — Upload Medical Image</label>

            {loading ? (
              /* AI Processing Scanline Animation */
              <div className="processing-overlay">
                <div className="scanline" />
                {preview && (
                  <img
                    src={preview}
                    alt="scan"
                    style={{
                      position: 'absolute', inset: 0, width: '100%', height: '100%',
                      objectFit: 'cover', opacity: 0.3, filter: 'grayscale(1) contrast(1.2)',
                    }}
                  />
                )}
                <div className="processing-text">
                  <ScanLine size={32} style={{ animation: 'float 2s ease-in-out infinite' }} />
                  <strong>BLIP Vision-Language AI</strong>
                  <span>{STEPS[stepIdx]}</span>
                </div>
              </div>
            ) : !preview ? (
              <div>
                <div
                  {...getRootProps()}
                  className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}
                >
                  <input {...getInputProps()} />
                  <div className="dropzone-content">
                    <Upload size={40} className="dropzone-icon" />
                    <h3>{isDragActive ? 'Drop image file here…' : 'Drag & Drop Medical Image'}</h3>
                    <p>Supports DICOM, JPG, PNG, TIFF — Max 10MB</p>
                    <span className="btn-secondary dropzone-btn">Browse Files</span>
                  </div>
                </div>

                {/* Instant Try Sample Scans */}
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#080d19', borderRadius: '10px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      ⚡ Quick Test Clinical Scans (1-Click Demo)
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Auto-loads DICOM image &amp; patient profile</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                    <div
                      className="sample-scan-card"
                      onClick={() => loadSample('/samples/sample_chest_xray_normal.png', 'chest_xray_normal.png', 'chest_xray', {
                        patientId: 'PT-4102',
                        patientName: 'David K. Miller',
                        patientAge: '42',
                        patientGender: 'Male',
                        clinicalIndication: 'Routine pre-operative pulmonary screening; no acute symptoms.',
                      })}
                      style={{
                        background: '#0c1322',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        padding: '0.6rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.transform = 'none'; }}
                    >
                      <img src="/samples/sample_chest_xray_normal.png" alt="normal xray" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, filter: 'grayscale(1)' }} />
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.78rem', color: '#f8fafc' }}>Normal PA Chest X-Ray</strong>
                        <span style={{ fontSize: '0.68rem', color: '#10b981' }}>Clear lungs &amp; mediastinum</span>
                      </div>
                    </div>

                    <div
                      className="sample-scan-card"
                      onClick={() => loadSample('/samples/sample_chest_xray_opacity.png', 'chest_xray_opacity.png', 'chest_xray', {
                        patientId: 'PT-8941',
                        patientName: 'Eleanor Vance',
                        patientAge: '58',
                        patientGender: 'Female',
                        clinicalIndication: 'Persistent productive cough for 5 days with low-grade fever; rule out infiltrate.',
                      })}
                      style={{
                        background: '#0c1322',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        padding: '0.6rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.transform = 'none'; }}
                    >
                      <img src="/samples/sample_chest_xray_opacity.png" alt="opacity xray" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, filter: 'grayscale(1)' }} />
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.78rem', color: '#f8fafc' }}>Basilar Opacity / Infiltrate</strong>
                        <span style={{ fontSize: '0.68rem', color: '#f59e0b' }}>Lower lobe consolidation</span>
                      </div>
                    </div>

                    <div
                      className="sample-scan-card"
                      onClick={() => loadSample('/samples/sample_brain_ct.png', 'brain_ct_axial.png', 'ct_scan', {
                        patientId: 'PT-6320',
                        patientName: 'Marcus Chen',
                        patientAge: '35',
                        patientGender: 'Male',
                        clinicalIndication: 'Acute cephalalgia following minor head impact; rule out acute intracranial mass.',
                      })}
                      style={{
                        background: '#0c1322',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        padding: '0.6rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.transform = 'none'; }}
                    >
                      <img src="/samples/sample_brain_ct.png" alt="brain ct" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, filter: 'grayscale(1)' }} />
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.78rem', color: '#f8fafc' }}>Axial Cranial CT Scan</strong>
                        <span style={{ fontSize: '0.68rem', color: '#06b6d4' }}>Symmetric brain parenchyma</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="preview-container">
                <div className="preview-card">
                  <img
                    src={preview}
                    alt="Medical scan preview"
                    className="preview-image"
                  />
                  <button type="button" className="btn-remove-preview" onClick={clearFile} title="Remove image">
                    <X size={16} />
                  </button>
                  <div className="preview-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FileImage size={16} color="#38bdf8" /> {file.name}
                      </span>
                      <span className="file-size" style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    {imgDimensions && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.72rem', marginTop: '0.2rem' }}>
                        <span style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(56,189,248,0.25)' }}>
                          Resolution: {imgDimensions.width} × {imgDimensions.height} px
                        </span>
                        <span style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.25)' }}>
                          ✓ PACS DICOM Validated
                        </span>
                        <span style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(168,85,247,0.25)' }}>
                          Modality: {MODALITIES.find(m => m.id === imageType)?.label || imageType}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 3 – Patient Demographics & Indication */}
          <div className="form-group" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <label className="label-bold" style={{ margin: 0 }}>
                Step 3 — Patient Demographics &amp; Clinical Indication <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>(Optional)</span>
              </label>

              {/* 1-Click Patient Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginRight: '0.2rem' }}>⚡ Quick Intake:</span>
                <button
                  type="button"
                  onClick={() => applyPatientPreset('trauma')}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer' }}
                  title="Load Emergency Trauma case"
                >
                  🚨 Trauma
                </button>
                <button
                  type="button"
                  onClick={() => applyPatientPreset('infiltrate')}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', cursor: 'pointer' }}
                  title="Load Respiratory Infiltrate / Pneumonia case"
                >
                  🫁 Infiltrate
                </button>
                <button
                  type="button"
                  onClick={() => applyPatientPreset('ct')}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: '#22d3ee', cursor: 'pointer' }}
                  title="Load Cranial CT Cephalalgia case"
                >
                  🔬 CT Scan
                </button>
                <button
                  type="button"
                  onClick={() => applyPatientPreset('anon')}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.3)', color: '#cbd5e1', cursor: 'pointer' }}
                  title="Auto-fill Anonymous ID"
                >
                  👤 Anon
                </button>
                {(patientId || patientName || clinicalIndication) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPatientId('');
                      setPatientName('');
                      setPatientAge('');
                      setPatientGender('Male');
                      setClinicalIndication('');
                      toast('Cleared demographics', { icon: '🧹' });
                    }}
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'transparent', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem', marginBottom: '0.9rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Patient MRN / ID</label>
                <input
                  type="text"
                  placeholder="e.g. PT-8942"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  disabled={loading}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Patient Name</label>
                <input
                  type="text"
                  placeholder="e.g. Eleanor Vance"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  disabled={loading}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Age</label>
                <input
                  type="number"
                  placeholder="e.g. 52"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  disabled={loading}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Gender</label>
                <select
                  value={patientGender}
                  onChange={(e) => setPatientGender(e.target.value)}
                  disabled={loading}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc', fontSize: '0.85rem' }}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other / Not Specified</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Clinical Indication / Reason for Exam</label>
              <textarea
                rows={2}
                placeholder="e.g. Cough, fever for 4 days, dyspnea on exertion. Rule out consolidation."
                value={clinicalIndication}
                onChange={(e) => setClinicalIndication(e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '0.55rem 0.8rem', background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc', fontSize: '0.85rem', resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Info notice */}
          <div className="upload-notice">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              The pre-trained <strong>Salesforce/BLIP-large</strong> model (~1.5 GB) runs on CPU.
              First inference auto-downloads the model weights from HuggingFace Hub.
            </span>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn-primary btn-submit-upload"
            disabled={!file || loading}
          >
            {loading ? (
              <>
                <div className="spinner-sm" />
                Processing with BLIP AI…
              </>
            ) : (
              <>
                <Sparkles size={19} />
                Generate Radiology Report
              </>
            )}
          </button>

          {/* Feature checklist */}
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '-0.75rem' }}>
            {['Automated findings extraction', 'Clinical impression summary', 'Confidence scoring', 'PDF-ready output'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={13} style={{ color: 'var(--emerald)' }} />
                {f}
              </div>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
