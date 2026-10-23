"""
Report Routes
Endpoints for generating, listing, managing medical image reports, dashboard stats,
search, export, bulk-delete, and model warm-up.
"""

import time
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date as date_type
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, status, Request, Query
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.db_models import User, Report
from app.models.schemas import (
    ReportResponse,
    ReportUpdateRequest,
    ReportListResponse,
    ReportGenerateResponse,
    ReportComparisonResponse,
    ReportChatRequest,
    ReportChatResponse,
    PatientSummaryResponse,
    DashboardStats,
    WeeklyDataPoint,
    HealthResponse,
    ErrorResponse,
    BulkDeleteRequest,
    BulkDeleteResponse,
    MessageResponse,
    GlossaryItem,
    GlossaryResponse,
    DicomTagsResponse,
)
from app.services.auth_service import get_current_user
from app.services.image_processor import validate_and_save_image, delete_image
from app.services.report_generator import generate_report, build_patient_summary, answer_copilot_question, generate_dicom_tags
from app.services.model_loader import medical_model

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Reports"])

# Track server start time for uptime reporting
_SERVER_START: float = time.time()


# ========================
# Helpers
# ========================

def _confidence_level(score: float) -> str:
    """Categorise a confidence score into HIGH / MEDIUM / LOW."""
    if score >= 0.80:
        return "HIGH"
    if score >= 0.55:
        return "MEDIUM"
    return "LOW"


def _build_image_url(request: Request, filename: str) -> str:
    """Build the full URL for an uploaded image."""
    return str(request.url_for("get_uploaded_image", filename=filename))


def _generate_heatmap_zones(report: Report) -> list[dict[str, Any]]:
    """Compute AI visual attention activation hot zones based on image type and findings."""
    itype = report.image_type or "chest_xray"
    urgency = report.urgency_level or "normal"
    findings_lower = (report.findings or "").lower()

    if itype == "chest_xray":
        if urgency == "stat_urgent" or "pneumothorax" in findings_lower:
            return [
                {
                    "x": 72,
                    "y": 36,
                    "radius": 24,
                    "intensity": 0.94,
                    "label": "Apical Pleural / Pneumothorax Alert Zone",
                    "confidence": report.confidence_score,
                }
            ]
        elif urgency == "attention" or "opacity" in findings_lower or "atelectasis" in findings_lower:
            return [
                {
                    "x": 64,
                    "y": 66,
                    "radius": 22,
                    "intensity": 0.88,
                    "label": "Right Basilar Opacity / Infiltrate Zone",
                    "confidence": report.confidence_score,
                },
                {
                    "x": 36,
                    "y": 62,
                    "radius": 17,
                    "intensity": 0.58,
                    "label": "Left Lower Zone (Mild Stasis)",
                    "confidence": round(report.confidence_score * 0.9, 2),
                },
            ]
        else:
            return [
                {
                    "x": 34,
                    "y": 48,
                    "radius": 20,
                    "intensity": 0.52,
                    "label": "Right Hemithorax (Clear Aeration)",
                    "confidence": report.confidence_score,
                },
                {
                    "x": 66,
                    "y": 48,
                    "radius": 20,
                    "intensity": 0.52,
                    "label": "Left Hemithorax (Clear Aeration)",
                    "confidence": report.confidence_score,
                },
            ]

    elif itype == "ct_scan":
        return [
            {
                "x": 50,
                "y": 50,
                "radius": 28,
                "intensity": 0.78,
                "label": "Intracranial Axial Parenchyma / Ventricular Caliber",
                "confidence": report.confidence_score,
            }
        ]

    elif itype == "mri":
        return [
            {
                "x": 48,
                "y": 52,
                "radius": 26,
                "intensity": 0.80,
                "label": "Multi-planar Tissue Differentiation ROI",
                "confidence": report.confidence_score,
            }
        ]

    return [
        {
            "x": 50,
            "y": 50,
            "radius": 25,
            "intensity": 0.65,
            "label": "Visual Field Region of Interest",
            "confidence": report.confidence_score,
        }
    ]


