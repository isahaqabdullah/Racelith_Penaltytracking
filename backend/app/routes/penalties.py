from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError, OperationalError
from datetime import datetime, timezone
from ..database import get_db
from ..models import Infringement, InfringementHistory
from ..schemas import ApplyPenaltyRequest, ApplyPenaltyResponse
from ..ws_manager import manager
import json

router = APIRouter(tags=["Penalties"])

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

@router.post("/apply/{kart_number}", response_model=ApplyPenaltyResponse)
def apply_all_penalties(kart_number: int, payload: ApplyPenaltyRequest, db: Session = Depends(get_db), background_tasks: BackgroundTasks = None):
    infringements = db.query(Infringement).filter(
        Infringement.kart_number == kart_number
    ).all()

    pending = [inf for inf in infringements if inf.penalty_due == "Yes"]
    if not pending:
        raise HTTPException(status_code=400, detail="No pending penalty for this kart.")

    now = datetime.now(timezone.utc)
    for inf in pending:
        inf.penalty_due = "No"
        inf.penalty_taken = now
        if "white line infringement" in inf.description.lower():
            inf.warning_count = 0
        db.add(inf)
    db.commit()

    db.add(InfringementHistory(
        infringement_id=pending[-1].id,
        action="penalty_applied",
        performed_by=payload.performed_by,
        observer=None,
        details="Penalty applied and warnings reset if white line.",
        timestamp=now
    ))
    db.commit()

    if background_tasks:
        background_tasks.add_task(manager.broadcast, json.dumps({
            "type": "penalty_applied",
            "data": {"kart_number": kart_number, "penalty_taken": now.isoformat()}
        }))

    return ApplyPenaltyResponse(kart_number=kart_number, status="All pending penalties applied")


@router.post("/apply_individual/{infringement_id}", response_model=ApplyPenaltyResponse)
def apply_individual_penalty(infringement_id: int, payload: ApplyPenaltyRequest, db: Session = Depends(get_db), background_tasks: BackgroundTasks = None):
    inf = db.query(Infringement).filter(
        Infringement.id == infringement_id
    ).first()

    if not inf or inf.penalty_due != "Yes":
        raise HTTPException(status_code=400, detail="No pending penalty for this infringement.")

    now = datetime.now(timezone.utc)
    inf.penalty_due = "No"
    inf.penalty_taken = now
    if "white line infringement" in inf.description.lower():
        inf.warning_count = 0
    db.add(inf)
    db.commit()

    db.add(InfringementHistory(
        infringement_id=inf.id,
        action="penalty_applied",
        performed_by=payload.performed_by,
        observer=None,
        details=f"Individual penalty applied: {inf.penalty_description}",
        timestamp=now
    ))
    db.commit()

    if background_tasks:
        background_tasks.add_task(manager.broadcast, json.dumps({
            "type": "penalty_applied",
            "data": {
                "kart_number": inf.kart_number,
                "infringement_id": inf.id,
                "penalty_description": inf.penalty_description,
                "penalty_taken": now.isoformat()
            }
        }))

    return ApplyPenaltyResponse(
        kart_number=inf.kart_number,
        status="Individual penalty applied",
        infringement_id=inf.id,
        penalty_description=inf.penalty_description
    )


@router.get("/pending", response_model=list[dict])
def get_pending_penalties(db: Session = Depends(get_db)):
    try:
        pending = db.query(Infringement).filter(
            Infringement.penalty_due == "Yes"
        ).order_by(Infringement.timestamp.asc()).all()

        return [
            {
                "id": inf.id,
                "kart_number": inf.kart_number,
                "description": inf.description,
                "penalty_description": inf.penalty_description,
                "timestamp": inf.timestamp.isoformat(),
                "observer": inf.observer
            }
            for inf in pending
        ]
    except (ProgrammingError, OperationalError) as e:
        handle_db_error(e)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching pending penalties: {str(e)}"
        )
