import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { reportsAPI, healthAPI } from '../api';
import {
  FileText, Calendar, Zap, Upload, ArrowUpRight,
  Cpu, TrendingUp, Clock, ShieldCheck, Activity,
  AlertTriangle, UserCheck, Server, HardDrive,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Sector,
} from 'recharts';

// ── Animated counter hook ─────────────────────────────────────
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return; }
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (frame >= totalFrames) { setValue(target); clearInterval(timer); }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

// ── Custom bar tooltip ────────────────────────────────────────
const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0c1120',
      border: '1px solid #1e293b',
      borderRadius: 8,
      padding: '0.5rem 0.9rem',
      fontSize: '0.8rem',
    }}>
      <div style={{ color: '#8b9ec8', marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#06b6d4', fontWeight: 700 }}>{payload[0].value} reports</div>
    </div>
  );
};

// ── Active pie sector ─────────────────────────────────────────
const renderActiveShape = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" fill="#f0f6ff" fontSize={18} fontWeight={800}>
        {value}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#8b9ec8" fontSize={11}>
        {payload.name?.replace('_', ' ').toUpperCase()}
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 4} outerRadius={innerRadius - 1} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

const PIE_COLORS = ['#06b6d4', '#3b82f6', '#8b5cf6', '#10b981'];

