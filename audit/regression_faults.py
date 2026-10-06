"""Database-backed failure, legacy migration, and cleanup tests; disposable only."""
import os,json,uuid
from pathlib import Path
from urllib.parse import urlencode
import psycopg2
from regression_api import req,session,create,upload,rows
OUT=Path(__file__).parent;results=[]
def check(name,ok,e=None):results.append(dict(name=name,status='PASS' if ok else 'FAIL',evidence=e));print(name,results[-1]['status'],flush=True)
def conn(database='audit_fixed'):
 c=psycopg2.connect(host='127.0.0.1',port=55439,user='audit_user',dbname=database);c.autocommit=True;return c
def physical(name):
 with conn() as c:
  with c.cursor() as cur:cur.execute('SELECT database_name FROM sessions WHERE name=%s',(name,));return cur.fetchone()[0]
def dbnames():
 with conn() as c:
  with c.cursor() as cur:cur.execute("SELECT datname FROM pg_database WHERE datname LIKE 'race_%'");return set(x[0] for x in cur.fetchall())
name='Fault Test '+uuid.uuid4().hex[:8];session('start',name);create(500,'Contact','10 Sec');phys=physical(name)
with conn(phys) as c:
 with c.cursor() as cur:
  cur.execute("CREATE FUNCTION reject_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'sensitive SQL audit fixture'; END $$ LANGUAGE plpgsql")
  cur.execute('CREATE TRIGGER reject_audit BEFORE INSERT ON infringement_history FOR EACH ROW EXECUTE FUNCTION reject_audit()')
s,b=req('POST','/infringements/',{'kart_number':501,'description':'Contact'})
check('Incident and history roll back together',s==503 and len(rows())==1,b)
check('Database errors do not leak SQL',s==503 and 'SQL' not in json.dumps(b) and 'sensitive' not in json.dumps(b),b)
with conn(phys) as c:
 with c.cursor() as cur:cur.execute('DROP TRIGGER reject_audit ON infringement_history')
# Existing race DB is upgraded additively when first loaded.
legacy='Legacy '+uuid.uuid4().hex[:8];dbname=legacy.lower().replace(' ','_')+'_db'
c=conn('postgres');cur=c.cursor();cur.execute('CREATE DATABASE '+dbname);cur.close();c.close()
with conn(dbname) as c:
 with c.cursor() as cur:
  cur.execute('CREATE TABLE infringements (id SERIAL PRIMARY KEY, session_name VARCHAR, kart_number INTEGER, turn_number VARCHAR, description VARCHAR, observer VARCHAR, warning_count INTEGER, penalty_due VARCHAR, penalty_description VARCHAR, penalty_taken TIMESTAMPTZ, timestamp TIMESTAMPTZ)')
  cur.execute('CREATE TABLE infringement_history (id SERIAL PRIMARY KEY,session_name VARCHAR,infringement_id INTEGER REFERENCES infringements(id) ON DELETE CASCADE,action VARCHAR,performed_by VARCHAR,observer VARCHAR,details VARCHAR,timestamp TIMESTAMPTZ)')
  cur.execute("INSERT INTO infringements(session_name,kart_number,description,warning_count,penalty_due,penalty_description,penalty_taken,timestamp) VALUES (%s,700,'White Line Infringement',0,'No','5 sec Stop & Go',now(),now())",(legacy,))
  cur.execute("INSERT INTO infringement_history(session_name,infringement_id,action,performed_by,timestamp) VALUES (%s,1,'penalty_applied','Legacy',now())",(legacy,))
with conn() as c:
 with c.cursor() as cur:cur.execute("INSERT INTO sessions(name,status,started_at) VALUES (%s,'closed',now())",(legacy,))
check('Legacy database loads with additive migration',session('load',legacy)[0]==200)
r=rows()[0];s,b=req('PUT','/infringements/1',{'kart_number':700,'observer':'Corrected','penalty_description':'5 sec Stop & Go'})
check('Legacy served penalty retained conservatively',s==200 and b['penalty_taken'] and b['penalty_due']=='No' and b['penalty_description']=='5 sec Stop & Go',b)
check('Legacy audit history retained and kart backfilled',any(h['action']=='penalty_applied' for h in req('GET','/history/700')[1]))
# Cause actual database insertion failure after validation and DB staging.
with conn('template1') as c:
 with c.cursor() as cur:cur.execute('CREATE TABLE infringements (kart_number INTEGER)')
try:
 before=dbnames();fixture=b'Session Information\nName,Staged Failure\n\nInfringements\nID,Kart Number,Description\n1,800,Contact\n'
 s,b=upload('staged.csv',fixture)
 check('Staged database failure leaves no orphan',s==503 and dbnames()==before,b)
 check('Staged failure preserves active legacy session',next(x['name'] for x in req('GET','/session/')[1]['sessions'] if x['status']=='active')==legacy)
finally:
 with conn('template1') as c:
  with c.cursor() as cur:cur.execute('DROP TABLE infringements')
# JSON proof of production port reset; full config includes environment secrets so omit it.
import subprocess
config=json.loads(subprocess.check_output(['docker','compose','-f','docker-compose.yml','-f','docker-compose.prod.yml','config','--format','json']))
check('Production database publishes no ports',not config['services']['db'].get('ports'),config['services']['db'].get('ports',[]))
(OUT/'regression-fault-results.json').write_text(json.dumps(results,indent=2))
if any(x['status']=='FAIL' for x in results):raise SystemExit(1)
