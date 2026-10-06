from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import InfringementHistory
from ..schemas import InfringementHistoryResponse

router=APIRouter(tags=['History'])

@router.get('/{kart_number}',response_model=list[InfringementHistoryResponse])
def get_history(kart_number:int,db:Session=Depends(get_db)):
    return db.query(InfringementHistory).filter_by(kart_number=kart_number).order_by(InfringementHistory.timestamp.desc(),InfringementHistory.id.desc()).all()
