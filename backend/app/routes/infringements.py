from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError, OperationalError
from datetime import datetime, timezone, timedelta
import json, logging

from ..database import get_db
from ..models import Infringement, InfringementHistory
from ..schemas import InfringementCreate, InfringementResponse
from ..ws_manager import manager
from ..vars import get_warning_expiry_minutes

router = APIRouter(tags=["Infringements"])
logger = logging.getLogger(__name__)

def handle_db_error(e: Exception):
    """Handle database errors and return user-friendly HTTP exceptions."""
    error_str = str(e).lower()
    if "relation" in error_str and "does not exist" in error_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active session. Please create or load a session first."
        )
    elif "does not exist" in error_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Database error: Table does not exist. Please ensure a session is active."
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

def _normalize_turn_number(value):
    """Allow turn_number to be provided as int or string; store as trimmed string or None."""
    if value is None:
        return None
    try:
        text = str(value).strip()
        return text if text != "" else None
    except Exception:
        return None

@router.post("/", response_model=InfringementResponse)
def create_infringement(payload: InfringementCreate, db: Session = Depends(get_db), background_tasks: BackgroundTasks = None):
    """
    Create an infringement with proper warning/penalty logic.
    - White line: accumulates warnings (expire after 180 minutes), 3 warnings = penalty.
    - All other infringements: use penalty_description from payload if provided.
    """
    try:
        # Handle optional description - default to empty string if not provided
        description = payload.description or ""
        desc_lower = description.strip().lower() if description else ""
        now = datetime.now(timezone.utc)
        expiry_threshold = now - timedelta(minutes=get_warning_expiry_minutes())

        warning_count = 0
        penalty_due = "No"
        penalty_description = None

        if desc_lower and "white line infringement" in desc_lower:
            # White line: honor provided penalty_description; only run warning accumulation when it's a warning
            incoming_penalty = (payload.penalty_description or "").strip()
            if incoming_penalty and incoming_penalty.lower() != "warning":
                warning_count = 1
                # "No further action" means no penalty is due
                if incoming_penalty.lower() == "no further action":
                    penalty_due = "No"
                else:
                    penalty_due = "Yes"
                penalty_description = incoming_penalty
            else:
                # Warning path: special accumulation (180 min expiry, 3 warnings = penalty)
                # Only count warnings that haven't triggered a penalty yet (penalty_due != "Yes")
                # This allows the warning count to reset after a penalty is issued
                last_penalty = db.query(Infringement).filter(
                    Infringement.kart_number == payload.kart_number,
                    Infringement.description.ilike("%white line infringement%"),
                    Infringement.penalty_due == "Yes"
                ).order_by(Infringement.timestamp.desc()).first()

                cycle_start = expiry_threshold
                if last_penalty:
                    cycle_start = max(expiry_threshold, last_penalty.timestamp)

                valid_white_infringements = db.query(Infringement).filter(
                    Infringement.kart_number == payload.kart_number,
                    Infringement.description.ilike("%white line infringement%"),
                    Infringement.timestamp >= cycle_start,
                    Infringement.penalty_due != "Yes"  # Exclude infringements that already triggered a penalty
                ).order_by(Infringement.timestamp.desc()).all()

                warning_count = len(valid_white_infringements) + 1  # +1 for current one

                if warning_count >= 3:
                    penalty_due = "Yes"
                    penalty_description = "5 sec Stop & Go"
                else:
                    penalty_due = "No"
                    penalty_description = "Warning"

        else:
            # All other infringements (yellow zone, generic, etc.): use penalty_description from payload
            warning_count = 1
            if payload.penalty_description:
                desc = payload.penalty_description.strip().lower()
                # "No further action" or "Warning" means no penalty is due
                if desc in ["no further action", "warning"]:
                    penalty_due = "No"
                    penalty_description = payload.penalty_description
                else:
                    penalty_due = "Yes"
                    penalty_description = payload.penalty_description
            else:
                penalty_due = "No"
                penalty_description = None

        # Create infringement record
        new_inf = Infringement(
            kart_number=payload.kart_number,
            turn_number=_normalize_turn_number(payload.turn_number),
            description=description,
            observer=payload.observer,
            warning_count=warning_count,
            penalty_due=penalty_due,
            penalty_description=penalty_description,
            penalty_taken=None,
            timestamp=now
        )
        db.add(new_inf)
        db.commit()
        db.refresh(new_inf)

        # Record in history
        performed_by = payload.performed_by or "System"
        history = InfringementHistory(
            infringement_id=new_inf.id,
            action="created",
            performed_by=performed_by,
            observer=payload.observer,
            details=f"{description} | warning_count={warning_count} | penalty_due={penalty_due} | penalty_description={penalty_description}",
            timestamp=now
        )
        db.add(history)
        db.commit()

        # Broadcast asynchronously - FastAPI should always inject BackgroundTasks
        if background_tasks:
            background_tasks.add_task(manager.broadcast, json.dumps({
                "type": "new_infringement",
                "data": {
                    "id": new_inf.id,
                    "kart_number": new_inf.kart_number,
                    "description": new_inf.description,
                    "warning_count": new_inf.warning_count,
                    "penalty_due": new_inf.penalty_due,
                    "penalty_description": new_inf.penalty_description,
                    "timestamp": new_inf.timestamp.isoformat()
                }
            }))
        else:
            logger.warning("BackgroundTasks not available - WebSocket broadcast skipped")

        return new_inf
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        handle_db_error(e)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating infringement: {str(e)}"
        )