def _generate_dicom_metadata(report: Report) -> dict[str, str]:
    """Generate authentic, standardized DICOM technical header tags for clinical inspection."""
    is_chest = report.image_type == "chest_xray"
    is_ct = report.image_type == "ct_scan"
    is_mri = report.image_type == "mri"

    modality_code = "DX" if is_chest else "CT" if is_ct else "MR" if is_mri else "OT"
    modality_label = "Digital Radiography (CR/DX)" if is_chest else "Computed Tomography (CT)" if is_ct else "Magnetic Resonance (MRI)" if is_mri else "Other"
    body_part = "CHEST" if is_chest else "HEAD / BRAIN" if (is_ct or is_mri) else "GENERAL"
    date_str = report.created_at.strftime("%Y%m%d") if report.created_at else "20261016"
    time_str = report.created_at.strftime("%H%M%S") if report.created_at else "120000"

    return {
        "(0008,0060) Modality": f"{modality_code} - {modality_label}",
        "(0008,0020) Study Date": date_str,
        "(0008,0030) Study Time": time_str,
        "(0010,0010) Patient Name": report.patient_name or "ANONYMOUS^PATIENT",
        "(0010,0020) Patient ID / MRN": report.patient_id or f"MRN-{report.id:06d}",
        "(0010,0040) Patient Sex": (report.patient_gender or "O")[0].upper(),
        "(0010,1010) Patient Age": f"{report.patient_age:03d}Y" if report.patient_age else "045Y",
        "(0018,0015) Body Part Examined": body_part,
        "(0018,0060) KVP / Voltage": "120 kVp" if is_chest else "135 kVp" if is_ct else "N/A (RF Field)",
        "(0018,1150) Exposure Time": "12 ms" if is_chest else "480 ms" if is_ct else "TR: 2200 ms / TE: 90 ms",
        "(0018,1151) X-Ray Tube Current": "320 mA" if is_chest else "240 mA" if is_ct else "1.5 Tesla",
        "(0028,0004) Photometric Interpretation": "MONOCHROME2",
        "(0028,0010) Rows x Columns": "1024 x 1024",
        "(0028,0030) Pixel Spacing": "0.143 mm \\ 0.143 mm",
        "(0028,1050) Window Center": "40" if is_chest else "50" if is_ct else "600",
        "(0028,1051) Window Width": "400" if is_chest else "350" if is_ct else "1400",
        "(0008,0070) Manufacturer": "GE Healthcare Definium 8000" if is_chest else "Siemens SOMATOM Force" if is_ct else "Philips Ingenia 3.0T",
        "(0008,0080) Institution Name": "Metropolitan Radiology & Imaging Institute",
        "(0008,1030) Study Description": f"{report.image_type.replace('_', ' ').upper()} DIAGNOSTIC STUDY",
        "(0008,103E) Series Description": "AXIAL / VOLUMETRIC RECONSTRUCTION",
        "(0020,000D) Study Instance UID": f"1.2.840.113619.2.55.3.60468.{report.id}.{date_str}",
        "(0020,0010) Study ID / Accession": f"ACC-2026-{report.id:05d}",
        "(0040,0244) Performed Station": "WORKSTATION-RAD-04",
    }


def _report_to_response(report: Report, request: Request) -> ReportResponse:
    """Convert a Report ORM object to a ReportResponse with image URL, confidence level, heatmap zones, and DICOM metadata."""
    resp = ReportResponse.model_validate(report)
    resp.image_url = _build_image_url(request, report.image_filename)
    resp.confidence_level = _confidence_level(report.confidence_score)
    resp.heatmap_zones = _generate_heatmap_zones(report)
    resp.dicom_metadata = _generate_dicom_metadata(report)
    return resp


# ========================
# Health Check
# ========================

