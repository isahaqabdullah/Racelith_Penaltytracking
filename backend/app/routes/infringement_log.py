from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Infringement

router = APIRouter()

@router.get("/", response_model=list[dict])
def list_infringement_log(db: Session = Depends(get_db)):
    """Returns all infringement logs for the current session DB."""

    logs = db.query(Infringement).order_by(Infringement.timestamp.desc()).all()

    return [
        {
            "id": infr.id,
            "kart_number": infr.kart_number,
            "turn_number": infr.turn_number,
            "description": infr.description,
            "observer": infr.observer,
            "warning_count": infr.warning_count,
            "penalty_due": infr.penalty_due,
            "penalty_taken": infr.penalty_taken.isoformat() if infr.penalty_taken else None,
            "timestamp": infr.timestamp.isoformat() if infr.timestamp else None,
        }
        for infr in logs
    ]
