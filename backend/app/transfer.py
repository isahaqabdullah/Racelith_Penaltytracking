"""Versioned, lossless spreadsheet interchange with literal text and strict row validation."""
import csv
import json
import os
import uuid
import zipfile
from datetime import datetime, timezone
from dateutil import parser
from openpyxl import Workbook, load_workbook
from pydantic import ValidationError
from .schemas import InfringementCreate
from .penalty_rules import iso, utc, kind
from .vars import SESSION_EXPORT_DIR

MAX_ROWS=10000
MAX_UPLOAD=10*1024*1024
FIELDS={
 'ID':'id','Kart Number':'kart_number','Turn Number':'turn_number',
 'Description':'description','Observer':'observer','Warning Count':'warning_count',
 'Penalty Due':'penalty_due','Penalty Description':'penalty_description',
 'Penalty Taken (UTC)':'penalty_taken','Timestamp (UTC)':'timestamp',
 'Penalty Origin':'penalty_origin','Requested Penalty':'requested_penalty',
 'Deleted At (UTC)':'deleted_at','Review Required':'review_required',
}
HISTORY={'Infringement ID':'infringement_id','Kart Number':'kart_number','Action':'action','Performed By':'performed_by','Observer':'observer','Details':'details','Timestamp (UTC)':'timestamp'}

def csv_text(value):
    if isinstance(value,str) and value and (value[0] in "'=+-@\t\r\n" or value.lstrip().startswith(('=','+','-','@'))):
        return "'"+value
    return value

def decode_csv(value, version):
    if version==2 and isinstance(value,str) and value.startswith("'"):
        candidate=value[1:]
        if csv_text(candidate)==value:
            return candidate
    return value

def export_file(name, rows, session, format):
    os.makedirs(SESSION_EXPORT_DIR,exist_ok=True)
    extension={'json':'json','csv':'csv','excel':'xlsx'}[format]
    filename='session_'+uuid.uuid4().hex+'.'+extension
    path=os.path.join(SESSION_EXPORT_DIR,filename)
    if format=='json':
        with open(path,'w',encoding='utf-8') as f:
            json.dump({'format_version':2,'session':session,'infringements':rows,'exported_at':iso(datetime.now(timezone.utc))},f,ensure_ascii=False,indent=2)
        return path
    info=[['Session Information'],['Name',session['name']],['Status',session['status']],['Started At (UTC)',session['started_at']],['Qualifying Mode',str(session.get('qualifying_mode',False)).lower()],['Format Version',2],[],['Infringements'],list(FIELDS)]
    data=info+[[inf.get(field) for field in FIELDS.values()] for inf in rows]
    history=[list(HISTORY)]
    for inf in rows:
        for h in inf.get('history',[]):
            history.append([inf['id'],*[h.get(field) for field in list(HISTORY.values())[1:]]])
    if format=='csv':
        with open(path,'w',encoding='utf-8',newline='') as f:
            writer=csv.writer(f)
            for row in data+[[],['Infringement History']]+history:
                writer.writerow([csv_text(x) for x in row])
    else:
        wb=Workbook();ws=wb.active;ws.title='Infringements'
        for sheet,records in ((ws,data),(wb.create_sheet('History'),history)):
            for row in records:
                sheet.append(row)
                for cell in sheet[sheet.max_row]:
                    if isinstance(cell.value,str):
                        cell.data_type='s'
            sheet.freeze_panes='A10' if sheet==ws else 'A2'
            for col in sheet.columns:
                sheet.column_dimensions[col[0].column_letter].width=min(60,max(14,max(len(str(c.value or '')) for c in col)+2))
        wb.save(path)
    return path

def parse_time(value, label):
    if not value:
        return None
    try:
        return utc(value if isinstance(value,datetime) else parser.parse(str(value)))
    except (ValueError,TypeError,OverflowError):
        raise ValueError(f'{label}: invalid date/time')

def boolean(value):
    if value in (True,1,'true','True','1','Yes'):
        return True
    if value in (False,0,None,'','false','False','0','No'):
        return False
    raise ValueError('expected true or false')