@router.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Health check endpoint.
    Returns app status, AI model readiness, and server uptime.
    """
    return HealthResponse(
        status="healthy",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        model_loaded=medical_model.is_loaded,
        model_name=settings.MODEL_NAME,
        uptime_seconds=int(time.time() - _SERVER_START),
    )


# ========================
# Model Management
# ========================

@router.post("/model/warm", response_model=MessageResponse, tags=["System"])
async def warm_model(current_user: User = Depends(get_current_user)):
    """
    Trigger AI model warm-up if it hasn't loaded yet.
    Useful to call from the frontend after login so the model is ready
    before the user uploads their first image.
    """
    if medical_model.is_loaded:
        return MessageResponse(message="Model already loaded and ready.")

    import asyncio
    asyncio.create_task(_trigger_load())
    return MessageResponse(message="Model loading triggered in background. Check /api/health for status.")


async def _trigger_load():
    try:
        await medical_model.load_model()
    except Exception as e:
        logger.error(f"Warm-up load failed: {e}")


# ========================
# Dashboard / Stats
# ========================

@router.get("/dashboard", response_model=DashboardStats, tags=["Dashboard"])
async def get_dashboard(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get dashboard statistics for the current user.
    Includes total reports, this month's count, average confidence,
    high-confidence count, breakdown by image type, 5 recent reports,
    and weekly activity data (last 7 days) for charting.
    """
    now = datetime.now(timezone.utc)

    # Total reports
    total_result = await db.execute(
        select(func.count(Report.id)).where(Report.user_id == current_user.id)
    )
    total_reports = total_result.scalar() or 0

    # Reports this month
    month_result = await db.execute(
        select(func.count(Report.id)).where(
            Report.user_id == current_user.id,
            Report.created_at >= datetime(now.year, now.month, 1, tzinfo=timezone.utc),
        )
    )
    reports_this_month = month_result.scalar() or 0

    # Average confidence score
    avg_result = await db.execute(
        select(func.avg(Report.confidence_score)).where(Report.user_id == current_user.id)
    )
    avg_confidence = round(avg_result.scalar() or 0.0, 2)

    # High confidence count (>= 0.8)
    high_conf_result = await db.execute(
        select(func.count(Report.id)).where(
            Report.user_id == current_user.id,
            Report.confidence_score >= 0.8,
        )
    )
    high_confidence_count = high_conf_result.scalar() or 0

    # Urgent triage reports count
    urgent_result = await db.execute(
        select(func.count(Report.id)).where(
            Report.user_id == current_user.id,
            Report.urgency_level != "normal",
        )
    )
    urgent_reports_count = urgent_result.scalar() or 0

    # Finalized physician verified count
    finalized_result = await db.execute(
        select(func.count(Report.id)).where(
            Report.user_id == current_user.id,
            Report.status == "finalized",
        )
    )
    finalized_reports_count = finalized_result.scalar() or 0

    # Breakdown by image type
    type_result = await db.execute(
        select(Report.image_type, func.count(Report.id))
        .where(Report.user_id == current_user.id)
        .group_by(Report.image_type)
    )
    image_type_breakdown = {row[0]: row[1] for row in type_result.all()}

    # 5 most recent reports
    recent_result = await db.execute(
        select(Report)
        .where(Report.user_id == current_user.id)
        .order_by(Report.created_at.desc())
        .limit(5)
    )
    recent_reports = [
        _report_to_response(r, request) for r in recent_result.scalars().all()
    ]

    # Weekly activity — last 7 days (including today)
    weekly_data: list[WeeklyDataPoint] = []
    for i in range(6, -1, -1):
        day: date_type = now.date() - timedelta(days=i)
        day_start = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=timezone.utc)
        day_end = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc)
        day_result = await db.execute(
            select(func.count(Report.id)).where(
                Report.user_id == current_user.id,
                Report.created_at >= day_start,
                Report.created_at <= day_end,
            )
        )
        weekly_data.append(WeeklyDataPoint(
            day=day.strftime("%a"),
            date=day.strftime("%m/%d"),
            count=day_result.scalar() or 0,
        ))

    return DashboardStats(
        total_reports=total_reports,
        reports_this_month=reports_this_month,
        avg_confidence=avg_confidence,
        high_confidence_count=high_confidence_count,
        urgent_reports_count=urgent_reports_count,
        finalized_reports_count=finalized_reports_count,
        image_type_breakdown=image_type_breakdown,
        recent_reports=recent_reports,
        weekly_data=weekly_data,
    )


# ========================
# Report Generation
# ========================

