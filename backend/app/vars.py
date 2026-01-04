import os
from datetime import datetime, timezone
from .database import ControlSessionLocal
from .models import AppConfig

SESSION_EXPORT_DIR = os.environ.get("SESSION_EXPORT_DIR", "session_exports")

def get_warning_expiry_minutes() -> int:
    """Get warning expiry minutes from database, fallback to env var or default."""
    try:
        db = ControlSessionLocal()
        try:
            config = db.query(AppConfig).filter(AppConfig.key == "warning_expiry_minutes").first()
            if config:
                return int(config.value)
        finally:
            db.close()
    except Exception:
        pass
    
    # Fallback to environment variable or default
    return int(os.environ.get("WARNING_EXPIRY_MINUTES", "180"))

def set_warning_expiry_minutes(minutes: int) -> None:
    """Set warning expiry minutes in database."""
    db = ControlSessionLocal()
    try:
        config = db.query(AppConfig).filter(AppConfig.key == "warning_expiry_minutes").first()
        if config:
            config.value = str(minutes)
            config.updated_at = datetime.now(timezone.utc)
        else:
            config = AppConfig(key="warning_expiry_minutes", value=str(minutes))
            db.add(config)
        db.commit()
    finally:
        db.close()
