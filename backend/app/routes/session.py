import os
import json
import logging
import tempfile
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import func
from ..database import ControlSessionLocal, create_session_db, session_factory, drop_session_db, lock_lifecycle
from ..models import SessionInfo, Infringement, InfringementHistory, AppConfig
from ..utils import validate_session_name
from ..penalty_rules import iso, snapshot
from ..transfer import export_file, parse_file, MAX_UPLOAD
from ..ws_manager import manager

router=APIRouter()
logger=logging.getLogger(__name__)

def validate(name):
    try:validate_session_name(name)
    except ValueError as exc:raise HTTPException(400,str(exc))
    if name!=name.strip():raise HTTPException(400,'Session name cannot start or end with spaces')

def resolve(db,name):
    validate(name)
    info=db.query(SessionInfo).filter_by(name=name).first()
    if not info:raise HTTPException(404,'Session not found. Use its exact name.')
    return info

def unique_name(db,name):
    if db.query(SessionInfo).filter(func.lower(SessionInfo.name)==name.lower()).first():
        raise HTTPException(400,'A session with this name already exists.')

def notify(tasks,event,name):
    tasks.add_task(manager.broadcast,json.dumps({'type':event,'session':{'name':name}}))

def activate(db,info):
    db.query(SessionInfo).filter(SessionInfo.status=='active').update({SessionInfo.status:'closed'})
    info.status='active';db.add(info)

@router.post('/start')
def start_session(name:str,background_tasks:BackgroundTasks):
    validate(name)
    info=None
    with ControlSessionLocal() as db:
        lock_lifecycle(db)
        unique_name(db,name)
        try:
            info=SessionInfo(name=name,database_name=create_session_db(name),started_at=datetime.now(timezone.utc),status='active')
            activate(db,info);db.commit()
        except Exception:
            db.rollback()
            if info:drop_session_db(info)
            raise
    notify(background_tasks,'session_started',name)
    return {'status':'Session started','session':{'name':name}}

@router.post('/load')
def load_session(name:str,background_tasks:BackgroundTasks):
    with ControlSessionLocal() as db:
        lock_lifecycle(db);info=resolve(db,name)
        session_factory(info)
        activate(db,info);db.commit()
    notify(background_tasks,'session_loaded',name)
    return {'status':'Session loaded','session':{'name':name}}

@router.post('/close')
def close_session(name:str,background_tasks:BackgroundTasks):
    with ControlSessionLocal() as db:
        lock_lifecycle(db);info=resolve(db,name)
        info.status='closed';db.commit()
    notify(background_tasks,'session_closed',name)
    return {'status':'Session closed'}

@router.get('/')
def list_sessions():
    with ControlSessionLocal() as db:
        return {'sessions':[{'name':s.name,'status':s.status,'started_at':iso(s.started_at)} for s in db.query(SessionInfo).order_by(SessionInfo.started_at.desc()).all()]}

@router.delete('/delete')
def delete_session(name:str,background_tasks:BackgroundTasks):
    with ControlSessionLocal() as db:
        lock_lifecycle(db);info=resolve(db,name)
        drop_session_db(info)
        db.query(AppConfig).filter_by(key='qualifying_mode:'+name).delete()
        db.delete(info);db.commit()
    notify(background_tasks,'session_deleted',name)
    return {'status':'Session deleted'}

@router.get('/export')
def export_session(name:str,format:str='json',background_tasks:BackgroundTasks=None):
    if format not in ('json','csv','excel'):raise HTTPException(400,'Format must be json, csv or excel')
    with ControlSessionLocal() as control:
        lock_lifecycle(control,exclusive=False);info=resolve(control,name)
        with session_factory(info)() as db:
            # Incident rows and their audit events must represent the same snapshot.
            db.connection(execution_options={'isolation_level':'REPEATABLE READ'})
            rows=[]
            for inf in db.query(Infringement).order_by(Infringement.timestamp.desc(),Infringement.id.desc()).all():
                rows.append({'id':inf.id,**snapshot(inf),'history':[{'action':h.action,'kart_number':h.kart_number,'performed_by':h.performed_by,'observer':h.observer,'details':h.details,'timestamp':iso(h.timestamp)} for h in inf.history]})
            qualifying=control.query(AppConfig).filter_by(key='qualifying_mode:'+name).first()
            config={'name':info.name,'status':info.status,'started_at':iso(info.started_at),'qualifying_mode':bool(qualifying and qualifying.value.lower()=='true')}
            path=export_file(name,rows,config,format)
    if background_tasks:background_tasks.add_task(os.unlink,path)
    return FileResponse(path,filename=f'{name}.{dict(json="json",csv="csv",excel="xlsx")[format]}',media_type={'json':'application/json','csv':'text/csv','excel':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[format])

@router.post('/import')
def import_session(background_tasks:BackgroundTasks,file:UploadFile=File(...)):
    filename=file.filename or ''
    suffix=os.path.splitext(filename)[1].lower()
    if suffix not in ('.xlsx','.csv'):raise HTTPException(400,'Use an Excel .xlsx or CSV .csv file. Legacy .xls is not supported.')
    temporary=None;info=None;activated=False
    try:
        with tempfile.NamedTemporaryFile(delete=False,suffix=suffix) as f:
            temporary=f.name;size=0
            while True:
                chunk=file.file.read(65536)
                if not chunk:break
                size+=len(chunk)
                if size>MAX_UPLOAD:raise HTTPException(413,'Import exceeds the 10 MB limit')
                f.write(chunk)
        try:data=parse_file(temporary,suffix=='.csv')
        except Exception as exc:
            logger.info('Import validation failed',exc_info=True)
            message=str(exc) if isinstance(exc,ValueError) else 'Invalid or unsupported spreadsheet'
            raise HTTPException(400,message)
        meta=data['session_info'];name=meta.get('name') or os.path.splitext(filename)[0]
        validate(name)
        with ControlSessionLocal() as control:
            unique_name(control,name)
        info=SessionInfo(name=name,database_name=create_session_db(name),status='closed',started_at=datetime.fromisoformat(meta['started_at'].replace('Z','+00:00')) if meta.get('started_at') else datetime.now(timezone.utc))
        histories=0
        with session_factory(info)() as db:
            for row in data['infringements']:
                inf=Infringement(session_name=name,**{k:v for k,v in row.items() if k not in ('id','history')})
                if not inf.timestamp:inf.timestamp=datetime.now(timezone.utc)
                db.add(inf);db.flush()
                for h in row['history']:
                    db.add(InfringementHistory(session_name=name,infringement_id=inf.id,kart_number=h.get('kart_number') or inf.kart_number,
                        action=h['action'],performed_by=h.get('performed_by') or 'System',observer=h.get('observer'),details=h.get('details'),timestamp=h.get('timestamp') or datetime.now(timezone.utc)))
                    histories+=1
            db.commit()
        with ControlSessionLocal() as control:
            lock_lifecycle(control);unique_name(control,name)
            activate(control,info)
            control.add(AppConfig(key='qualifying_mode:'+name,value=str(meta.get('qualifying_mode',False)).lower()))
            control.commit();activated=True
        notify(background_tasks,'session_imported',name)
        return {'status':'Session imported successfully','session_name':name,'imported':{'infringements':len(data['infringements']),'history':histories}}
    finally:
        if temporary:os.unlink(temporary)
        if info is not None and not activated:
            try:drop_session_db(info)
            except Exception:logger.exception('Could not clean up failed staged import')
        file.file.close()
