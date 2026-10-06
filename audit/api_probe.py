"""Run only against a disposable Racelith instance; creates and deletes test sessions."""
import io, json, os, urllib.request, urllib.error, urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from openpyxl import load_workbook

BASE = os.environ.get('AUDIT_API', 'http://127.0.0.1:8000')
if os.environ.get('RACELITH_AUDIT_DISPOSABLE') != '1':
    raise SystemExit('Set RACELITH_AUDIT_DISPOSABLE=1 only for the disposable audit instance.')
OUT = Path(__file__).parent
results = []

def req(method, path, data=None, headers=None, raw=False):
    body = json.dumps(data).encode() if data is not None else None
    h = {'Content-Type': 'application/json', **(headers or {})}
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE+path, body, h, method=method), timeout=30) as r:
            b = r.read()
            return r.status, b if raw else json.loads(b), dict(r.headers)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: b = json.loads(b)
        except: b = b.decode()
        return e.code, b, dict(e.headers)

def record(name, ok, evidence):
    results.append({'name': name, 'status': 'PASS' if ok else 'FAIL', 'evidence': evidence})
    print(json.dumps(results[-1]), flush=True)

def start(name):
    return req('POST', '/session/start?'+urllib.parse.urlencode({'name':name}))

def create(kart, desc='White Line Infringement', penalty='Warning', **kw):
    return req('POST','/infringements/',dict(kart_number=kart,description=desc,penalty_description=penalty,observer='Audit',**kw))

def edit(inf, penalty=None):
    return req('PUT',f"/infringements/{inf['id']}",dict(kart_number=inf['kart_number'],description=inf['description'],penalty_description=penalty or inf['penalty_description'],observer='Edited observer'))

def upload(filename, content):
    boundary='racelithAuditBoundary'
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE+'/session/import',body,{'Content-Type':f'multipart/form-data; boundary={boundary}'},method='POST')) as r:
            return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code,json.loads(e.read())