@router.get("/")
def list_infringements(
    page: int = 1,
    limit: int = 300,
    db: Session = Depends(get_db)
):
    """List infringements in the active session database with pagination."""
    try:
        # Log the database URL being used
        db_url = str(db.bind.url) if hasattr(db.bind, 'url') else 'unknown'
        logger.info(f"list_infringements: Using database: {db_url}, page={page}, limit={limit}")
        
        # Ensure we're in a fresh transaction - commit any pending changes
        db.commit()
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if limit < 1:
            limit = 300
        if limit > 1000:
            limit = 1000  # Max limit to prevent abuse
        
        # Get total count
        total_count = db.query(Infringement).count()
        logger.info(f"list_infringements: Total count: {total_count}")
        
        # Calculate pagination
        offset = (page - 1) * limit
        total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1
        
        # Fetch paginated results
        infringements = db.query(Infringement)\
            .order_by(Infringement.timestamp.desc())\
            .offset(offset)\
            .limit(limit)\
            .all()
        
        logger.info(f"list_infringements: Returning {len(infringements)} infringements (page {page}/{total_pages})")
        
        # Return with pagination metadata
        return {
            "items": infringements,
            "total": total_count,
            "page": page,
            "limit": limit,
            "total_pages": total_pages
        }
    except (ProgrammingError, OperationalError) as e:
        handle_db_error(e)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching infringements: {str(e)}"
        )