// ── Format uptime ─────────────────────────────────────────────
function fmtUptime(s) {
  if (!s && s !== 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePieIndex, setActivePieIndex] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [s, h, m] = await Promise.all([
          reportsAPI.getDashboard(),
          healthAPI.check(),
          healthAPI.getMetrics().catch(() => ({ data: null })),
        ]);
        setStats(s.data);
        setHealth(h.data);
        if (m?.data) setMetrics(m.data);
      } catch {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Animated counters — only start after data loads
  const totalReports   = useCountUp(loading ? 0 : stats?.total_reports ?? 0);
  const monthReports   = useCountUp(loading ? 0 : stats?.reports_this_month ?? 0);
  const avgConf        = useCountUp(loading ? 0 : Math.round((stats?.avg_confidence ?? 0) * 100));
  const highConf       = useCountUp(loading ? 0 : stats?.high_confidence_count ?? 0);
  const urgentCount    = useCountUp(loading ? 0 : stats?.urgent_reports_count ?? 0);
  const finalizedCount = useCountUp(loading ? 0 : stats?.finalized_reports_count ?? 0);

  // Pie data from image_type_breakdown
  const pieData = stats
    ? Object.entries(stats.image_type_breakdown ?? {}).map(([name, value]) => ({ name, value }))
    : [];

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="page-header">
          <div>
            <div className="skeleton skeleton-title" style={{ width: 240, marginBottom: 8 }} />
            <div className="skeleton skeleton-text"  style={{ width: 300 }} />
          </div>
        </div>
        <div className="stats-grid">
          {[0,1,2,3].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: 50, height: 50, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '60%', marginBottom: 8 }} />
                <div className="skeleton skeleton-stat" style={{ width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="chart-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton skeleton-card" style={{ height: 280 }} />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Radiology Overview</h1>
          <p className="page-description">Real-time system telemetry &amp; AI analysis history</p>
        </div>
        <Link to="/upload" className="btn-primary">
          <Upload size={17} />
          New Analysis
        </Link>
      </div>

      {/* Model Status Banner */}
      <div className={`status-card ${health?.model_loaded ? 'status-online' : 'status-warning'}`}>
        <div className={`status-dot ${health?.model_loaded ? '' : 'loading'}`} />
        <div className="status-icon">
          <Cpu size={22} />
        </div>
        <div className="status-info">
          <h3>AI Engine · {health?.model_name ?? 'BLIP Vision-Language'}</h3>
          <p>
            Status:{' '}
            <strong style={{ color: health?.model_loaded ? 'var(--emerald)' : 'var(--amber)' }}>
              {health?.model_loaded ? 'Ready & Loaded (CPU)' : 'Loading model in background…'}
            </strong>
          </p>
        </div>
        <div className="status-meta">
          <span className="badge">{health?.status ?? 'active'}</span>
          <span className="uptime-badge">↑ {fmtUptime(health?.uptime_seconds)}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon icon-blue"><FileText size={22} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Reports</span>
            <span className="stat-value">{totalReports}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon icon-emerald"><Calendar size={22} /></div>
          <div className="stat-content">
            <span className="stat-label">This Month</span>
            <span className="stat-value">{monthReports}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon icon-purple"><Zap size={22} /></div>
          <div className="stat-content">
            <span className="stat-label">Avg Confidence</span>
            <span className="stat-value">{avgConf}<span style={{ fontSize: '1rem', fontWeight: 600, marginLeft: 2 }}>%</span></span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon icon-cyan"><ShieldCheck size={22} /></div>
          <div className="stat-content">
            <span className="stat-label">High Confidence</span>
            <span className="stat-value">{highConf}</span>
            <span className="stat-trend">
              <TrendingUp size={12} /> ≥80% score
            </span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #f43f5e' }}>
          <div className="stat-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>
            <AlertTriangle size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Urgent Alerts</span>
            <span className="stat-value" style={{ color: urgentCount > 0 ? '#f43f5e' : 'inherit' }}>{urgentCount}</span>
            <span className="stat-trend" style={{ color: urgentCount > 0 ? '#f43f5e' : 'var(--text-muted)' }}>
              {urgentCount > 0 ? 'Requires attention' : 'No critical alerts'}
            </span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #10b981' }}>
          <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <UserCheck size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Signed Reports</span>
            <span className="stat-value" style={{ color: '#34d399' }}>{finalizedCount}</span>
            <span className="stat-trend" style={{ color: '#34d399' }}>
              Finalized records
            </span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="chart-grid">
        {/* Weekly Activity Bar Chart */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <p className="chart-title">Weekly Activity</p>
              <p className="chart-subtitle">Reports generated in the last 7 days</p>
            </div>
            <Activity size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats?.weekly_data ?? []} barSize={28} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="day"
                tick={{ fill: '#4a5980', fontSize: 11, fontFamily: 'Inter' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#4a5980', fontSize: 11, fontFamily: 'Inter' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar
                dataKey="count"
                radius={[5, 5, 0, 0]}
                fill="url(#barGrad)"
              />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#06b6d4" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Image Type Pie Chart */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <p className="chart-title">Modality Breakdown</p>
              <p className="chart-subtitle">Distribution by image type</p>
            </div>
          </div>
          {pieData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No data yet
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                    activeIndex={activePieIndex}
                    activeShape={renderActiveShape}
                    onMouseEnter={(_, i) => setActivePieIndex(i)}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                {pieData.map((item, i) => (
                  <div key={i} className="legend-item">
                    <span className="legend-label">
                      <span className="legend-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {item.name.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="legend-count">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent Reports Table */}
      <div className="section-card">
        <div className="section-header">
          <h2><FileText size={18} /> Recent Reports</h2>
          <Link to="/reports" className="view-all-link">
            View All <ArrowUpRight size={15} />
          </Link>
        </div>

        {!stats?.recent_reports?.length ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <FileText size={40} className="empty-icon" />
            <p>No reports yet — upload your first radiograph to get started.</p>
            <Link to="/upload" className="btn-primary" style={{ marginTop: '0.5rem' }}>
              <Upload size={16} /> Upload Image
            </Link>
          </div>
        ) : (
          <div className="reports-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Patient</th>
                  <th>File</th>
                  <th>Modality</th>
                  <th>Triage</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_reports.map((r) => {
                  const conf    = Math.round(r.confidence_score * 100);
                  const level   = r.confidence_level || (conf >= 80 ? 'HIGH' : conf >= 55 ? 'MEDIUM' : 'LOW');
                  const cls     = level === 'HIGH' ? 'conf-high' : level === 'MEDIUM' ? 'conf-medium' : 'conf-low';
                  const isFinal = r.status === 'finalized';
                  return (
                    <tr key={r.id}>
                      <td><span style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>#{r.id}</span></td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.82rem' }}>
                          {r.patient_name || r.patient_id || '—'}
                        </span>
                      </td>
                      <td className="font-medium" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.original_filename}</td>
                      <td><span className="tag-type">{r.image_type.replace('_', ' ')}</span></td>
                      <td>
                        {r.urgency_level === 'stat_urgent' ? (
                          <span style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: '1px solid #f43f5e', borderRadius: '4px', padding: '0.15rem 0.4rem', fontSize: '0.68rem', fontWeight: 700 }}>STAT</span>
                        ) : r.urgency_level === 'attention' ? (
                          <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: '4px', padding: '0.15rem 0.4rem', fontSize: '0.68rem', fontWeight: 700 }}>ATTENTION</span>
                        ) : (
                          <span style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', borderRadius: '4px', padding: '0.15rem 0.4rem', fontSize: '0.68rem', fontWeight: 600 }}>ROUTINE</span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: isFinal ? '#34d399' : 'var(--text-muted)',
                        }}>
                          {isFinal ? 'Verified' : 'Preliminary'}
                        </span>
                      </td>
                      <td><span className={`confidence-pill ${cls}`}>{conf}%</span></td>
                      <td>
                        <span className="time-cell">
                          <Clock size={13} />
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        <Link to={`/reports/${r.id}`} className="btn-table">
                          View <ArrowUpRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System & Hardware Telemetry Card */}
      {metrics && (
        <div className="section-card" style={{ marginTop: '1.5rem', background: 'linear-gradient(135deg, #070c17, #0b1322)' }}>
          <div className="section-header" style={{ marginBottom: '1rem' }}>
            <h2><Server size={18} style={{ color: 'var(--cyan)' }} /> Clinical AI Inference Engine Telemetry</h2>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
              {metrics.framework}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#070a14', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Inference Hardware</span>
              <strong style={{ fontSize: '0.92rem', color: '#38bdf8' }}>{metrics.device?.toUpperCase()} · Optimized FP32</strong>
            </div>

            <div style={{ background: '#070a14', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Active Neural Model</span>
              <strong style={{ fontSize: '0.88rem', color: '#10b981' }}>BLIP Large Vision2Seq</strong>
            </div>

            <div style={{ background: '#070a14', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Memory Allocated</span>
              <strong style={{ fontSize: '0.92rem', color: '#f59e0b' }}>{metrics.memory_footprint_mb} MB RAM</strong>
            </div>

            <div style={{ background: '#070a14', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Cumulative Inferences</span>
              <strong style={{ fontSize: '0.92rem', color: '#a78bfa' }}>{metrics.total_studies_processed} Radiographs Evaluated</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
