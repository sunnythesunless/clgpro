import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Activity, User, Mail, Lock, ArrowRight, Shield, Zap, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

const FEATURES = [
  { icon: Zap,      label: 'BLIP Vision AI'       },
  { icon: FileText, label: 'PDF-Ready Reports'     },
  { icon: Shield,   label: 'JWT Authenticated'     },
];

export default function Register() {
  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const { register } = useAuth();
  const navigate     = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) { toast.error('Please fill in all fields'); return; }
    if (password !== confirmPassword)  { toast.error('Passwords do not match'); return; }
    if (password.length < 6)           { toast.error('Password must be ≥ 6 characters'); return; }

    setLoading(true);
    try {
      await register(name, email, password);
      toast.success('Account created! Welcome aboard.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Registration failed');
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
          <p>Create your practitioner account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="name">Full Name / Title</label>
            <div className="input-wrapper">
              <User className="input-icon" size={17} />
              <input
                id="name"
                type="text"
                placeholder="Dr. Alex Vance"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={17} />
              <input
                id="email"
                type="email"
                placeholder="alex.vance@hospital.org"
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
                placeholder="At least 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={17} />
              <input
                id="confirmPassword"
                type="password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary auth-btn" disabled={loading}>
            {loading ? (
              <><div className="spinner-sm" /> Creating account…</>
            ) : (
              <>Create Account <ArrowRight size={16} /></>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already registered?{' '}
            <Link to="/login" className="auth-link">Sign in →</Link>
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
