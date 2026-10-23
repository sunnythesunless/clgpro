import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Activity, Mail, Lock, ArrowRight, Shield, Zap, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

const FEATURES = [
  { icon: Zap,      label: 'BLIP AI Analysis'    },
  { icon: FileText, label: 'Structured Reports'   },
  { icon: Shield,   label: 'Secure & Private'     },
];

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please fill in all fields'); return; }
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-grid-bg" />

      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <Activity size={34} className="brand-icon" />
            <h1>MedReporter AI</h1>
          </div>
          <p>Automated radiology report generation</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={17} />
              <input
                id="email"
                type="email"
                placeholder="doctor@hospital.org"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={17} />
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary auth-btn" disabled={loading}>
            {loading ? (
              <><div className="spinner-sm" /> Signing in…</>
            ) : (
              <>Sign In <ArrowRight size={16} /></>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            No account?{' '}
            <Link to="/register" className="auth-link">Create one free →</Link>
          </p>
        </div>

        <div className="auth-features">
          {FEATURES.map(({ icon: Icon, label }) => (
            <span key={label} className="auth-feature-pill">
              <Icon size={11} /> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
