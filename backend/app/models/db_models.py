"""
SQLAlchemy ORM Models
Database table definitions for Users and Reports.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    """User account for authentication."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Practitioner Credentials & Institution Details
    hospital_name = Column(String(150), nullable=True)
    department = Column(String(150), nullable=True)
    license_number = Column(String(80), nullable=True)
    signature_title = Column(String(150), nullable=True)

    # Relationship to reports
    reports = relationship("Report", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, name={self.name}, email={self.email})>"


class Report(Base):
    """Generated medical image report."""

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    image_filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)

    # Patient & Clinical Context
    patient_id = Column(String(50), nullable=True)
    patient_name = Column(String(100), nullable=True)
    patient_age = Column(Integer, nullable=True)
    patient_gender = Column(String(20), nullable=True)
    clinical_indication = Column(Text, nullable=True)

    # AI-Generated Report Content
    findings = Column(Text, nullable=False)
    impression = Column(Text, nullable=False)
    full_report = Column(Text, nullable=False)
    confidence_score = Column(Float, default=0.0)

    # Triage & Verification Workflow
    urgency_level = Column(String(20), default="normal")  # normal, attention, stat_urgent
    status = Column(String(20), default="preliminary")    # preliminary, finalized
    radiologist_notes = Column(Text, nullable=True)
    verified_by = Column(String(100), nullable=True)
    verified_at = Column(DateTime, nullable=True)

    # Metadata
    image_type = Column(String(50), default="chest_xray")  # chest_xray, ct_scan, mri
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relationship to user
    user = relationship("User", back_populates="reports")

    def __repr__(self):
        return f"<Report(id={self.id}, user_id={self.user_id}, image={self.original_filename})>"
