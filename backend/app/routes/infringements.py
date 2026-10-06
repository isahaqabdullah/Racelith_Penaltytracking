import hashlib
import json
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Infringement
from ..schemas import InfringementCreate, InfringementResponse
from ..penalty_rules import lock_incidents, replay, set_requested, snapshot, audit, iso, warning_flags, kind
from ..ws_manager import manager

router = APIRouter(tags=['Infringements'])

def _infringement_payload(inf):
    return {'id': inf.id, 'session_name':inf.session_name, **{k:getattr(inf,k) for k in ('kart_number','turn_number','description','observer','warning_count','penalty_due','penalty_description','penalty_origin','review_required')}, 'timestamp':iso(inf.timestamp), 'penalty_taken':iso(inf.penalty_taken)}

def broadcast(tasks, event, db, data):
    if tasks:
        tasks.add_task(manager.broadcast, json.dumps({'type':event,'session':{'name':db.info['session_name']},'data':data}))

@router.post('/', response_model=InfringementResponse)
def create_infringement(payload: InfringementCreate, background_tasks: BackgroundTasks, db: Session=Depends(get_db)):
    if payload.session_name and payload.session_name != db.info['session_name']:
        raise HTTPException(409, 'The active session changed. Your draft has not been saved.')
    lock_incidents(db)
    fingerprint = hashlib.sha256(json.dumps(payload.model_dump(mode='json', exclude={'request_id'}),sort_keys=True).encode()).hexdigest()
    if payload.request_id:
        previous = db.query(Infringement).filter_by(request_id=payload.request_id).first()
        if previous:
            if previous.request_fingerprint != fingerprint or previous.deleted_at:
                raise HTTPException(409, 'This request has already been used for a different or deleted incident.')
            return previous
    inf = Infringement(session_name=db.info['session_name'], kart_number=payload.kart_number,
        turn_number=payload.turn_number, description=payload.description or '', observer=payload.observer,
        timestamp=payload.timestamp or datetime.now(timezone.utc), request_id=payload.request_id,
        request_fingerprint=fingerprint, warning_count=0, penalty_due='No', review_required=False)
    set_requested(inf, payload.penalty_description)
    db.add(inf); db.flush()
    replay(db, {inf.kart_number}, payload.performed_by)
    audit(db, inf, 'created', payload.performed_by, snapshot(inf))
    db.commit(); db.refresh(inf)
    broadcast(background_tasks, 'new_infringement', db, _infringement_payload(inf))
    return inf

@router.get('/')
def list_infringements(page: int=Query(1,ge=1), limit: int=Query(300,ge=1,le=1000), kart_number: int=Query(default=None,ge=1), db: Session=Depends(get_db)):
    query = db.query(Infringement).filter(Infringement.deleted_at.is_(None))
    if kart_number is not None:
        query = query.filter(Infringement.kart_number==kart_number)
    total = query.count(); total_pages = max(1,(total+limit-1)//limit)
    page = min(page,total_pages)
    rows = query.order_by(Infringement.timestamp.desc(),Infringement.id.desc()).offset((page-1)*limit).limit(limit).all()
    flags = warning_flags(db)
    return {'items':[{**_infringement_payload(i), 'warning_flag':i.id in flags} for i in rows], 'total':total,'page':page,'limit':limit,'total_pages':total_pages,'server_time_utc':iso(datetime.now(timezone.utc))}

@router.put('/{infringement_id}', response_model=InfringementResponse)
def update_infringement(infringement_id: int, payload: InfringementCreate, background_tasks: BackgroundTasks, db: Session=Depends(get_db)):
    if payload.session_name and payload.session_name != db.info['session_name']:
        raise HTTPException(409, 'The active session changed. Reload before saving.')
    lock_incidents(db)
    inf = db.query(Infringement).filter_by(id=infringement_id, deleted_at=None).first()
    if not inf:
        raise HTTPException(404,'Infringement not found')
    before = snapshot(inf); old_kart = inf.kart_number
    penalty_changed = 'penalty_description' in payload.model_fields_set and payload.penalty_description != inf.penalty_description
    if inf.penalty_taken and penalty_changed:
        raise HTTPException(409,'A served penalty cannot be replaced. Its service history must be preserved.')
    inf.kart_number=payload.kart_number
    for field in ('turn_number','description','observer'):
        if field in payload.model_fields_set:
            setattr(inf,field,getattr(payload,field) or ('' if field=='description' else None))
    if penalty_changed:
        set_requested(inf,payload.penalty_description)
    elif inf.penalty_origin == 'automatic' or kind(before['description']) != kind(inf.description):
        set_requested(inf,inf.requested_penalty)
    if inf.penalty_taken and kind(before['description']) != kind(inf.description):
        inf.review_required = True
    # Timestamp corrections are explicit; metadata-only edits preserve event time.
    if payload.timestamp is not None:
        inf.timestamp=payload.timestamp
    replay(db, {old_kart,inf.kart_number},payload.performed_by)
    audit(db, inf,'updated',payload.performed_by,{'before':before,'after':snapshot(inf)})
    db.commit();db.refresh(inf)
    broadcast(background_tasks,'update_infringement',db,_infringement_payload(inf))
    return inf

@router.delete('/{infringement_id}')
def delete_infringement(infringement_id: int, background_tasks: BackgroundTasks, db: Session=Depends(get_db)):
    lock_incidents(db)
    inf=db.query(Infringement).filter_by(id=infringement_id,deleted_at=None).first()
    if not inf:
        raise HTTPException(404,'Infringement not found')
    before=snapshot(inf);inf.deleted_at=datetime.now(timezone.utc)
    audit(db,inf,'deleted','System',{'before':before,'served_penalty_preserved':bool(inf.penalty_taken)})
    replay(db,{inf.kart_number})
    db.commit()
    broadcast(background_tasks,'delete_infringement',db,{'id':inf.id})
    return {'status':'deleted','id':inf.id}