@router.put("/{infringement_id}", response_model=InfringementResponse)
def update_infringement(
    infringement_id: int,
    payload: InfringementCreate,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """Update an infringement while keeping warning/penalty logic consistent and broadcasting updates."""
    try:
        inf = db.query(Infringement).filter(Infringement.id == infringement_id).first()
        if not inf:
            raise HTTPException(status_code=404, detail="Infringement not found")

        # Update fields
        # Handle optional description - use existing if not provided, or empty string if None
        description = payload.description if payload.description is not None else (inf.description or "")
        inf.kart_number = payload.kart_number
        inf.turn_number = _normalize_turn_number(payload.turn_number)
        inf.description = description
        inf.observer = payload.observer
        # Keep original timestamp to reflect when the infringement was first logged

        # --- Re-evaluate logic (same as create) ---
        desc_lower = description.strip().lower() if description else ""
        now = datetime.now(timezone.utc)
        expiry_threshold = now - timedelta(minutes=get_warning_expiry_minutes())
        warning_count = 0
        penalty_due = "No"
        penalty_description = None

        if desc_lower and "white line infringement" in desc_lower:
            # White line: special warning accumulation logic (180 min expiry, 3 warnings = penalty)
            # Get *non-expired* white line infringements for this kart (excluding current one)
            # Only count warnings that haven't triggered a penalty yet (penalty_due != "Yes")
            # This allows the warning count to reset after a penalty is issued
            last_penalty = db.query(Infringement).filter(
                Infringement.kart_number == payload.kart_number,
                Infringement.description.ilike("%white line infringement%"),
                Infringement.penalty_due == "Yes",
                Infringement.id != inf.id,
            ).order_by(Infringement.timestamp.desc()).first()

            cycle_start = expiry_threshold
            if last_penalty:
                cycle_start = max(expiry_threshold, last_penalty.timestamp)

            valid_white_infringements = db.query(Infringement).filter(
                Infringement.kart_number == payload.kart_number,
                Infringement.description.ilike("%white line infringement%"),
                Infringement.timestamp >= cycle_start,
                Infringement.id != inf.id,
                Infringement.penalty_due != "Yes"  # Exclude infringements that already triggered a penalty
            ).order_by(Infringement.timestamp.desc()).all()

            warning_count = len(valid_white_infringements) + 1  # +1 for current one

            if warning_count >= 3:
                penalty_due = "Yes"
                penalty_description = "5 sec Stop & Go"
            else:
                penalty_due = "No"
                penalty_description = "Warning"
        else:
            # All other infringements (yellow zone, generic, etc.): use penalty_description from payload
            warning_count = 1
            if payload.penalty_description:
                desc = payload.penalty_description.strip().lower()
                # "No further action" or "Warning" means no penalty is due
                if desc in ["no further action", "warning"]:
                    penalty_due = "No"
                    penalty_description = payload.penalty_description
                else:
                    penalty_due = "Yes"
                    penalty_description = payload.penalty_description
            else:
                penalty_due = "No"
                penalty_description = None

        inf.warning_count = warning_count
        inf.penalty_due = penalty_due
        inf.penalty_description = penalty_description

        db.commit()
        db.refresh(inf)

        # --- Add to history ---
        performed_by = payload.performed_by or "System"
        history = InfringementHistory(
            infringement_id=inf.id,
            action="updated",
            performed_by=performed_by,
            observer=payload.observer,
            details=f"Updated infringement {inf.id}: {description} | warning_count={warning_count} | penalty_due={penalty_due}",
            timestamp=datetime.now(timezone.utc)
        )
        db.add(history)
        db.commit()

        # --- Broadcast update ---
        if background_tasks:
            background_tasks.add_task(manager.broadcast, json.dumps({
                "type": "update_infringement",
                "data": {
                    "id": inf.id,
                    "kart_number": inf.kart_number,
                    "description": inf.description,
                    "warning_count": inf.warning_count,
                    "penalty_due": inf.penalty_due,
                    "penalty_description": inf.penalty_description,
                    "timestamp": inf.timestamp.isoformat()
                }
            }))

        return inf
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        handle_db_error(e)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating infringement: {str(e)}"
        )


@router.delete("/{infringement_id}")
def delete_infringement(infringement_id: int, db: Session = Depends(get_db), background_tasks: BackgroundTasks = None):
    """Delete an infringement, record in history, and broadcast removal."""
    try:
        inf = db.query(Infringement).filter(Infringement.id == infringement_id).first()
        if not inf:
            raise HTTPException(status_code=404, detail="Infringement not found")

        # --- Record history before deletion ---
        history = InfringementHistory(
            infringement_id=infringement_id,
            action="deleted",
            performed_by="system",
            observer=inf.observer,
            details=f"Deleted infringement {infringement_id}: {inf.description}",
            timestamp=datetime.now(timezone.utc)
        )
        db.add(history)

        db.delete(inf)
        db.commit()

        # --- Broadcast delete ---
        if background_tasks:
            background_tasks.add_task(manager.broadcast, json.dumps({
                "type": "delete_infringement",
                "data": {
                    "id": infringement_id
                }
            }))

        return {"status": "deleted", "id": infringement_id}
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        handle_db_error(e)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting infringement: {str(e)}"
        )