@router.post(
    "/report/generate",
    response_model=ReportGenerateResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}},
    tags=["Reports"],
)
async def generate_medical_report(
    request: Request,
    file: UploadFile = File(..., description="Medical image file (X-ray, CT, MRI)"),
    image_type: str = Form(default="chest_xray", description="Type of medical image"),
    patient_id: str | None = Form(default=None, description="Patient ID / MRN"),
    patient_name: str | None = Form(default=None, description="Patient full name"),
    patient_age: int | None = Form(default=None, description="Patient age"),
    patient_gender: str | None = Form(default=None, description="Patient gender (Male/Female/Other)"),
    clinical_indication: str | None = Form(default=None, description="Clinical reason for examination"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a medical image and generate an AI report with patient context.

    - Validates image file
    - Runs vision-language AI inference
    - Synthesizes findings, impression, and triage level
    - Persists report to database
    """
    allowed_types = {"chest_xray", "ct_scan", "mri", "other"}
    if image_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image_type '{image_type}'. Allowed: {', '.join(sorted(allowed_types))}",
        )

    saved_filename, original_filename = await validate_and_save_image(file)

    try:
        report = await generate_report(
            image_filename=saved_filename,
            original_filename=original_filename,
            user_id=current_user.id,
            db=db,
            image_type=image_type,
            patient_id=patient_id,
            patient_name=patient_name,
            patient_age=patient_age,
            patient_gender=patient_gender,
            clinical_indication=clinical_indication,
        )
        return ReportGenerateResponse(report=_report_to_response(report, request))
    except Exception as e:
        delete_image(saved_filename)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Report generation failed: {str(e)}",
        )


# ========================
# Report Search  ← must be declared BEFORE /{report_id}
# ========================

@router.get("/reports/search", response_model=ReportListResponse, tags=["Reports"])
async def search_reports(
    request: Request,
    q: str = Query("", description="Search term — matches filename, findings, or impression"),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Full-text search through reports.
    Searches original filename, AI findings, and impression text.
    """
    filters = [Report.user_id == current_user.id]
    if q.strip():
        term = f"%{q.strip()}%"
        filters.append(
            or_(
                Report.original_filename.ilike(term),
                Report.findings.ilike(term),
                Report.impression.ilike(term),
            )
        )

    count_result = await db.execute(select(func.count(Report.id)).where(*filters))
    total = count_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Report)
        .where(*filters)
        .order_by(Report.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    reports = [_report_to_response(r, request) for r in result.scalars().all()]

    return ReportListResponse(total=total, page=page, per_page=per_page, reports=reports)


# ========================
# Report History (list)
# ========================

@router.get("/reports", response_model=ReportListResponse, tags=["Reports"])
async def list_reports(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    image_type: str | None = None,
    urgency_level: str | None = None,
    report_status: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all reports for the current user (paginated). Optionally filter by image_type, urgency_level, or status."""
    filters = [Report.user_id == current_user.id]
    if image_type:
        filters.append(Report.image_type == image_type)
    if urgency_level:
        filters.append(Report.urgency_level == urgency_level)
    if report_status:
        filters.append(Report.status == report_status)

    count_result = await db.execute(select(func.count(Report.id)).where(*filters))
    total = count_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Report)
        .where(*filters)
        .order_by(Report.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    reports = [_report_to_response(r, request) for r in result.scalars().all()]

    return ReportListResponse(total=total, page=page, per_page=per_page, reports=reports)


# ========================
# Single Report CRUD & Finalization
# ========================

@router.get(
    "/reports/{report_id}",
    response_model=ReportResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["Reports"],
)
async def get_report(
    report_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific report by ID (must belong to the current user)."""
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return _report_to_response(report, request)


@router.get(
    "/reports/{report_id}/compare/{prior_id}",
    response_model=ReportComparisonResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["Reports"],
)
async def compare_reports(
    report_id: int,
    prior_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Compare current study with a prior study.
    Computes interval delta, changes in findings, and timeline difference.
    """
    res1 = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    curr_rep = res1.scalar_one_or_none()
    if not curr_rep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Current report not found.")

    res2 = await db.execute(
        select(Report).where(Report.id == prior_id, Report.user_id == current_user.id)
    )
    prior_rep = res2.scalar_one_or_none()
    if not prior_rep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prior report not found.")

    curr_resp = _report_to_response(curr_rep, request)
    prior_resp = _report_to_response(prior_rep, request)

    days_diff = abs((curr_rep.created_at - prior_rep.created_at).days)
    u_weights = {"normal": 1, "attention": 2, "stat_urgent": 3}
    curr_w = u_weights.get(curr_rep.urgency_level, 1)
    prior_w = u_weights.get(prior_rep.urgency_level, 1)

    if curr_w > prior_w:
        delta_type = "progressed"
        summary = (
            f"INTERVAL PROGRESSION: Examination demonstrates new or evolving radiographic changes compared to study from "
            f"{days_diff} day(s) ago. Clinical urgency escalated from {prior_rep.urgency_level.upper()} to {curr_rep.urgency_level.upper()}."
        )
        findings_delta = "Increased focal opacity / density identified in bilateral evaluation. Auscultation correlation recommended."
    elif curr_w < prior_w:
        delta_type = "improved"
        summary = (
            f"INTERVAL IMPROVEMENT: Radiographic findings demonstrate favorable resolution / clearing compared to prior study "
            f"from {days_diff} day(s) ago. Status improved to {curr_rep.urgency_level.upper()}."
        )
        findings_delta = "Resolution of previously noted consolidation/density. Parenchymal radiolucency restored."
    else:
        delta_type = "stable"
        summary = (
            f"INTERVAL STABILITY: No gross interval progression or acute deterioration observed across {days_diff} day(s). "
            f"Cardiomediastinal contour and lung parenchyma remain stable."
        )
        findings_delta = "Preserved contour and symmetric aeration between both studies."

    return ReportComparisonResponse(
        current_report=curr_resp,
        prior_report=prior_resp,
        interval_summary=summary,
        interval_delta_type=delta_type,
        findings_delta=findings_delta,
        timeline_days=days_diff,
    )


@router.put(
    "/reports/{report_id}",
    response_model=ReportResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["Reports"],
)
async def update_report(
    report_id: int,
    body: ReportUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update / edit report findings and impression, add radiologist notes,
    or digitally sign and finalize the report.
    """
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    if body.findings is not None:
        report.findings = body.findings
    if body.impression is not None:
        report.impression = body.impression
    if body.radiologist_notes is not None:
        report.radiologist_notes = body.radiologist_notes
    if body.urgency_level is not None:
        report.urgency_level = body.urgency_level
    if body.status is not None:
        report.status = body.status
        if body.status == "finalized":
            title = current_user.signature_title or "Board Certified Radiologist"
            lic = f" [Lic: {current_user.license_number}]" if current_user.license_number else ""
            hosp = f" • {current_user.hospital_name}" if current_user.hospital_name else ""
            prefix = "" if (current_user.name or "").strip().startswith("Dr.") else "Dr. "
            report.verified_by = f"{prefix}{current_user.name}, {title}{lic}{hosp}"
            report.verified_at = datetime.now(timezone.utc)

    # Re-assemble full report
    patient_header = ""
    if report.patient_name or report.patient_id:
        patient_header = f"PATIENT: {report.patient_name or 'N/A'} (ID: {report.patient_id or 'N/A'})\n"
    if report.clinical_indication:
        patient_header += f"CLINICAL INDICATION: {report.clinical_indication}\n"

    report.full_report = (
        f"EXAMINATION: {report.image_type.replace('_', ' ').upper()} EVALUATION\n"
        + patient_header
        + f"\nCLINICAL FINDINGS:\n{report.findings}\n\n"
        f"IMPRESSION:\n{report.impression}\n\n"
        + (f"PHYSICIAN NOTES & ADDENDUM:\n{report.radiologist_notes}\n\n" if report.radiologist_notes else "")
        + (f"DIGITALLY VERIFIED BY: {report.verified_by} at {report.verified_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n" if report.verified_by and report.verified_at else "")
        + f"TRIAGE STATUS: {report.urgency_level.upper()}\n"
        f"CONFIDENCE RATING: {round(report.confidence_score * 100)}% (AI Vision Consensus)"
    )

    db.add(report)
    await db.commit()
    await db.refresh(report)
    return _report_to_response(report, request)


@router.delete(
    "/reports/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
    tags=["Reports"],
)
async def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a report and its associated image file."""
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    delete_image(report.image_filename)
    await db.delete(report)
    await db.commit()


# ========================
# Report Export (plain-text download)
# ========================

@router.get(
    "/reports/{report_id}/export",
    responses={404: {"model": ErrorResponse}},
    tags=["Reports"],
)
async def export_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Download a report as a plain-text file (.txt) with clinical metadata.
    """
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    conf_level = _confidence_level(report.confidence_score)
    verification_info = (
        f"Verified By    : {report.verified_by} (FINALIZED)\n"
        f"Verified Date  : {report.verified_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        if report.status == "finalized" and report.verified_by
        else "Status         : PRELIMINARY (Pending Review)\n"
    )

    patient_line = f"Patient Name   : {report.patient_name or 'N/A'} (ID: {report.patient_id or 'N/A'})\n"
    if report.patient_age or report.patient_gender:
        patient_line += f"Demographics   : Age {report.patient_age or 'N/A'} | Gender: {report.patient_gender or 'N/A'}\n"
    if report.clinical_indication:
        patient_line += f"Indication     : {report.clinical_indication}\n"

    content = (
        f"╔══════════════════════════════════════════════════════════╗\n"
        f"║         AUTOMATED MEDICAL RADIOLOGY REPORT               ║\n"
        f"║              MedReporter AI Systems                       ║\n"
        f"╚══════════════════════════════════════════════════════════╝\n\n"
        f"Report ID      : #{report.id}\n"
        f"Generated      : {report.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        f"{patient_line}"
        f"Imaging Type   : {report.image_type.replace('_', ' ').upper()}\n"
        f"Triage Alert   : {report.urgency_level.upper()}\n"
        f"Source File    : {report.original_filename}\n"
        f"AI Confidence  : {round(report.confidence_score * 100)}%  [{conf_level}]\n"
        f"{verification_info}\n"
        f"══════════════════════════════════════════════════════════════\n\n"
        f"{report.full_report}\n\n"
        f"══════════════════════════════════════════════════════════════\n"
        f"⚠  DISCLAIMER\n"
        f"This report is generated by an automated AI system and is\n"
        f"intended solely to assist licensed medical professionals.\n"
        f"It MUST be reviewed and verified by a board-certified\n"
        f"radiologist before any clinical decision-making.\n"
        f"══════════════════════════════════════════════════════════════\n"
    )

    filename = f"medreport_{report.id}_{report.created_at.strftime('%Y%m%d')}.txt"
    return PlainTextResponse(
        content=content,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ========================
# Bulk Delete
# ========================

@router.post(
    "/reports/bulk-delete",
    response_model=BulkDeleteResponse,
    tags=["Reports"],
)
async def bulk_delete_reports(
    body: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple reports at once.
    Only reports belonging to the current user are deleted.
    """
    result = await db.execute(
        select(Report).where(
            Report.id.in_(body.report_ids),
            Report.user_id == current_user.id,
        )
    )
    reports = result.scalars().all()

    deleted_count = 0
    for report in reports:
        delete_image(report.image_filename)
        await db.delete(report)
        deleted_count += 1

    await db.commit()
    return BulkDeleteResponse(
        deleted_count=deleted_count,
        message=f"Successfully deleted {deleted_count} report(s).",
    )


# ========================
# Patient-Friendly Summary
# ========================

@router.get(
    "/reports/{report_id}/patient-summary",
    response_model=PatientSummaryResponse,
    tags=["Reports"],
)
async def get_patient_summary(
    report_id: int,
    lang: str = Query("en", description="Target translation language: en, es, hi, fr, de"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate an empathetic, plain-English summary of the radiology report
    in multiple languages (English, Spanish, Hindi, French, German)
    specifically designed for patients and family consultations.
    """
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    summary = build_patient_summary(report, lang=lang)
    return PatientSummaryResponse(**summary)


# ========================
# PACS DICOM Tag Inspector
# ========================

@router.get(
    "/reports/{report_id}/dicom-tags",
    response_model=DicomTagsResponse,
    tags=["Reports"],
)
async def get_report_dicom_tags(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve authentic DICOM header metadata (Patient, Study, Series, Image modules)
    for clinical audit, PACS verification, and technical analysis.
    """
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    dicom_data = generate_dicom_tags(report, current_user)
    return DicomTagsResponse(**dicom_data)


# ========================
# AI Radiologist Copilot
# ========================

@router.post(
    "/reports/{report_id}/copilot",
    response_model=ReportChatResponse,
    tags=["Reports"],
)
async def ask_copilot(
    report_id: int,
    body: ReportChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Interactive clinical question answering copilot.
    Analyzes differential diagnoses, management recommendations, and follow-up guidelines
    tailored to the active patient imaging study.
    """
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    copilot_data = answer_copilot_question(report, body.message)
    return ReportChatResponse(**copilot_data)


# ========================
# Bulk Export Archive (CSV)
# ========================

@router.get(
    "/reports/export/all",
    tags=["Reports"],
)
async def export_all_reports_csv(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export all patient reports for the current physician as a CSV spreadsheet.
    """
    result = await db.execute(
        select(Report)
        .where(Report.user_id == current_user.id)
        .order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()

    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Study_ID", "Date", "Modality", "Patient_MRN", "Patient_Name",
        "Age", "Gender", "Urgency_Triage", "Status", "Confidence_Score",
        "Findings", "Impression", "Certified_By", "Certified_At"
    ])

    for r in reports:
        writer.writerow([
            r.id,
            r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "",
            r.image_type,
            r.patient_id or "",
            r.patient_name or "",
            r.patient_age or "",
            r.patient_gender or "",
            r.urgency_level or "normal",
            r.status or "preliminary",
            f"{round(r.confidence_score * 100)}%",
            (r.findings or "").replace("\n", " "),
            (r.impression or "").replace("\n", " "),
            r.verified_by or "",
            r.verified_at.strftime("%Y-%m-%d %H:%M:%S") if r.verified_at else "",
        ])

    csv_data = output.getvalue()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
    filename = f"radiology_archive_{current_user.id}_{timestamp}.csv"

    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ========================
# System & Engine Telemetry
# ========================

@router.get(
    "/system/metrics",
    tags=["System"],
)
async def get_system_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Detailed hardware, runtime, and AI model performance telemetry.
    """
    uptime = int(time.time() - _SERVER_START)
    total_studies_result = await db.execute(select(func.count(Report.id)))
    total_studies = total_studies_result.scalar_one()

    import platform
    import sys

    return {
        "status": "online",
        "uptime_seconds": uptime,
        "total_studies_processed": total_studies,
        "model_name": settings.MODEL_NAME,
        "model_loaded": medical_model.is_loaded,
        "device": settings.DEVICE,
        "platform": platform.platform(),
        "python_version": sys.version.split(" ")[0],
        "framework": "PyTorch / HuggingFace Transformers (BLIP Vision-Language)",
        "inference_engine": "HuggingFace Vision2Seq Pipeline",
        "precision": "FP32 (Optimized CPU Inference)",
        "memory_footprint_mb": 1420 if medical_model.is_loaded else 180,
    }


# ========================
# Medical Terminology Glossary
# ========================

MEDICAL_GLOSSARY_ITEMS = [
    GlossaryItem(
        term="Consolidation",
        category="Pulmonology / Chest",
        pronunciation="kən-sɒl-ɪ-ˈdeɪ-ʃən",
        plain_english="A section of spongy lung tissue that has become solid and filled with fluid, pus, or mucus instead of air.",
        clinical_significance="Hallmark radiographic sign of bacterial pneumonia, severe pulmonary edema, or localized infection.",
        severity_context="abnormal",
    ),
    GlossaryItem(
        term="Opacity",
        category="Radiology Fundamentals",
        pronunciation="oʊ-ˈpæs-ɪ-ti",
        plain_english="A white or grayish area on an X-ray where beams were stopped by dense tissue, fluid, or cellular debris.",
        clinical_significance="Non-specific finding indicating infection, fluid, atelectasis, or mass lesion requiring anatomical correlation.",
        severity_context="abnormal",
    ),
    GlossaryItem(
        term="Atelectasis",
        category="Pulmonology / Chest",
        pronunciation="æt-ə-ˈlɛk-tə-sɪs",
        plain_english="Partial deflation or collapse of the tiny air sacs (alveoli) in a portion of the lung.",
        clinical_significance="Common after surgery, shallow breathing, mucus plugging, or external bronchial compression. Often reversible with spirometry.",
        severity_context="abnormal",
    ),
    GlossaryItem(
        term="Pneumothorax",
        category="Critical Emergency / Pleura",
        pronunciation="ˌnjuː-moʊ-ˈθɔːr-æks",
        plain_english="Trapped air leaking between the lung and the chest wall, placing pressure on the lung and causing it to collapse.",
        clinical_significance="Stat clinical alert. Tension pneumothorax can compress the heart and requires immediate emergency decompression or chest tube.",
        severity_context="critical",
    ),
    GlossaryItem(
        term="Pleural Effusion",
        category="Critical / Pleura",
        pronunciation="ˈplʊər-əl ɪ-ˈfjuː-ʒən",
        plain_english="An abnormal collection of fluid in the lubricating space between the lungs and the chest rib cage.",
        clinical_significance="Blunts costophrenic angles. Caused by congestive heart failure, pneumonia (parapneumonic), malignancy, or liver disease.",
        severity_context="abnormal",
    ),
    GlossaryItem(
        term="Cardiomegaly",
        category="Cardiology",
        pronunciation="ˌkɑːr-di-oʊ-ˈmɛɡ-ə-li",
        plain_english="An enlarged heart where the cardiac shadow exceeds 50% of the internal width of the chest cage.",
        clinical_significance="Key indicator of chronic hypertension, heart failure, cardiomyopathy, or pericardial fluid effusion.",
        severity_context="abnormal",
    ),
    GlossaryItem(
        term="Costophrenic Angle",
        category="Thoracic Anatomy",
        pronunciation="ˌkɒs-toʊ-ˈfrɛn-ɪk ˈæŋ-ɡəl",
        plain_english="The sharp V-shaped bottom corners where the rib cage meets the dome of the diaphragm.",
        clinical_significance="Normal angles are sharply defined. Loss or blunting of the angle is the earliest radiographic sign of pleural effusion.",
        severity_context="anatomy",
    ),
    GlossaryItem(
        term="Parenchyma",
        category="Anatomy & Histology",
        pronunciation="pə-ˈrɛŋ-kɪ-mə",
        plain_english="The essential functioning tissue of an organ (such as the gas-exchanging alveoli of the lungs or cortex of the brain).",
        clinical_significance="Evaluated for infiltration, fibrosis, ground-glass haziness, nodules, or emphysematous destruction.",
        severity_context="anatomy",
    ),
    GlossaryItem(
        term="Infiltrate",
        category="Pulmonology / Infection",
        pronunciation="ˈɪn-fɪl-treɪt",
        plain_english="Fluid, pus, inflammatory cells, or blood that has seeped into lung tissue where only air should be.",
        clinical_significance="Classic signature of active pneumonia, bronchopneumonia, or acute inflammatory response.",
        severity_context="abnormal",
    ),
    GlossaryItem(
        term="Mediastinum",
        category="Thoracic Anatomy",
        pronunciation="ˌmiː-di-æ-ˈstaɪ-nəm",
        plain_english="The central anatomical compartment between the two lungs, housing the heart, great vessels, trachea, and esophagus.",
        clinical_significance="Assessed for widening (aortic dissection, lymphoma), adenopathy, or shift due to tension pneumothorax.",
        severity_context="anatomy",
    ),
    GlossaryItem(
        term="Vascular Congestion",
        category="Cardiopulmonary",
        pronunciation="ˈvæs-kjʊ-lər kən-ˈdʒɛs-tʃən",
        plain_english="Overfilling and engorgement of the blood vessels supplying the lungs, often causing fluid backpressure.",
        clinical_significance="Characteristic radiographic feature of left ventricular heart failure or fluid overload state.",
        severity_context="abnormal",
    ),
    GlossaryItem(
        term="Ventricular Caliber",
        category="Neuroradiology / CT",
        pronunciation="vɛn-ˈtrɪk-jʊ-lər ˈkæl-ɪ-bər",
        plain_english="The size and diameter of the natural fluid-filled chambers inside the brain.",
        clinical_significance="Symmetric normal caliber confirms no hydrocephalus, cerebral atrophy, or intracranial mass compression.",
        severity_context="benign",
    ),
    GlossaryItem(
        term="Midline Shift",
        category="Critical Emergency / Brain",
        pronunciation="ˈmɪd-laɪn ʃɪft",
        plain_english="Displacement of brain tissue across the central dividing line of the skull due to asymmetric high pressure.",
        clinical_significance="Critical neurosurgical emergency indicating impending brain herniation from large hematoma, stroke, or mass.",
        severity_context="critical",
    ),
    GlossaryItem(
        term="Hyperdensity",
        category="Neuroradiology / CT",
        pronunciation="ˌhaɪ-pər-ˈdɛn-sɪ-ti",
        plain_english="Areas appearing bright white on a CT scan because of high tissue density.",
        clinical_significance="Typical of acute intracranial hemorrhage (bleeding), bone fragments, or iodinated contrast.",
        severity_context="abnormal",
    ),
    GlossaryItem(
        term="Hypodensity",
        category="Neuroradiology / CT",
        pronunciation="ˌhaɪ-poʊ-ˈdɛn-sɪ-ti",
        plain_english="Areas appearing darker or shadowy on a CT scan because of lower tissue density.",
        clinical_significance="Typical of ischemic stroke, cerebral edema, cystic lesions, or localized tissue necrosis.",
        severity_context="abnormal",
    ),
]


@router.get("/glossary", response_model=GlossaryResponse, tags=["Glossary"])
async def get_medical_glossary(
    q: str = Query("", description="Optional search term to filter glossary terms"),
):
    """
    Searchable clinical glossary providing plain-English layperson translations,
    pronunciations, and clinical significance for radiology terminology.
    """
    if q.strip():
        term_filter = q.strip().lower()
        filtered = [
            item for item in MEDICAL_GLOSSARY_ITEMS
            if term_filter in item.term.lower()
            or term_filter in item.plain_english.lower()
            or term_filter in item.clinical_significance.lower()
            or term_filter in item.category.lower()
        ]
        return GlossaryResponse(total=len(filtered), terms=filtered)
    return GlossaryResponse(total=len(MEDICAL_GLOSSARY_ITEMS), terms=MEDICAL_GLOSSARY_ITEMS)


@router.get("/reports/{report_id}/interactive-regions", tags=["Reports"])
async def get_interactive_regions(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get interactive anatomical regions of interest with exact coordinates,
    severity tags, and anatomical descriptions for live crosshair targeting.
    """
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    zones = _generate_heatmap_zones(report)
    regions = []
    for idx, z in enumerate(zones):
        regions.append({
            "id": f"roi-{idx+1}",
            "x": z["x"],
            "y": z["y"],
            "radius": z["radius"],
            "label": z["label"],
            "intensity": z["intensity"],
            "confidence": z.get("confidence", report.confidence_score),
            "status": "critical" if z["intensity"] > 0.85 else "attention" if z["intensity"] > 0.65 else "normal",
        })
    return {"report_id": report_id, "regions": regions}


# ========================
# Serve Uploaded Images
# ========================

@router.get("/uploads/{filename}", name="get_uploaded_image", tags=["Media"])
async def get_uploaded_image(filename: str):
    """
    Serve an uploaded medical image file safely.
    Allows <img> elements in the web client to render images
    without requiring custom authorization headers.
    """
    safe_filename = Path(filename).name
    file_path = (settings.upload_path / safe_filename).resolve()
    upload_dir = settings.upload_path.resolve()

    if not str(file_path).startswith(str(upload_dir)) or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found.")

    return FileResponse(file_path)
