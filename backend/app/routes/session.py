from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone
from dateutil import parser as date_parser
import os, json, tempfile, shutil, logging

from ..database import (
    get_db,
    create_session_db,
    switch_session_db,
    ControlSessionLocal,
    _control_engine
)
from .. import database as database_module
from ..models import SessionInfo, Infringement, InfringementHistory
from ..ws_manager import manager
from ..vars import SESSION_EXPORT_DIR
from ..utils import export_session_data, export_session_csv, export_session_excel, import_session_excel, import_session_csv, validate_session_name

router = APIRouter()
logger = logging.getLogger(__name__)

os.makedirs(SESSION_EXPORT_DIR, exist_ok=True)


# -------------------------------------------------------------------
# Create a new session
# -------------------------------------------------------------------
@router.post("/start")
def start_session(name: str, background_tasks: BackgroundTasks = None):
    """
    Start a new session:
    - Create a per-session database
    - Close any previous active session
    - Add record to control DB and switch active DB
    
    Session Name Conventions:
    - 1-59 characters long
    - Can contain letters, numbers, spaces, underscores, and hyphens
    - Cannot start or end with spaces
    - Cannot contain consecutive spaces
    - Must start with a letter (after conversion to database name)
    """
    db = ControlSessionLocal()
    try:
        # --- Step 0: Validate session name ---
        try:
            validate_session_name(name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # --- Step 1: Create per-session DB ---
        try:
            create_session_db(name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create session DB: {e}")

        # --- Step 2: Close all existing sessions ---
        db.query(SessionInfo).update({SessionInfo.status: "closed"})
        db.commit()

        # --- Step 3: Add new session record ---
        session_info = SessionInfo(name=name, started_at=datetime.utcnow(), status="active")
        db.add(session_info)
        db.commit()

        # --- Step 4: Switch to new session DB ---
        try:
            switch_session_db(name)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to switch to session DB: {e}")

        # --- Step 5: Broadcast update ---
        payload_msg = {"type": "session_started", "session": {"name": name}}
        if background_tasks:
            background_tasks.add_task(manager.broadcast, json.dumps(payload_msg))

        return {"status": "Session started", "session": {"name": name}}
    finally:
        db.close()


# -------------------------------------------------------------------
# Load existing session
# -------------------------------------------------------------------
@router.post("/load")
def load_session(name: str, background_tasks: BackgroundTasks = None):
    """
    Load an existing session:
    - Switch to the per-session DB
    - Mark it as active in control DB
    
    Session Name Conventions:
    - 1-59 characters long
    - Can contain letters, numbers, spaces, underscores, and hyphens
    - Cannot start or end with spaces
    - Cannot contain consecutive spaces
    - Must start with a letter (after conversion to database name)
    """
    db = ControlSessionLocal()
    try:
        # --- Step 0: Validate session name ---
        try:
            validate_session_name(name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # --- Step 1: Switch DB ---
        try:
            switch_session_db(name)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to switch session DB: {e}")

        # --- Step 2: Close existing sessions ---
        db.query(SessionInfo).update({SessionInfo.status: "closed"})
        db.commit()

        # --- Step 3: Mark loaded session as active ---
        session_info = db.query(SessionInfo).filter(SessionInfo.name == name).first()
        if not session_info:
            session_info = SessionInfo(name=name, started_at=datetime.utcnow(), status="active")
            db.add(session_info)
        else:
            session_info.status = "active"
        db.commit()

        # --- Step 4: Broadcast update ---
        payload_msg = {"type": "session_loaded", "session": {"name": name}}
        if background_tasks:
            background_tasks.add_task(manager.broadcast, json.dumps(payload_msg))

        return {"status": f"Session '{name}' loaded"}
    finally:
        db.close()


# -------------------------------------------------------------------
# Close active session
# -------------------------------------------------------------------
@router.post("/close")
def close_session(name: str, background_tasks: BackgroundTasks = None):
    """
    Close an active session:
    - Marks session as closed in the control DB.
    
    Session Name Conventions:
    - 1-59 characters long
    - Can contain letters, numbers, spaces, underscores, and hyphens
    - Cannot start or end with spaces
    - Cannot contain consecutive spaces
    - Must start with a letter (after conversion to database name)
    """
    db = ControlSessionLocal()
    try:
        # --- Step 0: Validate session name ---
        try:
            validate_session_name(name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        db.query(SessionInfo).filter(SessionInfo.name == name).update({SessionInfo.status: "closed"})
        db.commit()

        payload_msg = {"type": "session_closed", "session": {"name": name}}
        if background_tasks:
            background_tasks.add_task(manager.broadcast, json.dumps(payload_msg))

        return {"status": f"Session '{name}' closed"}
    finally:
        db.close()


# -------------------------------------------------------------------
# List all sessions
# -------------------------------------------------------------------
@router.get("/")
def list_sessions():
    """
    Fetch all sessions from the control DB.
    """
    db = ControlSessionLocal()
    try:
        sessions = db.query(SessionInfo).order_by(SessionInfo.started_at.desc()).all()
        return {
            "sessions": [
                {
                    "name": s.name,
                    "status": s.status,
                    "started_at": s.started_at.isoformat() if s.started_at else None
                } for s in sessions
            ]
        }
    finally:
        db.close()


# -------------------------------------------------------------------
# Delete session (drops DB + removes record)
# -------------------------------------------------------------------
@router.delete("/delete")
def delete_session(name: str, background_tasks: BackgroundTasks = None):
    """
    Delete a session completely:
    - Drops the per-session database.
    - Removes its record from the control DB.
    
    Session Name Conventions:
    - 1-59 characters long
    - Can contain letters, numbers, spaces, underscores, and hyphens
    - Cannot start or end with spaces
    - Cannot contain consecutive spaces
    - Must start with a letter (after conversion to database name)
    """
    db = ControlSessionLocal()
    try:
        # --- Step 0: Validate session name ---
        try:
            validate_session_name(name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        session_db_name = f"{name.lower().replace(' ', '_')}_db"

        # --- Step 1: Drop the session database ---
        try:
            with _control_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                exists = conn.execute(
                    text("SELECT 1 FROM pg_database WHERE datname=:name;"),
                    {"name": session_db_name}
                ).fetchone()

                if not exists:
                    raise HTTPException(status_code=404, detail=f"Session database '{session_db_name}' not found.")

                conn.execute(
                    text("""
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE datname = :name;
                    """),
                    {"name": session_db_name}
                )

                conn.execute(text(f'DROP DATABASE "{session_db_name}";'))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete session DB: {e}")

        # --- Step 2: Remove record from control DB ---
        db.query(SessionInfo).filter(SessionInfo.name == name).delete()
        db.commit()

        # --- Step 3: Broadcast deletion ---
        payload_msg = {"type": "session_deleted", "session": {"name": name}}
        if background_tasks:
            background_tasks.add_task(manager.broadcast, json.dumps(payload_msg))

        return {"status": f"Session '{name}' deleted successfully."}
    finally:
        db.close()


# -------------------------------------------------------------------
# Export session data
# -------------------------------------------------------------------
@router.get("/export")
def export_session(name: str, format: str = "json"):
    """
    Export session data in the specified format.
    
    Formats:
    - json: JSON format (default)
    - csv: CSV format for spreadsheets
    - excel: Excel format (.xlsx) with formatted sheets
    
    Returns the exported file for download.
    
    Session Name Conventions:
    - 1-59 characters long
    - Can contain letters, numbers, spaces, underscores, and hyphens
    - Cannot start or end with spaces
    - Cannot contain consecutive spaces
    - Must start with a letter (after conversion to database name)
    """
    # Validate format
    format = format.lower()
    if format not in ["json", "csv", "excel"]:
        raise HTTPException(status_code=400, detail="Format must be 'json', 'csv', or 'excel'")
    
    # Validate session name
    try:
        validate_session_name(name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check if session exists
    db = ControlSessionLocal()
    try:
        session_info = db.query(SessionInfo).filter(SessionInfo.name == name).first()
        if not session_info:
            raise HTTPException(status_code=404, detail=f"Session '{name}' not found")
        
        # Switch to session database
        try:
            logger.info(f"Export: Switching to session '{name}'")
            switch_session_db(name)
            logger.info(f"Export: Switch completed")
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        
        # Get session database connection (after switching, ActiveSessionLocal points to session DB)
        # Access ActiveSessionLocal through the module to get the updated reference
        session_db = database_module.ActiveSessionLocal()
        try:
            # Log which database we're querying
            db_url = str(session_db.bind.url) if hasattr(session_db.bind, 'url') else 'unknown'
            logger.info(f"Export: Using database: {db_url}")
            
            # First check count
            count = session_db.query(Infringement).count()
            logger.info(f"Export: Found {count} infringements in database")
            
            # If count is 0, try direct SQL
            if count == 0:
                sql_count = session_db.execute(text("SELECT COUNT(*) FROM infringements")).scalar()
                logger.warning(f"Export: ORM count is 0 but SQL count is {sql_count}")
            
            # Fetch all infringements with history
            infringements_query = session_db.query(Infringement).order_by(Infringement.timestamp.desc()).all()
            logger.info(f"Export: Query returned {len(infringements_query)} infringements")
            
            infringements = []
            for inf in infringements_query:
                # Get history for this infringement
                history = session_db.query(InfringementHistory).filter(
                    InfringementHistory.infringement_id == inf.id
                ).order_by(InfringementHistory.timestamp.desc()).all()
                
                inf_dict = {
                    "id": inf.id,
                    "kart_number": inf.kart_number,
                    "turn_number": inf.turn_number,
                    "description": inf.description,
                    "observer": inf.observer,
                    "warning_count": inf.warning_count,
                    "penalty_due": inf.penalty_due,
                    "penalty_description": inf.penalty_description,
                    "penalty_taken": inf.penalty_taken.isoformat() if inf.penalty_taken else None,
                    "timestamp": inf.timestamp.isoformat() if inf.timestamp else None,
                    "history": [
                        {
                            "action": h.action,
                            "performed_by": h.performed_by,
                            "observer": h.observer,
                            "details": h.details,
                            "timestamp": h.timestamp.isoformat() if h.timestamp else None
                        } for h in history
                    ]
                }
                infringements.append(inf_dict)
            
            # Prepare session info
            session_info_dict = {
                "name": session_info.name,
                "status": session_info.status,
                "started_at": session_info.started_at.isoformat() if session_info.started_at else None
            }
            
            # Export based on format
            if format == "json":
                export_data = {
                    "session": session_info_dict,
                    "infringements": infringements,
                    "exported_at": datetime.utcnow().isoformat()
                }
                file_path = export_session_data(name, export_data)
                media_type = "application/json"
            elif format == "csv":
                file_path = export_session_csv(name, infringements, session_info_dict)
                media_type = "text/csv"
            elif format == "excel":
                file_path = export_session_excel(name, infringements, session_info_dict)
                media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            
            # Ensure file path is absolute
            if not os.path.isabs(file_path):
                file_path = os.path.abspath(file_path)
            
            # Verify file exists
            if not os.path.exists(file_path):
                raise HTTPException(status_code=500, detail=f"Exported file not found: {file_path}")
            
            # Return file for download
            filename = os.path.basename(file_path)
            return FileResponse(
                path=file_path,
                media_type=media_type,
                filename=filename,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        finally:
            session_db.close()
    finally:
        db.close()


# -------------------------------------------------------------------
# Import session data from Excel file
# -------------------------------------------------------------------
@router.post("/import")
def import_session(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    Import session data from an Excel file (.xlsx).
    Creates a new session with the imported data.
    
    The Excel file should be in the format exported by /session/export.
    """
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls) or CSV file (.csv)")
    
    temp_file_path = None
    db = ControlSessionLocal()
    try:
        # Determine file type and save to temporary location
        is_csv = file.filename.endswith('.csv')
        suffix = '.csv' if is_csv else '.xlsx'
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            temp_file_path = tmp_file.name
        
        # Parse file based on type
        try:
            if is_csv:
                import_data = import_session_csv(temp_file_path)
            else:
                import_data = import_session_excel(temp_file_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
        
        session_info = import_data.get("session_info", {})
        infringements = import_data.get("infringements", [])
        
        # Get session name from file or use filename
        session_name = session_info.get("name")
        if not session_name:
            # Try to extract from filename
            session_name = os.path.splitext(file.filename)[0]
            # Remove timestamp if present (format: name_YYYYMMDD_HHMMSS)
            parts = session_name.rsplit('_', 2)
            if len(parts) == 3 and len(parts[1]) == 8 and len(parts[2]) == 6:
                session_name = parts[0]
        
        if not session_name:
            raise HTTPException(status_code=400, detail="Could not determine session name from file")
        
        # Validate session name
        try:
            validate_session_name(session_name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid session name from file: {str(e)}")
        
        # Check if session already exists
        existing_session = db.query(SessionInfo).filter(SessionInfo.name == session_name).first()
        session_db_name = f"{session_name.lower().replace(' ', '_')}_db"
        
        # Check if database exists (even if session record doesn't)
        from ..database import _control_engine
        with _control_engine.connect() as conn:
            db_exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname=:name;"),
                {"name": session_db_name}
            ).fetchone()
        
        if existing_session or db_exists:
            raise HTTPException(
                status_code=400,
                detail=f"Session '{session_name}' already exists. Please delete it first or use a different name."
            )
        
        # --- Step 1: Create per-session DB ---
        try:
            create_session_db(session_name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create session DB: {e}")
        
        # --- Step 2: Close all existing sessions ---
        db.query(SessionInfo).update({SessionInfo.status: "closed"})
        db.commit()
        
        # --- Step 3: Parse started_at date if provided ---
        started_at = None
        if session_info.get("started_at"):
            try:
                if isinstance(session_info["started_at"], str):
                    started_at = date_parser.parse(session_info["started_at"])
                else:
                    started_at = session_info["started_at"]
            except:
                started_at = datetime.utcnow()
        else:
            started_at = datetime.utcnow()
        
        # --- Step 4: Add new session record ---
        session_info_obj = SessionInfo(
            name=session_name,
            started_at=started_at,
            status="active"
        )
        db.add(session_info_obj)
        db.commit()
        
        # --- Step 5: Switch to new session DB ---
        try:
            switch_session_db(session_name)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to switch to session DB: {e}")
        
        # --- Step 6: Import infringements and history ---
        session_db = database_module.ActiveSessionLocal()
        try:
            imported_count = 0
            history_count = 0
            
            for inf_data in infringements:
                # Parse timestamp
                timestamp = None
                if inf_data.get("timestamp"):
                    try:
                        if isinstance(inf_data["timestamp"], str):
                            timestamp = date_parser.parse(inf_data["timestamp"])
                        else:
                            timestamp = inf_data["timestamp"]
                    except:
                        timestamp = datetime.now(timezone.utc)
                else:
                    timestamp = datetime.now(timezone.utc)
                
                # Parse penalty_taken
                penalty_taken = None
                if inf_data.get("penalty_taken"):
                    try:
                        if isinstance(inf_data["penalty_taken"], str):
                            penalty_taken = date_parser.parse(inf_data["penalty_taken"])
                        else:
                            penalty_taken = inf_data["penalty_taken"]
                    except:
                        penalty_taken = None
                
                # Create infringement (ignore original ID, let DB assign new ones)
                new_inf = Infringement(
                    session_name=session_name,
                    kart_number=inf_data.get("kart_number"),
                    turn_number=inf_data.get("turn_number"),
                    description=inf_data.get("description", ""),
                    observer=inf_data.get("observer"),
                    warning_count=inf_data.get("warning_count", 0),
                    penalty_due=inf_data.get("penalty_due", "No"),
                    penalty_description=inf_data.get("penalty_description"),
                    penalty_taken=penalty_taken,
                    timestamp=timestamp
                )
                session_db.add(new_inf)
                session_db.flush()  # Get the new ID
                
                # Import history for this infringement
                history_list = inf_data.get("history", [])
                for hist_data in history_list:
                    # Parse history timestamp
                    hist_timestamp = None
                    if hist_data.get("timestamp"):
                        try:
                            if isinstance(hist_data["timestamp"], str):
                                hist_timestamp = date_parser.parse(hist_data["timestamp"])
                            else:
                                hist_timestamp = hist_data["timestamp"]
                        except:
                            hist_timestamp = datetime.now(timezone.utc)
                    else:
                        hist_timestamp = datetime.now(timezone.utc)
                    
                    new_hist = InfringementHistory(
                        session_name=session_name,
                        infringement_id=new_inf.id,
                        action=hist_data.get("action", ""),
                        performed_by=hist_data.get("performed_by", ""),
                        observer=hist_data.get("observer"),
                        details=hist_data.get("details"),
                        timestamp=hist_timestamp
                    )
                    session_db.add(new_hist)
                    history_count += 1
                
                imported_count += 1
            
            session_db.commit()
            logger.info(f"Committed {imported_count} infringements and {history_count} history records to database")
            
            # Verify data was saved - refresh the session to ensure we see committed data
            session_db.expire_all()
            verify_count = session_db.query(Infringement).count()
            logger.info(f"Verification: {verify_count} infringements found in database after import (expected {imported_count})")
            
            if verify_count != imported_count:
                logger.warning(f"Import count mismatch: imported {imported_count} but found {verify_count} in database")
            else:
                logger.info(f"✓ Import verification successful: {verify_count} infringements confirmed in database")
        except Exception as e:
            session_db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to import data: {str(e)}")
        finally:
            session_db.close()
            logger.info(f"Closed import session, data should be committed and visible to new connections")
        
        # --- Step 8: Force engine reset and verify with completely fresh connection ---
        # This ensures any cached connections are cleared
        logger.info(f"Resetting engine and verifying data with fresh connection...")
        
        # Force dispose of current engine to clear all connections
        from ..database import _active_engine, _control_engine
        if _active_engine is not None and _active_engine is not _control_engine:
            try:
                _active_engine.dispose(close=True)
                logger.info("Disposed of active engine to clear connection pool")
            except Exception as e:
                logger.warning(f"Error disposing engine: {e}")
        
        # Re-switch to create a completely fresh engine
        try:
            switch_session_db(session_name)
            logger.info(f"Created fresh engine for session '{session_name}'")
        except Exception as e:
            logger.warning(f"Could not re-switch session: {e}")
        
        # Now verify with a completely fresh session from the new engine
        verify_db = database_module.ActiveSessionLocal()
        try:
            # Use a direct SQL query to bypass any ORM caching
            sql_count = verify_db.execute(text("SELECT COUNT(*) FROM infringements")).scalar()
            logger.info(f"Post-import SQL verification: {sql_count} infringements in database")
            
            # Also try ORM query
            all_infs = verify_db.query(Infringement).all()
            verify_count = len(all_infs)
            logger.info(f"Post-import ORM verification: {verify_count} infringements accessible via ActiveSessionLocal")
            
            if verify_count > 0:
                logger.info(f"✓ Verification successful: Sample infringement ID={all_infs[0].id}, kart={all_infs[0].kart_number}")
            elif sql_count > 0:
                logger.error(f"⚠️ SQL shows {sql_count} infringements but ORM shows 0 - ORM caching issue!")
            else:
                logger.error(f"⚠️ CRITICAL: No infringements found in database after import! Expected {imported_count}, SQL count: {sql_count}")
        except Exception as e:
            logger.error(f"Error verifying imported data: {e}", exc_info=True)
        finally:
            verify_db.close()
        
        # --- Step 9: Broadcast update ---
        payload_msg = {
            "type": "session_imported",
            "session": {"name": session_name},
            "imported": {"infringements": imported_count, "history": history_count}
        }
        if background_tasks:
            background_tasks.add_task(manager.broadcast, json.dumps(payload_msg))
        
        logger.info(f"Import complete: {imported_count} infringements, {history_count} history records for session '{session_name}'")
        
        return {
            "status": f"Session '{session_name}' imported successfully",
            "session_name": session_name,
            "imported": {
                "infringements": imported_count,
                "history": history_count
            }
        }
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except:
                pass
        db.close()
