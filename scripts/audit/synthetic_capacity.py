"""Limited synthetic API benchmark: no Rapid hardware, snapshots or industrial writes."""
import json
import os
import statistics
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE=Path(__file__).resolve().parents[2]
tmp=tempfile.TemporaryDirectory(prefix='rc-synthetic-capacity-')
root=Path(tmp.name)
for k,v in {'RC_ENVIRONMENT':'development','RC_DATA_DIR':str(root),'RC_DB_FILE':str(root/'test.db'),'RC_RAPID_BINDINGS':str(root/'bindings.json'),'RC_BRIDGE_STATUS_FILE':str(root/'bridge.json'),'RC_RAPID_READER':str(root/'missing.dll'),'RC_RAPID_SCADA_ROOT':str(root/'scada'),'RC_SMTP_HOST':'','RC_WHATSAPP_API_URL':'','RC_2FA_ENFORCED':'0','RC_ADMIN_PASSWORD':'','RC_AUTH_COOKIE_SECURE':'0'}.items():os.environ[k]=v
(root/'bindings.json').write_text('[]')
sys.path.insert(0,str(BASE/'backend'))
from fastapi.testclient import TestClient
from app import auth,db
from app.main import app
measurements=[]
with TestClient(app) as c:
    u=db.bootstrap_admin('Isolated','audit@example.invalid',auth.hash_password('Synthetic-Only-123'))[0]
    token='synthetic-only-token';db.create_session(auth.token_hash(token),u['id'],int(time.time())+600)
    headers={'Cookie':'rc_session='+token}
    inserted=0
    for count in [17,100]:
        while inserted<count:
            inserted+=1
            db.create_generator({'tag':'SYN'+str(inserted),'name':'Synthetic '+str(inserted),'site':'Isolated','controller_type':'COMAP','controller_model':'InteliGen 200','transport':'modbus_rtu_serial','host':'/dev/ttySYN'+str(inserted)})
        def request(_):
            start=time.perf_counter();r=c.get('/api/generators',headers=headers);elapsed=time.perf_counter()-start
            assert r.status_code==200 and len(r.json())==count
            return elapsed*1000,len(r.content)
        samples=list(ThreadPoolExecutor(max_workers=4).map(request,range(4)))
        durations=sorted(x[0] for x in samples)
        measurements.append({'generators':count,'concurrency':4,'requests':4,'median_ms':round(statistics.median(durations),2),'maximum_ms':round(durations[-1],2),'response_bytes':samples[-1][1],'http_errors':0})
        (BASE/'docs/audit/system-2026-10-14/synthetic_capacity_partial.json').write_text(json.dumps({'measurements':measurements,'kind':'partial synthetic probe; not capacity certification'},ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(measurements[-1]),flush=True)
        if durations[-1]>15000:
            break
result={'baseline':'afec24a','kind':'synthetic in-process API only','measurements':measurements,'limits':['No industrial channels, Rapid collection, physical modem, network latency or snapshot contention','Four requests at each size are not a production capacity certification','Stops expanding fleet when maximum response exceeds 15 seconds; no p95 inferred from four samples','No endurance, fleet realism or production load was tested','Initial 20-request probe was interrupted due to long execution; no latency fabricated from that incomplete run','Probe timing can be affected by concurrent audit work in this local runtime']}
(BASE/'docs/audit/system-2026-10-14/synthetic_capacity.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
