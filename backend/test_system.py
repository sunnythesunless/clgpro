"""
Automated End-to-End Verification Test for Medical Image Reporting System
Tests auth, health check, report generation, dashboard metrics, search, and image serving.
"""

import asyncio
import io
from PIL import Image, ImageDraw
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import init_db


def create_synthetic_radiograph() -> bytes:
    """Create a synthetic medical chest radiograph for testing."""
    img = Image.new("L", (512, 512), color=25)
    draw = ImageDraw.Draw(img)

    # Simulate bilateral lung fields (darker)
    draw.ellipse((80, 100, 220, 420), fill=12, outline=45)
    draw.ellipse((292, 100, 432, 420), fill=12, outline=45)

    # Simulate cardiac silhouette (denser / brighter)
    draw.ellipse((190, 240, 310, 390), fill=110, outline=140)

    # Simulate spine and ribs
    draw.line((256, 40, 256, 480), fill=80, width=14)
    for y in range(120, 420, 40):
        draw.arc((70, y, 440, y + 60), start=190, end=350, fill=55, width=4)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def run_tests():
    print("=" * 60)
    print("  Starting End-to-End Verification Test Suite")
    print("=" * 60)

    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Health check
        print("\n[1] Testing /api/health...")
        res = await client.get("/api/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        health_data = res.json()
        print(f"    Status: {health_data['status']}, Model Name: {health_data['model_name']}")

        # 2. Register user
        print("\n[2] Testing User Registration...")
        test_email = f"radiologist_test@hospital.org"
        reg_payload = {
            "name": "Dr. Sarah Mitchell",
            "email": test_email,
            "password": "SecurePassword123!",
        }
        res = await client.post("/api/auth/register", json=reg_payload)
        if res.status_code == 409:
            # Already exists, proceed to login
            print("    User already registered from previous run, logging in...")
            login_res = await client.post("/api/auth/login", json={"email": test_email, "password": "SecurePassword123!"})
            assert login_res.status_code == 200
            token = login_res.json()["access_token"]
        else:
            assert res.status_code == 201, f"Registration failed: {res.text}"
            token = res.json()["access_token"]
        print("    Authentication Token Acquired.")

        headers = {"Authorization": f"Bearer {token}"}

        # 3. Get profile
        print("\n[3] Testing Profile Retrieval...")
        me_res = await client.get("/api/auth/me", headers=headers)
        assert me_res.status_code == 200
        user_info = me_res.json()
        print(f"    Authenticated as: {user_info['name']} ({user_info['email']})")

        # 4. Generate AI Report
        print("\n[4] Testing Medical Image Upload & AI Report Generation...")
        xray_bytes = create_synthetic_radiograph()
        files = {"file": ("chest_xray_test.png", xray_bytes, "image/png")}
        data = {"image_type": "chest_xray"}

        gen_res = await client.post("/api/report/generate", files=files, data=data, headers=headers)
        assert gen_res.status_code == 201, f"Report generation failed: {gen_res.text}"
        report_data = gen_res.json()["report"]
        report_id = report_data["id"]
        img_filename = report_data["image_filename"]
        print(f"    Report #{report_id} Generated!")
        print(f"    Modality: {report_data['image_type']}")
        print(f"    Confidence: {round(report_data['confidence_score'] * 100)}% ({report_data['confidence_level']})")
        print(f"    Findings Preview: {report_data['findings'][:120]}...")

        # 5. Fetch Single Report
        print(f"\n[5] Testing GET /api/reports/{report_id}...")
        get_res = await client.get(f"/api/reports/{report_id}", headers=headers)
        assert get_res.status_code == 200
        single_data = get_res.json()
        assert "heatmap_zones" in single_data and len(single_data["heatmap_zones"]) > 0
        assert "dicom_metadata" in single_data and len(single_data["dicom_metadata"]) > 0
        print(f"    Report #{report_id} verified. Heatmap zones: {len(single_data['heatmap_zones'])}, DICOM tags: {len(single_data['dicom_metadata'])}.")

        # 6. Test Image Serving Endpoint
        print(f"\n[6] Testing Image Serving /api/uploads/{img_filename}...")
        img_res = await client.get(f"/api/uploads/{img_filename}")
        assert img_res.status_code == 200
        assert len(img_res.content) == len(xray_bytes)
        print(f"    Image successfully served ({len(img_res.content)} bytes).")

        # 7. Test Dashboard Stats
        print("\n[7] Testing Dashboard Metrics /api/dashboard...")
        dash_res = await client.get("/api/dashboard", headers=headers)
        assert dash_res.status_code == 200
        stats = dash_res.json()
        print(f"    Total Reports: {stats['total_reports']}")
        print(f"    Average Confidence: {stats['avg_confidence']}")
        print(f"    Weekly Data Points: {len(stats['weekly_data'])} days")

        # 8. Test Search
        print("\n[8] Testing Report Search /api/reports/search?q=chest...")
        search_res = await client.get("/api/reports/search?q=chest", headers=headers)
        assert search_res.status_code == 200
        search_data = search_res.json()
        print(f"    Found {search_data['total']} matching report(s).")

        # 9. Test Export (.txt)
        print(f"\n[9] Testing Report Export /api/reports/{report_id}/export...")
        export_res = await client.get(f"/api/reports/{report_id}/export", headers=headers)
        assert export_res.status_code == 200
        assert "AUTOMATED MEDICAL RADIOLOGY REPORT" in export_res.text
        print("    Export plain-text file verified.")

        # 10. Test Prior Study Comparison
        print(f"\n[10] Testing Prior Study Comparison /api/reports/{report_id}/compare/{report_id}...")
        compare_res = await client.get(f"/api/reports/{report_id}/compare/{report_id}", headers=headers)
        assert compare_res.status_code == 200
        compare_data = compare_res.json()
        assert "interval_summary" in compare_data
        assert "interval_delta_type" in compare_data
        print(f"    Comparison Verified! Delta Type: {compare_data['interval_delta_type']}, Summary: {compare_data['interval_summary'][:80]}...")

        # 11. Test Patient-Friendly Summary
        print(f"\n[11] Testing Patient Summary /api/reports/{report_id}/patient-summary...")
        pat_res = await client.get(f"/api/reports/{report_id}/patient-summary", headers=headers)
        assert pat_res.status_code == 200
        pat_data = pat_res.json()
        assert "layperson_overview" in pat_data
        assert len(pat_data["key_takeaways"]) > 0
        assert len(pat_data["questions_for_doctor"]) > 0
        print(f"    Patient Summary Verified! Layperson: {pat_data['layperson_overview'][:80]}...")

        # 12. Test AI Radiologist Copilot
        print(f"\n[12] Testing AI Copilot /api/reports/{report_id}/copilot...")
        copilot_payload = {"message": "What is the differential diagnosis for this chest X-ray?"}
        copilot_res = await client.post(f"/api/reports/{report_id}/copilot", json=copilot_payload, headers=headers)
        assert copilot_res.status_code == 200
        copilot_data = copilot_res.json()
        assert "reply" in copilot_data
        assert len(copilot_data["clinical_references"]) > 0
        print(f"    AI Copilot Reply Verified! ({len(copilot_data['reply'])} chars, {len(copilot_data['clinical_references'])} refs)")

        # 13. Test System Metrics Telemetry
        print(f"\n[13] Testing System Metrics /api/system/metrics...")
        metrics_res = await client.get("/api/system/metrics", headers=headers)
        assert metrics_res.status_code == 200
        metrics_data = metrics_res.json()
        assert "uptime_seconds" in metrics_data
        assert "model_name" in metrics_data
        print(f"    System Metrics Verified! Platform: {metrics_data['platform']}, Model: {metrics_data['model_name']}")

        # 14. Test Batch CSV Export
        print(f"\n[14] Testing Batch CSV Export /api/reports/export/all...")
        csv_res = await client.get("/api/reports/export/all", headers=headers)
        assert csv_res.status_code == 200
        assert "Study_ID" in csv_res.text
        assert "Patient_MRN" in csv_res.text
        print(f"    Batch CSV Export Verified ({len(csv_res.text)} bytes).")

    print("\n" + "=" * 60)
    print("  ALL 14 END-TO-END TEST SUITES PASSED WITH 100% SUCCESS!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_tests())
