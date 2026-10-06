"""Capture actual outage/recovery/restart assertions for the disposable instance."""
import sys,json
from pathlib import Path
from regression_api import req
OUT=Path(__file__).parent

def snapshot():
 sessions=req('GET','/session/')[1]['sessions'];active=next(x['name'] for x in sessions if x['status']=='active')
 data=req('GET','/infringements/?limit=1000')[1];items=data['items']
 for page in range(2,data['total_pages']+1):items+=req('GET',f'/infringements/?limit=1000&page={page}')[1]['items']
 return {'session':active,'rows':items,'total':data['total']}
mode=sys.argv[1];file=OUT/'regression-ops-results.json';results=json.loads(file.read_text()) if file.exists() else []
def check(name,ok,e=None):results.append({'name':name,'status':'PASS' if ok else 'FAIL','evidence':e});print(name,results[-1]['status'])
if mode=='baseline':
 (OUT/'restart-baseline.json').write_text(json.dumps(snapshot(),indent=2));results=[]
elif mode=='outage':
 for endpoint in ['/api/health','/api/ready']:
  status,body=req('GET',endpoint);check(endpoint+' reports database outage',status==503 and body=={'status':'unavailable'},{'status':status,'body':body})
 check('Liveness remains available during DB outage',req('GET','/api/live')[0]==200)
 status,body=req('GET','/session/');check('Outage errors remain generic',status==503 and not any(x in json.dumps(body).lower() for x in ['password','select ','psycopg2','connection refused']),{'status':status,'body':body})
elif mode=='recovery':
 check('Database readiness recovers',req('GET','/api/ready')[0]==200)
 check('Database recovery preserves session and records',snapshot()==json.loads((OUT/'restart-baseline.json').read_text()))
elif mode=='restart':
 after=snapshot();check('API restart restores active session and every record',after==json.loads((OUT/'restart-baseline.json').read_text()),{'session':after['session'],'records':after['total']})
file.write_text(json.dumps(results,indent=2))
if any(x['status']=='FAIL' for x in results):raise SystemExit(1)
