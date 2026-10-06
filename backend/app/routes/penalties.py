from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Infringement
from ..schemas import ApplyPenaltyRequest, ApplyPenaltyResponse
from ..penalty_rules import lock_incidents, audit, iso
from .infringements import broadcast

router=APIRouter(tags=['Penalties'])

def apply(db, rows, actor):
    now=datetime.now(timezone.utc)
    for inf in rows:
        inf.penalty_due='No';inf.penalty_taken=now
        if inf.penalty_origin=='automatic':
            inf.warning_count=0
        audit(db,inf,'penalty_applied',actor,{'penalty':inf.penalty_description,'served_at':iso(now)})
    db.commit()

@router.post('/apply/{kart_number}',response_model=ApplyPenaltyResponse)
def apply_all_penalties(kart_number:int,payload:ApplyPenaltyRequest,background_tasks:BackgroundTasks,db:Session=Depends(get_db)):
    lock_incidents(db)
    rows=db.query(Infringement).filter_by(kart_number=kart_number,penalty_due='Yes',deleted_at=None).all()
    if not rows:
        raise HTTPException(400,'No pending penalty for this kart.')
    apply(db,rows,payload.performed_by)
    broadcast(background_tasks,'penalty_applied',db,{'kart_number':kart_number})
    return ApplyPenaltyResponse(kart_number=kart_number,status='All pending penalties applied')

@router.post('/apply_individual/{infringement_id}',response_model=ApplyPenaltyResponse)
def apply_individual_penalty(infringement_id:int,payload:ApplyPenaltyRequest,background_tasks:BackgroundTasks,db:Session=Depends(get_db)):
    lock_incidents(db)
    inf=db.query(Infringement).filter_by(id=infringement_id,penalty_due='Yes',deleted_at=None).first()
    if not inf:
        raise HTTPException(400,'No pending penalty for this infringement.')
    apply(db,[inf],payload.performed_by)
    broadcast(background_tasks,'penalty_applied',db,{'kart_number':inf.kart_number,'infringement_id':inf.id})
    return ApplyPenaltyResponse(kart_number=inf.kart_number,status='Individual penalty applied',infringement_id=inf.id,penalty_description=inf.penalty_description)

@router.get('/pending')
def get_pending_penalties(db:Session=Depends(get_db)):
    return [{'session_name':inf.session_name,'id':inf.id,'kart_number':inf.kart_number,'description':inf.description,'penalty_description':inf.penalty_description,'timestamp':iso(inf.timestamp),'observer':inf.observer} for inf in db.query(Infringement).filter_by(penalty_due='Yes',deleted_at=None).order_by(Infringement.timestamp,Infringement.id).all()]
