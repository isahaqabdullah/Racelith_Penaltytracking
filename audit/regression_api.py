"""Real HTTP/PostgreSQL regressions. Disposable instance only; no authentication assertions."""
import io,json,os,urllib.request,urllib.error,urllib.parse,csv,uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone,timedelta
from pathlib import Path
from openpyxl import load_workbook
if os.getenv('RACELITH_AUDIT_DISPOSABLE')!='1':raise SystemExit('Disposable instance required')
BASE=os.getenv('AUDIT_API','http://127.0.0.1:8000');OUT=Path(__file__).parent;results=[]
def req(method,path,data=None,headers=None,raw=False):
 body=json.dumps(data).encode() if data is not None else None
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,body,{'Content-Type':'application/json',**(headers or {})},method=method),timeout=45) as r:
   b=r.read();return r.status,b if raw else json.loads(b)
 except urllib.error.HTTPError as e:
  return e.code,json.loads(e.read())
def check(name,ok,evidence=None):
 results.append(dict(name=name,status='PASS' if ok else 'FAIL',evidence=evidence));print(name,results[-1]['status'],flush=True)
def session(action,name):return req('POST','/session/'+action+'?'+urllib.parse.urlencode({'name':name}))
def create(kart,desc='White Line Infringement',penalty='Warning',**kw):
 s,b=req('POST','/infringements/',dict(kart_number=kart,description=desc,penalty_description=penalty,observer='Regression',**kw))
 if s!=200:raise RuntimeError((s,b))
 return b
