"""
Pydantic Schemas
Request/Response validation models for the API.
"""

from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, EmailStr, Field


# ========================
# Auth Schemas
# ========================

class UserRegister(BaseModel):
    """Registration request schema."""
    name: str = Field(..., min_length=2, max_length=100, examples=["John Doe"])
    email: EmailStr = Field(..., examples=["john@gmail.com"])
    password: str = Field(..., min_length=6, max_length=128, examples=["password123"])


class UserLogin(BaseModel):
    """Login request schema."""
    email: EmailStr = Field(..., examples=["john@gmail.com"])
    password: str = Field(..., examples=["password123"])


class UserUpdate(BaseModel):
    """Update user profile request."""
    name: Optional[str] = Field(None, min_length=2, max_length=100, examples=["Jane Doe"])
    hospital_name: Optional[str] = Field(None, max_length=150, examples=["Metropolitan Imaging Institute"])
    department: Optional[str] = Field(None, max_length=150, examples=["Department of Diagnostic Radiology"])
    license_number: Optional[str] = Field(None, max_length=80, examples=["MD-RAD-89410"])
    signature_title: Optional[str] = Field(None, max_length=150, examples=["Consultant Radiologist, MD, FRCR"])


class PasswordChange(BaseModel):
    """Change password request."""
    current_password: str = Field(..., min_length=6, examples=["oldpassword123"])
    new_password: str = Field(..., min_length=6, max_length=128, examples=["newpassword456"])


class UserResponse(BaseModel):
    """User info response."""
    id: int
    name: str
    email: str
    created_at: datetime
    hospital_name: Optional[str] = None
    department: Optional[str] = None
    license_number: Optional[str] = None
    signature_title: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """JWT token response after login/register."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ========================
# Report Schemas
# ========================

class ReportResponse(BaseModel):
    """Single report response."""
    id: int
    image_filename: str
    original_filename: str
    image_url: str = ""  # Populated dynamically
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    clinical_indication: Optional[str] = None
    findings: str
    impression: str
    full_report: str
    confidence_score: float
    confidence_level: str = ""  # HIGH / MEDIUM / LOW — computed
    urgency_level: str = "normal"  # normal / attention / stat_urgent
    status: str = "preliminary"  # preliminary / finalized
    radiologist_notes: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    image_type: str
    created_at: datetime
    heatmap_zones: list[dict[str, Any]] = Field(default_factory=list)
    dicom_metadata: dict[str, str] = Field(default_factory=dict)

    class Config:
        from_attributes = True


class ReportUpdateRequest(BaseModel):
    """Physician edit and sign-off schema."""
    findings: Optional[str] = None
    impression: Optional[str] = None
    radiologist_notes: Optional[str] = None
    urgency_level: Optional[str] = None
    status: Optional[str] = None  # preliminary or finalized


class ReportListResponse(BaseModel):
    """Paginated list of reports."""
    total: int
    page: int
    per_page: int
    reports: list[ReportResponse]


class ReportGenerateResponse(BaseModel):
    """Response after generating a report."""
    message: str = "Report generated successfully"
    report: ReportResponse


class BulkDeleteRequest(BaseModel):
    """Request body for bulk-deleting reports."""
    report_ids: list[int] = Field(..., min_length=1, examples=[[1, 2, 3]])


class BulkDeleteResponse(BaseModel):
    """Response after bulk-deleting reports."""
    deleted_count: int
    message: str


# ========================
# Dashboard / Stats
# ========================

class WeeklyDataPoint(BaseModel):
    """Single day's report count for weekly activity chart."""
    day: str    # "Mon", "Tue", …
    date: str   # "10/09"
    count: int


class DashboardStats(BaseModel):
    """User dashboard statistics."""
    total_reports: int
    reports_this_month: int
    avg_confidence: float
    high_confidence_count: int          # confidence_score >= 0.8
    urgent_reports_count: int = 0       # urgency_level != 'normal'
    finalized_reports_count: int = 0    # status == 'finalized'
    image_type_breakdown: dict[str, int]
    recent_reports: list[ReportResponse]
    weekly_data: list[WeeklyDataPoint]  # Last 7 days


class ReportComparisonResponse(BaseModel):
    """Comparative interval analysis between current study and prior study."""
    current_report: ReportResponse
    prior_report: ReportResponse
    interval_summary: str
    interval_delta_type: str  # improved, stable, progressed, baseline
    findings_delta: str
    timeline_days: int


class ReportChatRequest(BaseModel):
    """Clinical question submitted to the AI Radiologist Copilot."""
    message: str = Field(..., min_length=2, max_length=1000, examples=["What are the differential diagnoses?"])


class ReportChatResponse(BaseModel):
    """AI Radiologist Copilot reasoning reply."""
    reply: str
    suggested_followups: list[str] = Field(default_factory=list)
    clinical_references: list[str] = Field(default_factory=list)


class PatientSummaryResponse(BaseModel):
    """Patient-friendly layperson summary of the radiology report."""
    layperson_overview: str
    key_takeaways: list[str] = Field(default_factory=list)
    reassurances: list[str] = Field(default_factory=list)
    questions_for_doctor: list[str] = Field(default_factory=list)
    urgency_advice: str
    language: str = "en"


class DicomTagsResponse(BaseModel):
    """Authentic DICOM header attributes for the study."""
    report_id: int
    patient_module: dict[str, Any]
    study_module: dict[str, Any]
    series_module: dict[str, Any]
    image_module: dict[str, Any]


# ========================
# General
# ========================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    app_name: str
    version: str
    model_loaded: bool
    model_name: str
    uptime_seconds: int


class ErrorResponse(BaseModel):
    """Error response."""
    detail: str


class MessageResponse(BaseModel):
    """Generic success message response."""
    message: str


# ========================
# Medical Term Glossary
# ========================

class GlossaryItem(BaseModel):
    """Medical term and its clinical translation."""
    term: str
    category: str
    pronunciation: str
    plain_english: str
    clinical_significance: str
    severity_context: str  # "benign", "abnormal", "critical", "anatomy"


class GlossaryResponse(BaseModel):
    """List of medical glossary terms."""
    total: int
    terms: list[GlossaryItem]
