from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError, OperationalError
from datetime import datetime, timezone, timedelta
import asyncio
import json

from ..database import get_db
from ..models import Infringement, InfringementHistory
from ..schemas import InfringementCreate, InfringementResponse
from ..ws_manager import manager

router = APIRouter(tags=["Infringements"])

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

@router.post("/", response_model=InfringementResponse)
def create_infringement(payload: InfringementCreate, db: Session = Depends(get_db)):
    """
    Create an infringement with proper warning/penalty logic.
    - White line: accumulates warnings (expire after 180 minutes).
    - Yellow zone: automatic penalty.
    """
    try:
        desc_lower = payload.description.strip().lower()
        now = datetime.now(timezone.utc)
        expiry_threshold = now - timedelta(minutes=180)

        warning_count = 0
        penalty_due = "No"
        penalty_description = None

        if "yellow zone infringement" in desc_lower:
            warning_count = 0
            penalty_due = "Yes"
            penalty_description = "5 sec Stop & Go"

        elif "white line infringement" in desc_lower:
            # Get *non-expired* white line infringements for this kart
            valid_white_infringements = db.query(Infringement).filter(
                Infringement.kart_number == payload.kart_number,
                Infringement.description.ilike("%white line infringement%"),
                Infringement.timestamp >= expiry_threshold
            ).order_by(Infringement.timestamp.desc()).all()

            warning_count = len(valid_white_infringements) + 1  # +1 for current one

            if warning_count >= 3:
                penalty_due = "Yes"
                penalty_description = "5 sec Stop & Go"
            else:
                penalty_due = "No"
                penalty_description = "Warning"

        else:
            # Generic / other infringements
            warning_count = 1
            penalty_due = "No"
            penalty_description = None

        # Create infringement record
        new_inf = Infringement(
            kart_number=payload.kart_number,
            turn_number=payload.turn_number,
            description=payload.description,
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
        history = InfringementHistory(
            infringement_id=new_inf.id,
            action="created",
            performed_by=payload.performed_by,
            observer=payload.observer,
            details=f"{payload.description} | warning_count={warning_count} | penalty_due={penalty_due} | penalty_description={penalty_description}",
            timestamp=now
        )
        db.add(history)
        db.commit()

        # Broadcast asynchronously
        try:
            asyncio.create_task(manager.broadcast(json.dumps({
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
            })))
        except Exception:
            pass

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


@router.get("/", response_model=list[InfringementResponse])
def list_infringements(db: Session = Depends(get_db)):
    """List all infringements in the active session database."""
    try:
        return db.query(Infringement).order_by(Infringement.timestamp.desc()).all()
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
    db: Session = Depends(get_db)
):
    """Update an infringement while keeping warning/penalty logic consistent and broadcasting updates."""
    try:
        inf = db.query(Infringement).filter(Infringement.id == infringement_id).first()
        if not inf:
            raise HTTPException(status_code=404, detail="Infringement not found")

        # Update fields
        inf.kart_number = payload.kart_number
        inf.turn_number = payload.turn_number
        inf.description = payload.description
        inf.observer = payload.observer
        inf.timestamp = datetime.now(timezone.utc)

        # --- Re-evaluate logic (same as create) ---
        desc_lower = payload.description.strip().lower()
        warning_count = 0
        penalty_due = "No"
        penalty_description = None

        if "yellow zone infringement" in desc_lower:
            penalty_due = "Yes"
            penalty_description = "5 sec Stop & Go"
        elif "white line infringement" in desc_lower:
            # Recalculate based on other white line infringements for this kart
            previous_white = db.query(Infringement).filter(
                Infringement.kart_number == payload.kart_number,
                Infringement.description.ilike("%white line infringement%"),
                Infringement.id != inf.id
            ).count()
            warning_count = previous_white + 1
            if warning_count >= 3:
                penalty_due = "Yes"
                penalty_description = "5 sec Stop & Go"
            else:
                penalty_description = "Warning"
        else:
            warning_count = 1

        inf.warning_count = warning_count
        inf.penalty_due = penalty_due
        inf.penalty_description = penalty_description

        db.commit()
        db.refresh(inf)

        # --- Add to history ---
        history = InfringementHistory(
            infringement_id=inf.id,
            action="updated",
            performed_by=payload.performed_by,
            observer=payload.observer,
            details=f"Updated infringement {inf.id}: {payload.description} | warning_count={warning_count} | penalty_due={penalty_due}",
            timestamp=datetime.now(timezone.utc)
        )
        db.add(history)
        db.commit()

        # --- Broadcast update ---
        try:
            asyncio.create_task(manager.broadcast(json.dumps({
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
            })))
        except Exception:
            pass

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
def delete_infringement(infringement_id: int, db: Session = Depends(get_db)):
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
        try:
            asyncio.create_task(manager.broadcast(json.dumps({
                "type": "delete_infringement",
                "data": {
                    "id": infringement_id
                }
            })))
        except Exception:
            pass

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