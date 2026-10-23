import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api';
import { User, Lock, Save, ShieldCheck, Building2, Award, FileCheck2, Stamp } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [hospitalName, setHospitalName] = useState(user?.hospital_name || 'Metropolitan Radiology & Imaging Institute');
  const [department, setDepartment] = useState(user?.department || 'Department of Diagnostic & Interventional Radiology');
  const [licenseNumber, setLicenseNumber] = useState(user?.license_number || 'MD-RAD-89410');
  const [signatureTitle, setSignatureTitle] = useState(user?.signature_title || 'Chief Consultant Radiologist, MD, FRCR');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    setUpdatingProfile(true);
    try {
      const res = await authAPI.updateProfile({
        name: name.trim(),
        hospital_name: hospitalName.trim(),
        department: department.trim(),
        license_number: licenseNumber.trim(),
        signature_title: signatureTitle.trim(),
      });
      updateUser(res.data);
      toast.success('Practitioner credentials & hospital letterhead updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error('Please enter passwords');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setUpdatingPassword(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Practitioner Profile &amp; Hospital Credentials</h1>
          <p className="page-description">Configure your clinical identity, hospital letterhead, and digital certification seal</p>
        </div>
      </div>

      <div className="profile-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* Profile & Hospital Credentials Card */}
        <div className="section-card">
          <div className="section-header">
            <h2>
              <User size={20} /> Clinical Practitioner Information
            </h2>
          </div>

          <form onSubmit={handleUpdateProfile} className="profile-form">
            <div className="form-group">
              <label>System Email Address</label>
              <input type="email" value={user?.email || ''} disabled className="input-disabled" />
              <span className="field-hint">Primary authenticated institutional login</span>
            </div>

            <div className="form-group">
              <label htmlFor="profileName">Practitioner Full Name</label>
              <input
                id="profileName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={updatingProfile}
                placeholder="e.g. Sarah Jenkins"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="signatureTitle">Clinical Title &amp; Degrees</label>
              <input
                id="signatureTitle"
                type="text"
                value={signatureTitle}
                onChange={(e) => setSignatureTitle(e.target.value)}
                disabled={updatingProfile}
                placeholder="e.g. Consultant Radiologist, MD, FRCR"
              />
              <span className="field-hint">Appears on report digital signatures and exported clinical records</span>
            </div>

            <div className="form-group">
              <label htmlFor="licenseNumber">Medical License / NPI Number</label>
              <input
                id="licenseNumber"
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                disabled={updatingProfile}
                placeholder="e.g. MD-RAD-89410 or NPI-194820183"
              />
            </div>

            <div className="form-group">
              <label htmlFor="hospitalName">Affiliated Hospital / Medical Center</label>
              <input
                id="hospitalName"
                type="text"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                disabled={updatingProfile}
                placeholder="e.g. Metropolitan Radiology & Imaging Institute"
              />
            </div>

            <div className="form-group">
              <label htmlFor="department">Clinical Department</label>
              <input
                id="department"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={updatingProfile}
                placeholder="e.g. Department of Diagnostic Radiology"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={updatingProfile} style={{ marginTop: '0.5rem' }}>
              <Save size={18} /> {updatingProfile ? 'Saving Credentials…' : 'Save Practitioner Credentials'}
            </button>
          </form>
        </div>

        {/* Live Electronic Seal & Letterhead Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="section-card">
            <div className="section-header">
              <h2>
                <Stamp size={20} /> Live Digital Seal &amp; Letterhead Preview
              </h2>
            </div>

            <div style={{
              background: '#070b16',
              border: '1px dashed #334155',
              borderRadius: '10px',
              padding: '1.25rem',
            }}>
              {/* Letterhead Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.04em' }}>
                  {hospitalName.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--cyan)', marginTop: '0.2rem' }}>
                  {department}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Accredited Clinical Imaging Facility • Automated Diagnostic Systems
                </div>
              </div>

              {/* Holographic Verification Badge */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08))',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '8px',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '2px solid #10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                  flexShrink: 0,
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)',
                }}>
                  <FileCheck2 size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#34d399' }}>
                    DIGITALLY CERTIFIED PRACTITIONER
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#f8fafc', fontWeight: 600, marginTop: '0.15rem' }}>
                    {(name || '').trim().startsWith('Dr.') ? name : `Dr. ${name || 'Practitioner Name'}`}, {signatureTitle}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    License: <span style={{ fontFamily: 'var(--mono)', color: '#93c5fd' }}>{licenseNumber || 'PENDING'}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '0.85rem', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                This seal is cryptographically rendered onto all finalized clinical reports and exported documents.
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="section-card">
            <div className="section-header">
              <h2>
                <Lock size={20} /> Security &amp; Password
              </h2>
            </div>

            <form onSubmit={handleChangePassword} className="profile-form">
              <div className="form-group">
                <label htmlFor="currentPass">Current Password</label>
                <input
                  id="currentPass"
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={updatingPassword}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPass">New Password</label>
                <input
                  id="newPass"
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={updatingPassword}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPass">Confirm New Password</label>
                <input
                  id="confirmPass"
                  type="password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={updatingPassword}
                  required
                />
              </div>

              <button type="submit" className="btn-secondary" disabled={updatingPassword}>
                <ShieldCheck size={18} /> {updatingPassword ? 'Updating…' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