s,b,_=req('POST','/infringements/',{'kart_number':1})
record('Reject writes without active session',s==400,{'status':s,'record':b})
s,b,_=start('Audit Main')
record('Create session',s==200,{'status':s,'response':b})
s,b,_=req('PUT','/api/config',{'warning_expiry_minutes':181},headers={'Origin':'https://untrusted.example'})
record('Configuration requires authorization and restricts origin',s in (401,403),{'status':s,'response':b,'cors':req('GET','/api/config',headers={'Origin':'https://untrusted.example'})[2].get('access-control-allow-origin')})
req('PUT','/api/config',{'warning_expiry_minutes':180})
cycle=[create(42)[1] for _ in range(4)]
record('Three warnings trigger penalty and fourth resets cycle',[(i['warning_count'],i['penalty_due']) for i in cycle]==[(1,'No'),(2,'No'),(3,'Yes'),(1,'No')],[(i['warning_count'],i['penalty_due']) for i in cycle])
third=cycle[2]
s,b,_=req('POST',f"/penalties/apply_individual/{third['id']}",{'performed_by':'Audit'})
record('Apply individual penalty',s==200,{'status':s,'response':b})
record('Reject repeated apply',req('POST',f"/penalties/apply_individual/{third['id']}",{'performed_by':'Audit'})[0]==400,'second request')
white=create(43,penalty='10 Sec')[1]
s,b,_=edit(white)
record('White-line edit preserves chosen penalty',b.get('penalty_description')=='10 Sec',{'before':white,'after':b})
yellow=create(44,'Yellow Zone Infringement','10 Sec')[1]
s,b,_=edit(yellow)
record('Yellow-zone edit preserves chosen penalty',b.get('penalty_description')=='10 Sec',{'before':yellow,'after':b})
applied=create(45,'Contact','10 Sec')[1]
req('POST',f"/penalties/apply_individual/{applied['id']}",{'performed_by':'Audit'})
s,b,_=edit(applied)
record('Editing served penalty does not make it pending again',b.get('penalty_due')=='No',{'after':b,'pending_ids':[i['id'] for i in req('GET','/penalties/pending')[1]]})
warnings=[create(46)[1] for _ in range(3)]
req('DELETE',f"/infringements/{warnings[0]['id']}")
rows=req('GET','/infringements/')[1]['items']
remaining=[i for i in rows if i['kart_number']==46]
record('Deleting warning recalculates dependent penalty',all(i['penalty_due']=='No' for i in remaining),remaining)
record('Deleted record audit retained',any(i['action']=='deleted' for i in req('GET','/history/46')[1]),req('GET','/history/46')[1])
s,b,_=create(-99,'Contact','10 Sec',performed_by='Impersonated administrator')
record('Reject negative kart and forged attribution',s==422,{'status':s,'record':b})
future=datetime.now(timezone.utc)+timedelta(days=30)
f=create(47,timestamp=future.isoformat())[1]
present=create(47)[1]
record('Future warning does not count toward current event',present['warning_count']==1,{'future':f,'present':present})
formula=create(48,'=1+1','Warning')[1]
s,xlsx,_=req('GET','/session/export?name=Audit%20Main&format=excel',raw=True)
(OUT/'export.xlsx').write_bytes(xlsx)
wb=load_workbook(io.BytesIO(xlsx),data_only=False)
cells=[{'sheet':ws.title,'cell':c.coordinate,'value':c.value,'type':c.data_type} for ws in wb for row in ws for c in row if c.value=='=1+1']
record('Excel export keeps user values as text',all(c['type']!='f' for c in cells),cells)
s,csv,_=req('GET','/session/export?name=Audit%20Main&format=csv',raw=True)
(OUT/'export.csv').write_bytes(csv)
record('CSV export neutralizes formulas',b'=1+1' not in csv or b"'=1+1" in csv,'raw formula in exported CSV' if b'=1+1' in csv else 'none')
s,j,_=req('GET','/session/export?name=Audit%20Main&format=json')
record('JSON export includes records',s==200 and len(j['infringements'])>0,{'status':s,'count':len(j['infringements'])})
wb['Infringements']['B2']='Audit Imported'
buf=io.BytesIO(); wb.save(buf)
s,b=upload('audit.xlsx',buf.getvalue())
record('Excel import round trip',s==200 and b['imported']['infringements']==len(j['infringements']),{'status':s,'response':b})
csv2=csv.replace(b'Name,Audit Main',b'Name,Audit CSV')
s,b=upload('audit.csv',csv2)
record('CSV import round trip',s==200,{'status':s,'response':b})
s,b=upload('audit.xls',b'not an xlsx workbook')
record('Reject malformed spreadsheet upload',s==400,{'status':s,'response':b})
s,b,_=start('Race Day 2024-01-15')
record('Documented hyphenated session name accepted',s==200,{'status':s,'response':b})
start('Audit Isolation')
create(99,'Contact','Warning')
req('POST','/session/load?name=Audit%20Main')
record('Load restores isolated session data',all(i['kart_number']!=99 for i in req('GET','/infringements/')[1]['items']),'kart 99 remains in Audit Isolation')
req('POST','/session/close?name=Audit%20Main')
s,b,_=create(100,'Contact','Warning')
record('Closed session rejects further writes',s==400,{'status':s,'response':b})
req('POST','/session/load?name=Audit%20Isolation')
s,b,_=req('DELETE','/session/delete?name=AUDIT%20ISOLATION')
sessions=req('GET','/session/')[1]['sessions']
record('Case alias cannot destroy another named session',s in (400,404),{'status':s,'remaining_sessions':sessions,'read_after_delete':req('GET','/infringements/')[0]})
req('POST','/session/load?name=Audit%20Main')
start('Audit Browser')
(OUT/'api-results.json').write_text(json.dumps(results,indent=2))
print('RESULTS',sum(i['status']=='PASS' for i in results),'passed',sum(i['status']=='FAIL' for i in results),'failed')
