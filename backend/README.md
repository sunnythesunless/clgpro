# Automated Medical Image Reporting Using AI

> AI-powered system that generates structured radiology reports from medical images (chest X-rays).

## Tech Stack

- **Backend**: FastAPI + Uvicorn
- **AI Model**: BLIP (Salesforce) — pre-trained, no GPU needed
- **Database**: SQLite via SQLAlchemy (async)
- **Auth**: JWT tokens with bcrypt password hashing

## Quick Start

### 1. Create Virtual Environment

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the Server

```bash
uvicorn app.main:app --reload
```

The server will start at `http://localhost:8000`.  
The AI model will auto-download (~1.5GB) on first run.

### 4. Open API Docs

Visit `http://localhost:8000/docs` for interactive Swagger UI.

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register (name, email, password) |
| POST | `/api/auth/login` | Login (email, password) → JWT token |
| GET | `/api/auth/me` | Get current user profile |
| PUT | `/api/auth/me` | Update user profile (name) |
| PUT | `/api/auth/me/password` | Change password |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check + model status |
| GET | `/api/dashboard` | User statistics & recent reports |
| POST | `/api/report/generate` | Upload X-ray → AI report |
| GET | `/api/reports` | List all reports (paginated, filterable) |
| GET | `/api/reports/{id}` | Get specific report |
| DELETE | `/api/reports/{id}` | Delete a report |
| GET | `/api/uploads/{filename}` | Serve uploaded image |

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI entry point + middleware
│   ├── config.py             # Settings from .env
│   ├── database.py           # SQLAlchemy async setup
│   ├── api/
│   │   ├── auth.py           # Register/Login/Profile routes
│   │   └── routes.py         # Report & dashboard routes
│   ├── models/
│   │   ├── db_models.py      # User & Report tables
│   │   └── schemas.py        # Pydantic request/response
│   └── services/
│       ├── auth_service.py   # JWT + password hashing
│       ├── image_processor.py# Image validation & preprocessing
│       ├── model_loader.py   # BLIP model loader + confidence scoring
│       └── report_generator.py # AI report pipeline
├── uploads/                  # Saved medical images
├── requirements.txt
├── .env
├── .env.example
└── README.md
```

## Features

- **AI-Powered Reports**: Generates structured Findings + Impression from X-ray images
- **Model Confidence Scoring**: Real confidence derived from model output probabilities
- **JWT Authentication**: Secure register/login with token-based auth
- **User Dashboard**: Stats including report count, monthly activity, avg confidence
- **Paginated History**: Browse past reports with optional image_type filtering
- **Image Validation**: File type, size, and integrity checks before processing
- **Request Logging**: Every API call logged with response time
- **Global Error Handling**: Clean JSON error responses for all failures
- **CORS Configurable**: Set allowed origins via `.env`