def rows(kart=None):return req('GET','/infringements/?limit=1000'+(f'&kart_number={kart}' if kart else ''))[1]['items']
def edit(i,**kw):return req('PUT',f"/infringements/{i['id']}",{'kart_number':i['kart_number'],**kw})
def upload(name,content):
 boundary='regressionMultipart';body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+'/session/import',body,{'Content-Type':f'multipart/form-data; boundary={boundary}'},method='POST'),timeout=45) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def run():
 log_offset=Path('/tmp/racelith-e2e/fixed-backend.log').stat().st_size
 main='Fixed API '+uuid.uuid4().hex[:8]
 check('Database-aware readiness',req('GET','/api/ready')[0]==200)
 check('Create hyphenated session',session('start',main+'-Race')[0]==200)
 main+='-Race'
 cycle=[create(42) for _ in range(4)]
 check('Three warnings then fresh cycle',[(x['warning_count'],x['penalty_due']) for x in cycle]==[(1,'No'),(2,'No'),(3,'Yes'),(1,'No')],cycle)
 check('UTC API timestamps',[x['timestamp'].endswith('Z') for x in rows(42)]==[True]*4)
 for k,d in [(43,'White Line Infringement'),(44,'Yellow Zone Infringement'),(45,'Contact')]:
  i=create(k,d,'10 Sec');s,b=edit(i,observer='Edited',penalty_description='10 Sec')
  check(f'Chosen penalty preserved on metadata edit {k}',s==200 and b['penalty_description']=='10 Sec' and b['penalty_due']=='Yes',b)
  req('POST',f"/penalties/apply_individual/{i['id']}",{'performed_by':'Regression'})
  s,b=edit(i,observer='Served edit',penalty_description='10 Sec')
  check(f'Served penalty preserved {k}',s==200 and b['penalty_taken'] and b['penalty_due']=='No',b)
  check(f'Served penalty replacement rejected {k}',edit(i,penalty_description='20 Sec')[0]==409)
  check(f'Repeated penalty application rejected {k}',req('POST',f"/penalties/apply_individual/{i['id']}",{'performed_by':'Regression'})[0]==400)
 for action,k in [('delete',46),('edit',47),('move',48)]:
  seq=[create(k) for _ in range(3)]
  if action=='delete':req('DELETE',f"/infringements/{seq[0]['id']}")
  elif action=='edit':edit(seq[0],description='Contact',penalty_description='Warning')
  else:edit(seq[0],kart_number=49)
  check(f'{action} warning recalculates remaining cycle',all(x['penalty_due']=='No' for x in rows(k)),rows(k))
  check(f'{action} warning retains audit',len(req('GET',f'/history/{k}')[1])>=3)
 seq=[create(50) for _ in range(3)];req('POST',f"/penalties/apply_individual/{seq[2]['id']}",{'performed_by':'Regression'})
 req('DELETE',f"/infringements/{seq[0]['id']}")
 served=next(x for x in rows(50) if x['id']==seq[2]['id'])
 check('Corrected served automatic penalty flagged for review',served['review_required'] and served['penalty_taken'] and served['penalty_due']=='No',served)
 s,b=edit(seq[2],description='Contact',penalty_description=served['penalty_description'])
 check('Served automatic penalty survives incident-type correction',s==200 and b['penalty_description']=='5 sec Stop & Go' and b['penalty_taken'] and b['review_required'],b)
 same=datetime.now(timezone.utc).isoformat();equal=[create(61,timestamp=same) for _ in range(4)]
 check('Equal timestamp cycle uses ID tie-break',[(x['warning_count'],x['penalty_due']) for x in equal]==[(1,'No'),(2,'No'),(3,'Yes'),(1,'No')])
 create(62);past=create(62,timestamp=(datetime.now(timezone.utc)-timedelta(minutes=10)).isoformat())
 check('Backdated incident excludes later warnings',past['warning_count']==1 and sorted(x['warning_count'] for x in rows(62))==[1,2])
 contact=create(63,'Contact','Warning');edit(contact,description='White Line Infringement',penalty_description='Warning')
 check('Changing a warning to white-line joins automatic cycle',create(63)['warning_count']==2)
 seq=[create(51),create(51,'Yellow Zone Infringement'),create(51)]
 check('White and yellow cycles remain separate',seq[1]['warning_count']==1 and seq[2]['warning_count']==2)
 old=datetime.now(timezone.utc)-timedelta(minutes=181)
 create(52,timestamp=old.isoformat());check('Expired warnings excluded',create(52)['warning_count']==1)
 future=datetime.now(timezone.utc)+timedelta(days=1)
 check('Future incident rejected',req('POST','/infringements/',{'kart_number':53,'timestamp':future.isoformat()})[0]==422)
 for k in [-1,0,2147483648]:check(f'Invalid kart {k} rejected',req('POST','/infringements/',{'kart_number':k})[0]==422)
 check('Invalid pagination rejected',req('GET','/infringements/?page=0&limit=1001')[0]==422)
 check('Invalid expiry rejected',req('PUT','/api/config',{'warning_expiry_minutes':1441})[0]==422)
 key=uuid.uuid4().hex;one=create(54,request_id=key);two=create(54,request_id=key)
 check('Retried write returns original record',one['id']==two['id'] and len(rows(54))==1)
 check('Reused request key with changed data rejected',req('POST','/infringements/',{'kart_number':55,'request_id':key})[0]==409)
 with ThreadPoolExecutor(max_workers=8) as ex:seq=list(ex.map(lambda _:create(56),range(6)))
 check('Concurrent warnings serialize correctly',sorted((x['warning_count'],x['penalty_due']) for x in seq)==sorted([(1,'No'),(2,'No'),(3,'Yes')]*2),seq)
 pair=[create(57,'Contact','10 Sec'),create(57,'Contact','20 Sec')]
 with ThreadPoolExecutor(max_workers=24) as ex:burst=list(ex.map(lambda _:create(64),range(24)))
 check('Burst above connection pool size completes without deadlock',len(burst)==24 and sum(x['penalty_due']=='Yes' for x in burst)==8)
 check('Bulk apply succeeds',req('POST','/penalties/apply/57',{'performed_by':'Regression'})[0]==200)
 check('Bulk apply records per-incident history',len([h for h in req('GET','/history/57')[1] if h['action']=='penalty_applied'])==2)
 check('Backend kart search before pagination',req('GET','/infringements/?kart_number=42&limit=1')[1]['total']==4)
 check('Page beyond end clamps',req('GET','/infringements/?page=999&limit=10')[1]['page']==req('GET','/infringements/?limit=10')[1]['total_pages'])
 blank=create(58,'','Warning');formula=create(59,'=1+1','Warning');create(60,"'literal",'Warning')
 # Both supported interchange formats preserve blank text, literal formulas, service records and deleted history.
 exported=req('GET','/session/export?'+urllib.parse.urlencode({'name':main,'format':'json'}))[1]
 expected=len(exported['infringements'])
 for fmt in ['excel','csv']:
  s,b=req('GET','/session/export?'+urllib.parse.urlencode({'name':main,'format':fmt}),raw=True)
  check(fmt+' export',s==200)
  target=main+' '+fmt
  if fmt=='excel':
   wb=load_workbook(io.BytesIO(b));cells=[c for ws in wb for row in ws for c in row if c.value=='=1+1'];check('Excel formula is literal text',bool(cells) and all(c.data_type=='s' for c in cells))
   wb['Infringements']['B2']=target;f=io.BytesIO();wb.save(f);content=f.getvalue();filename='fixed.xlsx'
  else:
   check('CSV formula escaped',b"'=1+1" in b);content=b.replace(('Name,'+main).encode(),('Name,'+target).encode());filename='fixed.csv'
  (OUT/('fixed-export.'+('xlsx' if fmt=='excel' else 'csv'))).write_bytes(content)
  s,b=upload(filename,content);check(fmt+' round trip preserves all records',s==200 and b.get('imported',{}).get('infringements')==expected,b)
  if s==200:
   imported=rows();check(fmt+' preserves blank description and literal formula',any(x['kart_number']==58 and x['description']=='' for x in imported) and any(x['kart_number']==59 and x['description']=='=1+1' for x in imported))
   check(fmt+' retains deletion history',any(x['action']=='deleted' for x in req('GET','/history/46')[1]))
   check(fmt+' retains served penalties',all(x['penalty_due']=='No' and x['penalty_taken'] for x in imported if x['kart_number']==45))
  session('load',main)
 invalid=content if fmt=='csv' else b''
 invalid=invalid.replace(('Name,'+main+' csv').encode(),b'Name,Rejected Import')
 lines=list(csv.reader(io.StringIO(invalid.decode())));lines[9][1]='-5';f=io.StringIO();csv.writer(f).writerows(lines)
 s,b=upload('invalid.csv',f.getvalue().encode());check('Invalid import reports rejected row',s==400 and 'Row 10' in b.get('detail',''),b)
 check('Failed import leaves active session untouched',next(x for x in req('GET','/session/')[1]['sessions'] if x['status']=='active')['name']==main)
 check('Failed import leaves no visible session',all(x['name']!='Rejected Import' for x in req('GET','/session/')[1]['sessions']))
 check('Legacy XLS rejected explicitly',upload('old.xls',b'bad')[0]==400)
 check('Oversized upload rejected',upload('large.csv',b'x'*(10*1024*1024+1))[0]==413)
 # Different display names can no longer alias a physical DB.
 alias=main.replace(' ','_');check('Alias cannot delete actual session',req('DELETE','/session/delete?'+urllib.parse.urlencode({'name':alias}))[0]==404)
 check('Original session survives alias attempt',len(rows(42))==4)
 other=main+' Other';session('start',other);create(99,'Contact','Warning')
 stale={'X-Session-Name':urllib.parse.quote(main)}
 check('Stale create/edit/delete/apply rejected',all(req(m,p,d,headers=stale)[0]==409 for m,p,d in [('POST','/infringements/',{'kart_number':1}),('PUT','/infringements/1',{'kart_number':1}),('DELETE','/infringements/1',None),('POST','/penalties/apply_individual/1',{'performed_by':'Regression'})]))
 req('GET','/session/export?'+urllib.parse.urlencode({'name':main,'format':'json'}))
 check('Export of another session does not switch writes',create(98,'Contact','Warning')['session_name']==other and all(x['kart_number']!=42 for x in rows()))
 for bad in [' Leading','Trailing ','Double  Space','1Invalid','X'*60,"SQL';--"]:check('Invalid name rejected '+repr(bad),session('start',bad)[0]==400)
 session('close',other);check('Closed session rejects writes',req('POST','/infringements/',{'kart_number':1})[0]==400)
 session('load',main);check('Load preserves isolated records',all(x['kart_number'] not in (98,99) for x in rows()))
 check('Export temporary files cleaned',not list(Path('/tmp/racelith-e2e/exports').glob('session_*')))
 check('No unexpected SQL errors in valid flows','ERROR:' not in Path('/tmp/racelith-e2e/fixed-backend.log').read_text()[log_offset:])
if __name__=='__main__':
 try:run()
 finally:(OUT/'regression-api-results.json').write_text(json.dumps(results,indent=2,default=str))
 if any(x['status']=='FAIL' for x in results):raise SystemExit(1)