def parse_file(path, csv_format):
    if csv_format:
        with open(path,encoding='utf-8-sig',newline='') as f:
            rows=list(csv.reader(f))
        history_rows=[]
    else:
        with zipfile.ZipFile(path) as archive:
            if sum(x.file_size for x in archive.infolist())>50*1024*1024:
                raise ValueError('Workbook expands beyond the 50 MB limit')
        wb=load_workbook(path,read_only=True,data_only=False)
        try:
            if 'Infringements' not in wb.sheetnames:
                raise ValueError("Workbook requires an 'Infringements' sheet")
            ws=wb['Infringements']
            if ws.max_row>MAX_ROWS+25:
                raise ValueError('Maximum 10,000 incidents per import')
            rows=[list(r) for r in ws.iter_rows(values_only=True)]
            history_rows=[]
            if 'History' in wb.sheetnames:
                if wb['History'].max_row>MAX_ROWS*20:
                    raise ValueError('Too many history records')
                history_rows=[list(r) for r in wb['History'].iter_rows(values_only=True)]
        finally:
            wb.close()
    version=1
    for row in rows[:10]:
        if len(row)>1 and row[0]=='Format Version':
            version=int(row[1])
    if csv_format:
        rows=[[decode_csv(v,version) for v in row] for row in rows]
    session={}
    for row in rows[:8]:
        if len(row)<2:
            continue
        key=str(row[0] or '').lower()
        if key=='name':session['name']=str(row[1] or '')
        elif 'started' in key:
            if 'utc' in key or not session.get('started_at'):
                session['started_at']=iso(parse_time(row[1],'Session start'))
        elif key=='qualifying mode':session['qualifying_mode']=boolean(row[1])
    header=next((i for i,r in enumerate(rows[:25]) if r and str(r[0]).upper() in ('ID','KART NUMBER')),None)
    if header is None:
        raise ValueError('Missing infringements column headings')
    headings=rows[header];infringements=[];seen=set()
    for index,row in enumerate(rows[header+1:],header+2):
        if row and row[0]=='Infringement History':
            history_rows=rows[index:];break
        if not any(x not in (None,'') for x in row):continue
        if len(infringements)>=MAX_ROWS:raise ValueError('Maximum 10,000 incidents per import')
        raw={FIELDS[h]:row[j] for j,h in enumerate(headings) if h in FIELDS and j<len(row)}
        # Legacy files have local/reference columns; prefer explicit UTC values.
        for dest,old in (('timestamp','Timestamp'),('penalty_taken','Penalty Taken')):
            if not raw.get(dest) and old in headings:
                raw[dest]=row[headings.index(old)]
        try:
            numeric=raw.get('kart_number')
            if numeric is None or str(numeric).strip()=='' or float(numeric)!=int(float(numeric)):
                raise ValueError('kart number must be a whole number')
            raw['kart_number']=int(numeric)
            raw['timestamp']=parse_time(raw.get('timestamp'),f'Row {index} incident time')
            payload=InfringementCreate(**{k:v for k,v in raw.items() if k in InfringementCreate.model_fields})
            raw.update(payload.model_dump(exclude={'performed_by','request_id','session_name'}))
            raw['id']=int(raw.get('id') or len(infringements)+1)
            if raw['id'] in seen:raise ValueError('duplicate incident ID')
            seen.add(raw['id'])
            raw['description']=raw.get('description') or ''
            raw['warning_count']=int(raw.get('warning_count') or 0)
            if not 0<=raw['warning_count']<=10000:raise ValueError('warning count out of range')
            raw['penalty_due']=raw.get('penalty_due') or 'No'
            if raw['penalty_due'] not in ('Yes','No'):raise ValueError('penalty due must be Yes or No')
            raw['penalty_taken']=parse_time(raw.get('penalty_taken'),'Penalty service time')
            raw['deleted_at']=parse_time(raw.get('deleted_at'),'Deletion time')
            raw['review_required']=boolean(raw.get('review_required'))
            if raw['penalty_taken'] and raw['penalty_due']=='Yes':raise ValueError('served penalty cannot also be pending')
            if not raw.get('penalty_origin'):
                automatic=kind(raw['description']) and (raw.get('penalty_description')=='Warning' or (raw.get('penalty_description')=='5 sec Stop & Go' and raw['warning_count']>=3))
                raw['penalty_origin']='automatic' if automatic else 'manual'
                raw['requested_penalty']='Warning' if automatic else raw.get('penalty_description')
            if raw['penalty_origin'] not in ('automatic','manual'):raise ValueError('invalid penalty origin')
            raw['history']=[];infringements.append(raw)
        except (ValueError,TypeError,ValidationError,OverflowError) as exc:
            if isinstance(exc,ValidationError):
                message='; '.join(f"{'.'.join(map(str,e['loc']))}: {e['msg']}" for e in exc.errors())
            else:message=str(exc)
            raise ValueError(f'Row {index}: {message}')
    by_id={x['id']:x for x in infringements}
    if history_rows:
        head=next((i for i,r in enumerate(history_rows[:10]) if r and r[0]=='Infringement ID'),None)
        if head is None:raise ValueError('Missing history column headings')
        for index,row in enumerate(history_rows[head+1:],head+2):
            if not any(x not in (None,'') for x in row):continue
            headings=history_rows[head]
            hist={HISTORY[h]:row[j] for j,h in enumerate(headings) if h in HISTORY and j<len(row)}
            try:
                ident=int(hist['infringement_id'])
                if ident not in by_id:raise ValueError('history references an unknown incident')
                if not hist.get('action'):raise ValueError('missing action')
                hist['timestamp']=parse_time(hist.get('timestamp'),'History time')
                hist['kart_number']=int(hist.get('kart_number') or by_id[ident]['kart_number'])
                by_id[ident]['history'].append(hist)
            except (ValueError,KeyError,TypeError) as exc:
                raise ValueError(f'History row {index}: {exc}')
    return {'session_info':session,'infringements':infringements}
