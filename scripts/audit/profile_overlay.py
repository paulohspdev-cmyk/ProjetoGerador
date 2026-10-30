"""Profile product normalization only, with 100 unbound synthetic records."""
import cProfile
import json
import os
import pstats
import sys
import tempfile
import time
from pathlib import Path
BASE=Path(__file__).resolve().parents[2]
tmp=tempfile.TemporaryDirectory(prefix='rc-overlay-profile-')
root=Path(tmp.name)
for k,v in {'RC_ENVIRONMENT':'development','RC_DATA_DIR':str(root),'RC_DB_FILE':str(root/'test.db'),'RC_RAPID_BINDINGS':str(root/'bindings.json'),'RC_BRIDGE_STATUS_FILE':str(root/'bridge.json'),'RC_RAPID_READER':str(root/'missing.dll'),'RC_RAPID_SCADA_ROOT':str(root/'scada')}.items():os.environ[k]=v
(root/'bindings.json').write_text('[]')
sys.path.insert(0,str(BASE/'backend'))
from app import db,domain_store
from app.rapid import overlay_generators
db.init_db();domain_store.init_domain_db()
for n in range(100):db.create_generator({'tag':'PROFILE'+str(n),'name':'Synthetic','site':'Isolated','controller_type':'COMAP','controller_model':'InteliGen 200','transport':'modbus_rtu_serial','host':'/dev/ttyPROFILE'+str(n)})
p=cProfile.Profile();start=time.perf_counter();p.enable();rows=overlay_generators(db.list_generators());p.disable();elapsed=time.perf_counter()-start
s=pstats.Stats(p)
top=[]
for (filename,line,name),values in sorted(s.stats.items(),key=lambda x:x[1][3],reverse=True)[:20]:
    top.append({'function':Path(filename).name+':'+name,'line':line,'calls':values[1],'cumulative_seconds':round(values[3],4)})
result={'records':len(rows),'elapsed_seconds':round(elapsed,4),'kind':'CPU profile with unbound fixtures; not Rapid field performance','top_cumulative':top}
(BASE/'docs/audit/system-2026-10-14/overlay_profile.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
