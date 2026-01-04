import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from .base import Base
from dotenv import load_dotenv
from .models import Base, SessionInfo, AppConfig

def init_db():
    """Initialize control DB tables if they don’t exist."""
    from sqlalchemy import create_engine
    engine = _control_engine
    Base.metadata.create_all(bind=engine)

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Control DB (tracks all sessions) ---
CONTROL_DB_URL = os.getenv("DATABASE_URL")
if not CONTROL_DB_URL:
    raise ValueError("❌ DATABASE_URL not found in environment variables.")

# Engines and session factories
_control_engine = create_engine(CONTROL_DB_URL, pool_pre_ping=True)
ControlSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_control_engine)

# Global pointers to active session DB
_active_engine = _control_engine
ActiveSessionLocal = ControlSessionLocal
_current_session_name = None  # Track which session we're currently on

# --- Database Access ---
def get_db():
    """Return a session bound to the current active DB."""
    # Ensure we're using the correct session database
    # Check control DB for active session and switch if needed
    global _current_session_name, _active_engine, ActiveSessionLocal
    try:
        control_db = ControlSessionLocal()
        try:
            active_session = control_db.query(SessionInfo).filter(SessionInfo.status == "active").first()
            if active_session:
                # Always switch to ensure we're on the correct session
                # This handles cases where the engine was disposed or reset
                if _current_session_name != active_session.name:
                    try:
                        switch_session_db(active_session.name)
                        _current_session_name = active_session.name
                        logger.debug(f"Switched to active session: {active_session.name}")
                    except Exception as e:
                        logger.warning(f"Could not switch to active session '{active_session.name}': {e}")
                else:
                    # Even if we think we're on the right session, verify the engine is valid
                    # by attempting a simple query to ensure the connection works
                    try:
                        # Test the engine with a simple query
                        test_db = ActiveSessionLocal()
                        try:
                            # Just verify we can connect - don't query anything specific
                            test_db.execute(text("SELECT 1"))
                        finally:
                            test_db.close()
                    except Exception as e:
                        # Engine might be invalid, force a switch
                        logger.warning(f"Engine validation failed, forcing switch: {e}")
                        try:
                            switch_session_db(active_session.name)
                            _current_session_name = active_session.name
                        except Exception as e2:
                            logger.error(f"Failed to force switch: {e2}")
            else:
                # No active session - reset to control DB
                if _current_session_name is not None:
                    _active_engine = _control_engine
                    ActiveSessionLocal = ControlSessionLocal
                    _current_session_name = None
        finally:
            control_db.close()
    except Exception as e:
        logger.warning(f"Error checking active session: {e}")
    
    db = ActiveSessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Session Management ---
def switch_session_db(session_name: str):
    """
    Switch the active engine to a specific session database.
    Raises ValueError if DB does not exist.
    """
    global _active_engine, ActiveSessionLocal, _current_session_name

    session_db_name = f"{session_name.lower().replace(' ', '_')}_db"
    base_url = CONTROL_DB_URL.rsplit("/", 1)[0]
    session_db_url = f"{base_url}/{session_db_name}"

    # Check if the session DB exists
    with _control_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname=:name;"),
            {"name": session_db_name}
        ).fetchone()
        if not exists:
            raise ValueError(f"Session database '{session_db_name}' does not exist")

    # Only create new engine if we're switching to a different session
    # Reuse engine if already on this session
    if _current_session_name != session_name:
        # Dispose of old engine if it's not the control engine
        if _active_engine is not _control_engine:
            try:
                _active_engine.dispose(close=True)
            except Exception as e:
                logger.warning(f"Error disposing old engine: {e}")
        
        # Switch active engine & session factory
        # Create a fresh engine with connection pool reset
        # Use echo=False to avoid logging all SQL, but enable pool_pre_ping
        _active_engine = create_engine(
            session_db_url, 
            pool_pre_ping=True,
            pool_reset_on_return='commit',  # Reset connections on return to pool
            echo=False
        )
        ActiveSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_active_engine)
        _current_session_name = session_name
        logger.info(f"Switched active DB to session '{session_name}' (engine created)")
    else:
        logger.debug(f"Already on session '{session_name}', skipping switch")

def create_session_db(session_name: str):
    """
    Create a new database for a session and initialize tables.
    Raises Exception if DB already exists.
    """
    session_db_name = f"{session_name.lower().replace(' ', '_')}_db"

    # --- Connect to control DB with AUTOCOMMIT for CREATE DATABASE ---
    with _control_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        # Check if the session DB already exists
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname=:name;"),
            {"name": session_db_name}
        ).fetchone()
        if exists:
            raise ValueError(f"Session database '{session_db_name}' already exists")

        # Create the new session database
        conn.execute(text(f"CREATE DATABASE {session_db_name};"))

    # --- Initialize tables in the new session DB ---
    session_db_url = f"{CONTROL_DB_URL.rsplit('/', 1)[0]}/{session_db_name}"
    engine = create_engine(session_db_url, pool_pre_ping=True)

    from .models import Infringement, InfringementHistory  # per-session models
    Base.metadata.create_all(bind=engine)

    logger.info(f"Session database '{session_db_name}' created and tables initialized.")



# --- Initialize Control DB Tables ---
def init_control_db():
    """
    Initializes tables in the control database (sessions and app_config tables).
    """
    from .models import SessionInfo, AppConfig  # Control DB models
    Base.metadata.create_all(bind=_control_engine)
    logger.info("Control database tables initialized.")
