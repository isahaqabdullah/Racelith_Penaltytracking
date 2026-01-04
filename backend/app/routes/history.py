from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Infringement, InfringementHistory
from ..schemas import InfringementHistoryResponse

router = APIRouter(tags=["History"])

@router.get("/{kart_number}", response_model=List[InfringementHistoryResponse])
def get_history(kart_number: int, db: Session = Depends(get_db)):
    """Get infringement history for a specific kart in the current session DB."""

    infringements = db.query(Infringement).filter(
        Infringement.kart_number == kart_number
    ).all()

    if not infringements:
        raise HTTPException(status_code=404, detail="Infringement not found for this kart.")

    history_records = (
        db.query(InfringementHistory)
        .filter(InfringementHistory.infringement_id.in_([inf.id for inf in infringements]))
        .order_by(InfringementHistory.timestamp.desc())
        .all()
    )

    return history_records
